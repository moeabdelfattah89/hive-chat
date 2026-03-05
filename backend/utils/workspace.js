const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

/**
 * Create a new workspace with default channels (#general, #random)
 * and add the creator as owner.
 */
async function createWorkspaceForUser(userId, workspaceName, description) {
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Check slug uniqueness, append random suffix if needed
  let finalSlug = slug;
  const existing = await pool.query('SELECT id FROM workspaces WHERE slug = $1', [slug]);
  if (existing.rows.length > 0) {
    finalSlug = `${slug}-${uuidv4().slice(0, 4)}`;
  }

  const wsResult = await pool.query(
    `INSERT INTO workspaces (name, slug, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [workspaceName, finalSlug, description || 'Your team communication hub', userId]
  );
  const workspace = wsResult.rows[0];

  // Owner membership
  await pool.query(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
    [workspace.id, userId, 'owner']
  );

  // Default channels
  const generalResult = await pool.query(
    `INSERT INTO channels (workspace_id, name, description, created_by)
     VALUES ($1, 'general', 'Company-wide announcements and work-based matters', $2) RETURNING id`,
    [workspace.id, userId]
  );
  const randomResult = await pool.query(
    `INSERT INTO channels (workspace_id, name, description, created_by)
     VALUES ($1, 'random', 'Non-work banter and water cooler conversation', $2) RETURNING id`,
    [workspace.id, userId]
  );

  await pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [generalResult.rows[0].id, userId]);
  await pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [randomResult.rows[0].id, userId]);

  return { ...workspace, role: 'owner' };
}

/**
 * Join a user to a workspace via an invite.
 * Adds membership, auto-joins public channels, increments invite usage.
 */
async function joinWorkspaceViaInvite(userId, invite) {
  // Add as member
  await pool.query(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [invite.workspace_id, userId, 'member']
  );

  // Auto-join public channels
  const publicChannels = await pool.query(
    'SELECT id FROM channels WHERE workspace_id = $1 AND is_private = false AND is_archived = false',
    [invite.workspace_id]
  );
  for (const ch of publicChannels.rows) {
    await pool.query(
      'INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [ch.id, userId]
    );
  }

  // Increment invite use count
  await pool.query('UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = $1', [invite.id]);

  // Return workspace with role
  const ws = await pool.query(
    `SELECT w.*, wm.role FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE w.id = $1 AND wm.user_id = $2`,
    [invite.workspace_id, userId]
  );
  return ws.rows[0] || { ...invite, role: 'member' };
}

module.exports = { createWorkspaceForUser, joinWorkspaceViaInvite };
