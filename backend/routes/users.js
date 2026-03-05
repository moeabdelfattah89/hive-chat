const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

const VALID_PRESENCE_STATUSES = ['online', 'away', 'dnd', 'offline'];

// Get workspace users — requires workspace membership
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    // Authorization
    const wsCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.params.workspaceId, req.user.id]
    );
    if (wsCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT u.id, u.display_name, u.avatar_url, u.title, u.status_text, u.status_emoji,
              wm.role, wm.joined_at,
              COALESCE(up.status, 'offline') as presence
       FROM workspace_members wm
       JOIN users u ON wm.user_id = u.id
       LEFT JOIN user_presence up ON up.user_id = u.id AND up.workspace_id = wm.workspace_id
       WHERE wm.workspace_id = $1
       ORDER BY u.display_name`,
      [req.params.workspaceId]
    );

    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get DM conversations for user in workspace
router.get('/conversations/:workspaceId', auth, async (req, res) => {
  try {
    // Authorization
    const wsCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.params.workspaceId, req.user.id]
    );
    if (wsCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT c.id, c.workspace_id, c.is_group, c.name, c.created_at, c.updated_at,
        (SELECT json_agg(json_build_object(
          'id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url,
          'presence', COALESCE(up.status, 'offline')
        ))
        FROM conversation_participants cp2
        JOIN users u ON cp2.user_id = u.id
        LEFT JOIN user_presence up ON up.user_id = u.id AND up.workspace_id = c.workspace_id
        WHERE cp2.conversation_id = c.id AND cp2.user_id != $2
        ) as other_participants,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
       FROM conversations c
       JOIN conversation_participants cp ON c.id = cp.conversation_id
       WHERE c.workspace_id = $1 AND cp.user_id = $2
       ORDER BY COALESCE(
         (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
         c.created_at
       ) DESC`,
      [req.params.workspaceId, req.user.id]
    );

    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create or get DM conversation — requires workspace membership for both users
router.post('/conversations', auth, async (req, res) => {
  try {
    const { workspace_id, user_id: otherUserId } = req.body;

    if (!workspace_id || !otherUserId) {
      return res.status(400).json({ error: 'workspace_id and user_id are required' });
    }

    // Prevent DM to self
    if (otherUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot create a conversation with yourself' });
    }

    // Authorization: both users must be workspace members
    const bothMembers = await pool.query(
      'SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id IN ($2, $3)',
      [workspace_id, req.user.id, otherUserId]
    );
    if (bothMembers.rows.length < 2) {
      return res.status(403).json({ error: 'Both users must be workspace members' });
    }

    // Check if conversation already exists
    const existing = await pool.query(
      `SELECT c.id, c.workspace_id, c.is_group, c.name, c.created_at FROM conversations c
       WHERE c.workspace_id = $1 AND c.is_group = false
       AND EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $2)
       AND EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $3)`,
      [workspace_id, req.user.id, otherUserId]
    );

    if (existing.rows.length > 0) {
      return res.json({ conversation: existing.rows[0] });
    }

    // Create new conversation
    const conv = await pool.query(
      'INSERT INTO conversations (workspace_id) VALUES ($1) RETURNING id, workspace_id, is_group, name, created_at',
      [workspace_id]
    );

    const conversation = conv.rows[0];

    await pool.query(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [conversation.id, req.user.id, otherUserId]
    );

    const otherUser = await pool.query(
      `SELECT id, display_name, avatar_url FROM users WHERE id = $1`,
      [otherUserId]
    );

    conversation.other_participants = otherUser.rows;

    res.status(201).json({ conversation });
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Update presence — validate status value
router.post('/presence', auth, async (req, res) => {
  try {
    const { workspace_id, status } = req.body;

    const validStatus = VALID_PRESENCE_STATUSES.includes(status) ? status : 'online';

    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }

    await pool.query(
      `INSERT INTO user_presence (user_id, workspace_id, status, last_active)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, workspace_id)
       DO UPDATE SET status = $3, last_active = NOW()`,
      [req.user.id, workspace_id, validStatus]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

module.exports = router;
