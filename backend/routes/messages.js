const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get channel messages
router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    let query = `
      SELECT m.*,
        u.display_name, u.avatar_url, u.email,
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

// Send channel message
router.post('/channel/:channelId', auth, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, parent_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const result = await pool.query(
      `INSERT INTO messages (channel_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [channelId, req.user.id, content.trim(), parent_id || null]
    );

    const message = result.rows[0];

    // Increment reply count on parent
    if (parent_id) {
      await pool.query(
        'UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1',
        [parent_id]
      );
    }

    // Get full message with user info
    const full = await pool.query(
      `SELECT m.*, u.display_name, u.avatar_url, u.email
       FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
      [message.id]
    );

    res.status(201).json({ message: { ...full.rows[0], reactions: [], files: [] } });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get DM messages
router.get('/dm/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    let query = `
      SELECT m.*,
        u.display_name, u.avatar_url, u.email,
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

    // Update last_read
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

// Send DM
router.post('/dm/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, parent_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, req.user.id, content.trim(), parent_id || null]
    );

    if (parent_id) {
      await pool.query('UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1', [parent_id]);
    }

    const full = await pool.query(
      `SELECT m.*, u.display_name, u.avatar_url, u.email
       FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
      [result.rows[0].id]
    );

    // Update conversation timestamp
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    res.status(201).json({ message: { ...full.rows[0], reactions: [], files: [] } });
  } catch (err) {
    console.error('Send DM error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get thread messages
router.get('/thread/:parentId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.display_name, u.avatar_url, u.email,
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
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    // Check if reaction exists
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

    // Get updated reactions
    const reactions = await pool.query(
      `SELECT r.*, u.display_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = $1`,
      [req.params.id]
    );

    res.json({ reactions: reactions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle reaction' });
  }
});

// Edit message
router.patch('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await pool.query(
      `UPDATE messages SET content = $1, is_edited = true, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
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

// Delete message
router.delete('/:id', auth, async (req, res) => {
  try {
    const msg = await pool.query('SELECT * FROM messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    // Decrement parent reply count
    if (msg.rows[0].parent_id) {
      await pool.query('UPDATE messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1', [msg.rows[0].parent_id]);
    }

    await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Pin/unpin message
router.post('/:id/pin', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE messages SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Search messages
router.get('/search/:workspaceId', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await pool.query(
      `SELECT m.*, u.display_name, u.avatar_url, c.name as channel_name
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
