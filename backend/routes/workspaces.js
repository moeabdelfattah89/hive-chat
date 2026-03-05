const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db');
const { auth, optionalAuth, workspaceMember, requireRole } = require('../middleware/auth');
const { createWorkspaceForUser, joinWorkspaceViaInvite } = require('../utils/workspace');

// Generate random invite code
function generateCode() {
  return crypto.randomBytes(5).toString('hex'); // 10-char hex string
}

// Create a new workspace
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const workspace = await createWorkspaceForUser(req.user.id, name.trim(), description);

    res.status(201).json({ workspace });
  } catch (err) {
    console.error('Create workspace error:', err);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Get workspace details
router.get('/:workspaceId', auth, workspaceMember, async (req, res) => {
  try {
    const ws = await pool.query('SELECT id, name, slug, description, created_at FROM workspaces WHERE id = $1', [req.params.workspaceId]);
    if (ws.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const memberCount = await pool.query(
      'SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1',
      [req.params.workspaceId]
    );

    res.json({
      workspace: {
        ...ws.rows[0],
        role: req.workspaceRole,
        member_count: parseInt(memberCount.rows[0].count),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List active invites for a workspace
router.get('/:workspaceId/invites', auth, workspaceMember, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const invites = await pool.query(
      `SELECT wi.id, wi.workspace_id, wi.code, wi.max_uses, wi.use_count, wi.expires_at, wi.created_at,
              u.display_name as created_by_name
       FROM workspace_invites wi
       LEFT JOIN users u ON wi.created_by = u.id
       WHERE wi.workspace_id = $1 AND wi.is_active = true
       ORDER BY wi.created_at DESC`,
      [req.params.workspaceId]
    );

    res.json({ invites: invites.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create invite
router.post('/:workspaceId/invites', auth, workspaceMember, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { max_uses, expires_in_days } = req.body;

    const code = generateCode();
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    const result = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, code, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, workspace_id, code, max_uses, use_count, expires_at, created_at`,
      [req.params.workspaceId, code, req.user.id, max_uses || null, expiresAt]
    );

    res.status(201).json({ invite: result.rows[0] });
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Revoke invite
router.delete('/:workspaceId/invites/:inviteId', auth, workspaceMember, requireRole('owner', 'admin'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE workspace_invites SET is_active = false WHERE id = $1 AND workspace_id = $2',
      [req.params.inviteId, req.params.workspaceId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate invite code (public - no auth required)
router.get('/invite/:code', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wi.id, wi.workspace_id, wi.code, wi.max_uses, wi.use_count, wi.expires_at, wi.created_at,
              w.name as workspace_name, w.slug as workspace_slug, w.description as workspace_description
       FROM workspace_invites wi
       JOIN workspaces w ON wi.workspace_id = w.id
       WHERE wi.code = $1 AND wi.is_active = true`,
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    const invite = result.rows[0];

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired' });
    }

    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      return res.status(400).json({ error: 'This invite link has reached its maximum uses' });
    }

    // Check if logged-in user is already a member
    let alreadyMember = false;
    if (req.user) {
      const membership = await pool.query(
        'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [invite.workspace_id, req.user.id]
      );
      alreadyMember = membership.rows.length > 0;
    }

    res.json({
      workspace_name: invite.workspace_name,
      workspace_description: invite.workspace_description,
      already_member: alreadyMember,
      is_logged_in: !!req.user,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Join workspace via invite code (auth required)
router.post('/invite/:code/join', auth, async (req, res) => {
  try {
    const inviteResult = await pool.query(
      'SELECT id, workspace_id, code, max_uses, use_count, expires_at, created_at FROM workspace_invites WHERE code = $1 AND is_active = true',
      [req.params.code]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    const invite = inviteResult.rows[0];

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired' });
    }

    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      return res.status(400).json({ error: 'This invite link has reached its maximum uses' });
    }

    // Check if already a member
    const existing = await pool.query(
      'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [invite.workspace_id, req.user.id]
    );

    if (existing.rows.length > 0) {
      const ws = await pool.query(
        `SELECT w.id, w.name, w.slug, w.description, w.created_at, wm.role FROM workspaces w
         JOIN workspace_members wm ON w.id = wm.workspace_id
         WHERE w.id = $1 AND wm.user_id = $2`,
        [invite.workspace_id, req.user.id]
      );
      return res.json({ workspace: ws.rows[0], already_member: true });
    }

    const workspace = await joinWorkspaceViaInvite(req.user.id, invite);

    res.json({ workspace });
  } catch (err) {
    console.error('Join workspace error:', err);
    res.status(500).json({ error: 'Failed to join workspace' });
  }
});

module.exports = router;
