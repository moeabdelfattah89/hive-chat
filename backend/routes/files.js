const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { auth } = require('../middleware/auth');

const isValidUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    // Sanitize extension — only allow alphanumeric + dot
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Block executable and script file types that could be used for attacks
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.msi',
  '.js', '.jsx', '.ts', '.vbs', '.wsf', '.wsh', '.ps1',
  '.php', '.asp', '.aspx', '.jsp', '.cgi', '.pl',
  '.html', '.htm', '.svg', '.xml', '.xhtml',
  '.sh', '.bash', '.zsh', '.csh',
];

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error('File type not allowed'), false);
    }
    cb(null, true);
  },
});

// Verify the user has access to the message they're attaching to
async function verifyMessageAccess(messageId, userId) {
  if (!messageId) return true; // Allow unattached uploads

  const msg = await pool.query(
    'SELECT channel_id, conversation_id, user_id FROM messages WHERE id = $1',
    [messageId]
  );
  if (msg.rows.length === 0) return false;

  const message = msg.rows[0];

  // Only the message author can attach files
  if (message.user_id !== userId) return false;

  return true;
}

// Upload single file
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { message_id } = req.body;
    if (message_id && !isValidUUID(message_id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    // Verify access
    if (message_id && !(await verifyMessageAccess(message_id, req.user.id))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO files (message_id, user_id, filename, original_name, mime_type, size, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, message_id, filename, original_name, mime_type, size, url, created_at`,
      [message_id || null, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, fileUrl]
    );

    res.status(201).json({ file: result.rows[0] });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Upload multiple files
router.post('/multiple', auth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { message_id } = req.body;
    if (message_id && !isValidUUID(message_id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    // Verify access
    if (message_id && !(await verifyMessageAccess(message_id, req.user.id))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const files = [];

    for (const file of req.files) {
      const fileUrl = `/uploads/${file.filename}`;
      const result = await pool.query(
        `INSERT INTO files (message_id, user_id, filename, original_name, mime_type, size, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, message_id, filename, original_name, mime_type, size, url, created_at`,
        [message_id || null, req.user.id, file.filename, file.originalname, file.mimetype, file.size, fileUrl]
      );
      files.push(result.rows[0]);
    }

    res.status(201).json({ files });
  } catch (err) {
    console.error('Multiple file upload error:', err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: 'Upload error' });
  }
  if (err) {
    return res.status(400).json({ error: 'Upload error' });
  }
  next();
});

module.exports = router;
