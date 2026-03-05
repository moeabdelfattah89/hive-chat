require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const uploadsDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'hive-backend', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/files', require('./routes/files'));
app.use('/api/workspaces', require('./routes/workspaces'));

// Socket.io
const io = setupSocket(server);
app.set('io', io);

// Initialize database
async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    // Split by semicolons and execute each statement separately to handle IF NOT EXISTS properly
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        // Ignore duplicate constraint errors during init
        if (err.code !== '42710' && err.code !== '42P07' && err.code !== '23505') {
          console.warn('Schema statement warning:', err.message);
        }
      }
    }
    console.log('[Hive] Database schema initialized');
  } catch (err) {
    console.error('[Hive] Failed to initialize database:', err.message);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[Hive] Server running on port ${PORT}`);
  });
});
