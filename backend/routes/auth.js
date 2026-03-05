const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Avatar upload config
const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for avatars
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Helper: create workspace with default channels
async function createWorkspaceForUser(userId, workspaceName) {
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
    [workspaceName, finalSlug, 'Your team communication hub', userId]
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

// Helper: join user to workspace via invite
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
  const ws = await pool.query('SELECT * FROM workspaces WHERE id = $1', [invite.workspace_id]);
  return { ...ws.rows[0], role: 'member' };
}

// Register - creates user + new workspace
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name, workspace_name } = req.body;

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }

    if (!workspace_name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, avatar_url, created_at`,
      [email.toLowerCase(), password_hash, display_name]
    );

    const user = result.rows[0];

    // Create workspace for this user
    const workspace = await createWorkspaceForUser(user.id, workspace_name);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, user, workspaces: [workspace] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Register with invite - creates user and joins existing workspace
router.post('/register-with-invite', async (req, res) => {
  try {
    const { email, password, display_name, invite_code } = req.body;

    if (!email || !password || !display_name || !invite_code) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate invite
    const inviteResult = await pool.query(
      'SELECT * FROM workspace_invites WHERE code = $1 AND is_active = true',
      [invite_code]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }

    const invite = inviteResult.rows[0];

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired' });
    }

    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      return res.status(400).json({ error: 'This invite link has reached its maximum uses' });
    }

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, avatar_url, created_at`,
      [email.toLowerCase(), password_hash, display_name]
    );

    const user = result.rows[0];

    // Join workspace
    const workspace = await joinWorkspaceViaInvite(user.id, invite);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, user, workspaces: [workspace] });
  } catch (err) {
    console.error('Register with invite error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, display_name, avatar_url, password_hash, title, phone, timezone, status_text, status_emoji FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    delete user.password_hash;

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Get user workspaces
    const workspaces = await pool.query(
      `SELECT w.*, wm.role FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.created_at`,
      [user.id]
    );

    res.json({ token, user, workspaces: workspaces.rows });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const workspaces = await pool.query(
      `SELECT w.*, wm.role FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY w.created_at`,
      [req.user.id]
    );

    res.json({ user: req.user, workspaces: workspaces.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.patch('/me', auth, async (req, res) => {
  try {
    const { display_name, avatar_url, title, phone, timezone, status_text, status_emoji, current_password, new_password } = req.body;

    // Handle password change
    if (current_password && new_password) {
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const validPassword = await bcrypt.compare(current_password, userResult.rows[0].password_hash);

      if (!validPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(new_password, 12);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);
    }

    // Handle profile field updates
    const fields = [];
    const values = [];
    let idx = 1;

    if (display_name !== undefined) { fields.push(`display_name = $${idx++}`); values.push(display_name); }
    if (avatar_url !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(avatar_url); }
    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (timezone !== undefined) { fields.push(`timezone = $${idx++}`); values.push(timezone); }
    if (status_text !== undefined) { fields.push(`status_text = $${idx++}`); values.push(status_text); }
    if (status_emoji !== undefined) { fields.push(`status_emoji = $${idx++}`); values.push(status_emoji); }

    if (fields.length === 0 && !current_password) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let user = req.user;

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      values.push(req.user.id);

      const result = await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, display_name, avatar_url, title, phone, timezone, status_text, status_emoji`,
        values
      );
      user = result.rows[0];
    }

    res.json({ user, passwordChanged: !!(current_password && new_password) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar
router.post('/me/avatar', auth, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Avatar must be less than 5MB' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const avatarUrl = `/uploads/${req.file.filename}`;
      const result = await pool.query(
        'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, display_name, avatar_url, title, phone, timezone, status_text, status_emoji',
        [avatarUrl, req.user.id]
      );

      res.json({ user: result.rows[0] });
    } catch (dbErr) {
      console.error('Avatar upload error:', dbErr);
      res.status(500).json({ error: 'Failed to update avatar' });
    }
  });
});

module.exports = router;
