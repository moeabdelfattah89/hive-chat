const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get workspace channels — requires workspace membership
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Authorization: verify workspace membership
    const wsCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, req.user.id]
    );
    if (wsCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const channels = await pool.query(
      `SELECT c.id, c.workspace_id, c.name, c.description, c.topic, c.is_private, c.is_archived, c.created_at,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
        EXISTS(SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $2) as is_member
       FROM channels c
       WHERE c.workspace_id = $1 AND c.is_archived = false
       AND (c.is_private = false OR EXISTS(SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $2))
       ORDER BY c.name`,
      [workspaceId, req.user.id]
    );

    res.json({ channels: channels.rows });
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Create channel — requires workspace membership
router.post('/', auth, async (req, res) => {
  try {
    const { workspace_id, name, description, is_private } = req.body;

    if (!name || !workspace_id) {
      return res.status(400).json({ error: 'Channel name and workspace are required' });
    }

    if (name.length > 80) {
      return res.status(400).json({ error: 'Channel name must be under 80 characters' });
    }

    // Authorization: verify workspace membership
    const wsCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspace_id, req.user.id]
    );
    if (wsCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const channelName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 80);

    const result = await pool.query(
      `INSERT INTO channels (workspace_id, name, description, is_private, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, workspace_id, name, description, topic, is_private, is_archived, created_at`,
      [workspace_id, channelName, description?.slice(0, 500) || null, is_private || false, req.user.id]
    );

    const channel = result.rows[0];

    await pool.query(
      'INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, $3)',
      [channel.id, req.user.id, 'admin']
    );

    channel.member_count = 1;
    channel.is_member = true;

    res.status(201).json({ channel });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A channel with this name already exists' });
    }
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Get channel info
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.workspace_id, c.name, c.description, c.topic, c.is_private, c.is_archived, c.created_at,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
        EXISTS(SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $2) as is_member,
        u.display_name as creator_name
       FROM channels c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({ channel: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// Get channel members — requires channel membership or workspace membership for public channels
router.get('/:id/members', auth, async (req, res) => {
  try {
    // Verify access
    const accessCheck = await pool.query(
      `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM channels c JOIN workspace_members wm ON c.workspace_id = wm.workspace_id
         WHERE c.id = $1 AND wm.user_id = $2 AND c.is_private = false`,
      [req.params.id, req.user.id]
    );
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await pool.query(
      `SELECT u.id, u.display_name, u.avatar_url, u.title, cm.role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.channel_id = $1
       ORDER BY u.display_name`,
      [req.params.id]
    );

    res.json({ members: members.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Join channel — only public channels in user's workspace
router.post('/:id/join', auth, async (req, res) => {
  try {
    // Verify channel is public and in user's workspace
    const channelCheck = await pool.query(
      `SELECT c.id FROM channels c
       JOIN workspace_members wm ON c.workspace_id = wm.workspace_id
       WHERE c.id = $1 AND wm.user_id = $2 AND c.is_private = false AND c.is_archived = false`,
      [req.params.id, req.user.id]
    );
    if (channelCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot join this channel' });
    }

    await pool.query(
      'INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

// Leave channel
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave channel' });
  }
});

// Update channel — requires channel admin role
router.patch('/:id', auth, async (req, res) => {
  try {
    // Authorization: require channel admin or creator
    const roleCheck = await pool.query(
      `SELECT cm.role FROM channel_members cm WHERE cm.channel_id = $1 AND cm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only channel admins can update channel settings' });
    }

    const { name, description, topic, is_archived } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 80)); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push((description || '').slice(0, 500)); }
    if (topic !== undefined) { fields.push(`topic = $${idx++}`); values.push((topic || '').slice(0, 500)); }
    if (is_archived !== undefined) { fields.push(`is_archived = $${idx++}`); values.push(!!is_archived); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE channels SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, workspace_id, name, description, topic, is_private, is_archived, created_at, updated_at`,
      values
    );

    res.json({ channel: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

module.exports = router;
