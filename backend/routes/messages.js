const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

const MAX_MESSAGE_LENGTH = 10000;

// Validate UUID format
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Get channel messages — requires channel membership
router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    const { channelId } = req.params;
    if (!isValidUUID(channelId)) return res.status(400).json({ error: 'Invalid channel ID' });

    // Authorization: verify user is a member of the channel (or channel is public in their workspace)
    const memberCheck = await pool.query(
      `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM channels c
         JOIN workspace_members wm ON c.workspace_id = wm.workspace_id
         WHERE c.id = $1 AND wm.user_id = $2 AND c.is_private = false`,
      [channelId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const before = req.query.before;

    let query = `
      SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.parent_id,
        m.content, m.is_edited, m.is_pinned, m.reply_count, m.created_at, m.updated_at,
        u.display_name, u.avatar_url,
        COALESCE(
          (SELECT json_agg(json_build_object('id', r.id, 'emoji', r.emoji, 'user_id', r.user_id, 'display_name', ru.display_name))
           FROM reactions r JOIN users ru ON r.user_id = ru.id WHERE r.message_id = m.id), '[]'
        ) as reactions,
        COALESCE(
          (SELECT json_agg(json_build_object('id', f.id, 'filename', f.filename, 'original_name', f.original_name, 'mime_type', f.mime_type, 'size', f.size, 'url', f.url))
           FROM files f WHERE f.message_id = m.id), '[]'
        ) as files
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = $1 AND m.parent_id IS NULL
    `;
    const params = [channelId];

    if (before) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    // Update last_read
    await pool.query(
      'UPDATE channel_members SET last_read_at = NOW() WHERE channel_id = $1 AND user_id = $2',
      [channelId, req.user.id]
    );

    res.json({ messages: result.rows.reverse() });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send channel message — requires channel membership
router.post('/channel/:channelId', auth, async (req, res) => {
  try {
    const { channelId } = req.params;
    if (!isValidUUID(channelId)) return res.status(400).json({ error: 'Invalid channel ID' });

    const { content, parent_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` });
    }

    // Authorization: verify channel membership
    const memberCheck = await pool.query(
      'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You must be a channel member to send messages' });
    }

    const result = await pool.query(
      `INSERT INTO messages (channel_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [channelId, req.user.id, content.trim(), parent_id || null]
    );

    const message = result.rows[0];

    if (parent_id) {
      await pool.query(
        'UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1',
        [parent_id]
      );
    }

    const full = await pool.query(
      `SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.parent_id,
        m.content, m.is_edited, m.is_pinned, m.reply_count, m.created_at, m.updated_at,
        u.display_name, u.avatar_url
       FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
      [message.id]
    );

    res.status(201).json({ message: { ...full.rows[0], reactions: [], files: [] } });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get DM messages — requires conversation participation
router.get('/dm/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isValidUUID(conversationId)) return res.status(400).json({ error: 'Invalid conversation ID' });

    // Authorization: verify user is a participant
    const participantCheck = await pool.query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const before = req.query.before;

    let query = `
      SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.parent_id,
        m.content, m.is_edited, m.is_pinned, m.reply_count, m.created_at, m.updated_at,
        u.display_name, u.avatar_url,
        COALESCE(
          (SELECT json_agg(json_build_object('id', r.id, 'emoji', r.emoji, 'user_id', r.user_id, 'display_name', ru.display_name))
           FROM reactions r JOIN users ru ON r.user_id = ru.id WHERE r.message_id = m.id), '[]'
        ) as reactions,
        COALESCE(
          (SELECT json_agg(json_build_object('id', f.id, 'filename', f.filename, 'original_name', f.original_name, 'mime_type', f.mime_type, 'size', f.size, 'url', f.url))
           FROM files f WHERE f.message_id = m.id), '[]'
        ) as files
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.conversation_id = $1 AND m.parent_id IS NULL
    `;
    const params = [conversationId];

    if (before) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    await pool.query(
      'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );

    res.json({ messages: result.rows.reverse() });
  } catch (err) {
    console.error('Get DM messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send DM — requires conversation participation
router.post('/dm/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isValidUUID(conversationId)) return res.status(400).json({ error: 'Invalid conversation ID' });

    const { content, parent_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` });
    }

    // Authorization: verify participation
    const participantCheck = await pool.query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [conversationId, req.user.id, content.trim(), parent_id || null]
    );

    if (parent_id) {
      await pool.query('UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1', [parent_id]);
    }

    const full = await pool.query(
      `SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.parent_id,
        m.content, m.is_edited, m.is_pinned, m.reply_count, m.created_at, m.updated_at,
        u.display_name, u.avatar_url
       FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
      [result.rows[0].id]
    );

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    res.status(201).json({ message: { ...full.rows[0], reactions: [], files: [] } });
  } catch (err) {
    console.error('Send DM error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get thread messages — verify access to parent message's channel/conversation
router.get('/thread/:parentId', auth, async (req, res) => {
  try {
    if (!isValidUUID(req.params.parentId)) return res.status(400).json({ error: 'Invalid message ID' });

    // Get parent message to check access
    const parent = await pool.query('SELECT channel_id, conversation_id FROM messages WHERE id = $1', [req.params.parentId]);
    if (parent.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });

    const { channel_id, conversation_id } = parent.rows[0];

    // Authorization check
    if (channel_id) {
      const check = await pool.query(
        `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM channels c JOIN workspace_members wm ON c.workspace_id = wm.workspace_id
           WHERE c.id = $1 AND wm.user_id = $2 AND c.is_private = false`,
        [channel_id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    } else if (conversation_id) {
      const check = await pool.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
        [conversation_id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.parent_id,
        m.content, m.is_edited, m.is_pinned, m.reply_count, m.created_at, m.updated_at,
        u.display_name, u.avatar_url,
        COALESCE(
          (SELECT json_agg(json_build_object('id', r.id, 'emoji', r.emoji, 'user_id', r.user_id, 'display_name', ru.display_name))
           FROM reactions r JOIN users ru ON r.user_id = ru.id WHERE r.message_id = m.id), '[]'
        ) as reactions,
        COALESCE(
          (SELECT json_agg(json_build_object('id', f.id, 'filename', f.filename, 'original_name', f.original_name, 'mime_type', f.mime_type, 'size', f.size, 'url', f.url))
           FROM files f WHERE f.message_id = m.id), '[]'
        ) as files
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = $1 OR m.parent_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.parentId]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Toggle reaction
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji || emoji.length > 50) return res.status(400).json({ error: 'Valid emoji is required' });

    const existing = await pool.query(
      'SELECT id FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [req.params.id, req.user.id, emoji]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM reactions WHERE id = $1', [existing.rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
        [req.params.id, req.user.id, emoji]
      );
    }

    const reactions = await pool.query(
      `SELECT r.*, u.display_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = $1`,
      [req.params.id]
    );

    res.json({ reactions: reactions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle reaction' });
  }
});

// Edit message — only own messages, with length limit
router.patch('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` });
    }

    const result = await pool.query(
      `UPDATE messages SET content = $1, is_edited = true, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING id, content, is_edited, updated_at`,
      [content.trim(), req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete message — only own messages
router.delete('/:id', auth, async (req, res) => {
  try {
    const msg = await pool.query(
      'SELECT id, parent_id, channel_id, conversation_id FROM messages WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    if (msg.rows[0].parent_id) {
      await pool.query('UPDATE messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1', [msg.rows[0].parent_id]);
    }

    await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Pin/unpin message — requires channel membership
router.post('/:id/pin', auth, async (req, res) => {
  try {
    // Get the message and verify channel access
    const msg = await pool.query('SELECT channel_id, conversation_id FROM messages WHERE id = $1', [req.params.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const { channel_id } = msg.rows[0];
    if (channel_id) {
      const memberCheck = await pool.query(
        'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
        [channel_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Channel membership required to pin messages' });
      }
    }

    const result = await pool.query(
      'UPDATE messages SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING id, is_pinned',
      [req.params.id]
    );
    res.json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Search messages — only within user's workspace channels
router.get('/search/:workspaceId', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    if (!isValidUUID(req.params.workspaceId)) return res.status(400).json({ error: 'Invalid workspace ID' });

    // Verify workspace membership
    const wsCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.params.workspaceId, req.user.id]
    );
    if (wsCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT m.id, m.channel_id, m.conversation_id, m.user_id, m.content, m.created_at,
        u.display_name, u.avatar_url, c.name as channel_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       LEFT JOIN channels c ON m.channel_id = c.id
       WHERE (m.channel_id IN (SELECT id FROM channels WHERE workspace_id = $1)
              OR m.conversation_id IN (SELECT id FROM conversations WHERE workspace_id = $1))
         AND to_tsvector('english', m.content) @@ plainto_tsquery('english', $2)
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [req.params.workspaceId, q.trim()]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
