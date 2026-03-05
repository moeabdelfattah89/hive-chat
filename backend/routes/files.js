const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { auth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    // Block potentially dangerous file types
    const blocked = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      return cb(new Error('File type not allowed'), false);
    }
    cb(null, true);
  },
});

// Upload single file
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { message_id } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO files (message_id, user_id, filename, original_name, mime_type, size, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
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
    const files = [];

    for (const file of req.files) {
      const fileUrl = `/uploads/${file.filename}`;
      const result = await pool.query(
        `INSERT INTO files (message_id, user_id, filename, original_name, mime_type, size, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
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
      return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
