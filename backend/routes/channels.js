const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get workspace channels
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const channels = await pool.query(
      `SELECT c.*,
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

// Create channel
router.post('/', auth, async (req, res) => {
  try {
    const { workspace_id, name, description, is_private } = req.body;

    if (!name || !workspace_id) {
      return res.status(400).json({ error: 'Channel name and workspace are required' });
    }

    const channelName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');

    const result = await pool.query(
      `INSERT INTO channels (workspace_id, name, description, is_private, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [workspace_id, channelName, description || null, is_private || false, req.user.id]
    );

    const channel = result.rows[0];

    // Creator auto-joins
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
      `SELECT c.*,
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

// Get channel members
router.get('/:id/members', auth, async (req, res) => {
  try {
    const members = await pool.query(
      `SELECT u.id, u.display_name, u.avatar_url, u.email, u.title, cm.role, cm.joined_at
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

// Join channel
router.post('/:id/join', auth, async (req, res) => {
  try {
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

// Update channel
router.patch('/:id', auth, async (req, res) => {
  try {
    const { name, description, topic, is_archived } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (topic !== undefined) { fields.push(`topic = $${idx++}`); values.push(topic); }
    if (is_archived !== undefined) { fields.push(`is_archived = $${idx++}`); values.push(is_archived); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE channels SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ channel: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

module.exports = router;
