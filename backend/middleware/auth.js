const jwt = require('jsonwebtoken');
const pool = require('../db');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query('SELECT id, email, display_name, avatar_url, title, phone, timezone, status_text, status_emoji, is_admin FROM users WHERE id = $1', [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next();
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query('SELECT id, email, display_name, avatar_url FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length > 0) {
      req.user = result.rows[0];
    }
  } catch (err) {
    // Ignore invalid tokens for optional auth
  }
  next();
};

const workspaceMember = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspace_id;
    if (!workspaceId) return next();

    const result = await pool.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    req.workspaceRole = result.rows[0].role;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { auth, optionalAuth, workspaceMember, requireRole };
