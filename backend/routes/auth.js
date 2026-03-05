const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const passport = require('../config/passport');
const { auth } = require('../middleware/auth');
const { createWorkspaceForUser, joinWorkspaceViaInvite } = require('../utils/workspace');

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

// Register - creates user + new workspace
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name, workspace_name } = req.body;

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }

    // Basic email format validation
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (typeof display_name !== 'string' || display_name.length > 100) {
      return res.status(400).json({ error: 'Display name must be 100 characters or less' });
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

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (typeof display_name !== 'string' || display_name.length > 100) {
      return res.status(400).json({ error: 'Display name must be 100 characters or less' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate invite
    const inviteResult = await pool.query(
      'SELECT id, workspace_id, code, max_uses, use_count, expires_at, created_at FROM workspace_invites WHERE code = $1 AND is_active = true',
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

    const { password_hash, ...user } = result.rows[0];

    if (!password_hash) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please use the "Continue with Google" button.' });
    }

    const validPassword = await bcrypt.compare(password, password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Get user workspaces
    const workspaces = await pool.query(
      `SELECT w.id, w.name, w.slug, w.description, w.created_at, wm.role FROM workspaces w
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
      `SELECT w.id, w.name, w.slug, w.description, w.created_at, wm.role FROM workspaces w
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

    // Input length validation
    if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length > 100)) {
      return res.status(400).json({ error: 'Display name must be 100 characters or less' });
    }
    if (title !== undefined && (typeof title !== 'string' || title.length > 150)) {
      return res.status(400).json({ error: 'Title must be 150 characters or less' });
    }
    if (phone !== undefined && (typeof phone !== 'string' || phone.length > 30)) {
      return res.status(400).json({ error: 'Phone must be 30 characters or less' });
    }
    if (status_text !== undefined && (typeof status_text !== 'string' || status_text.length > 100)) {
      return res.status(400).json({ error: 'Status text must be 100 characters or less' });
    }
    if (status_emoji !== undefined && (typeof status_emoji !== 'string' || status_emoji.length > 32)) {
      return res.status(400).json({ error: 'Status emoji must be 32 characters or less' });
    }

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
      return res.status(400).json({ error: 'Invalid image file' });
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

// Google OAuth - initiate
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

// Google OAuth - callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/' }),
  (req, res) => {
    try {
      const token = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('/');
    }
  }
);

module.exports = router;
