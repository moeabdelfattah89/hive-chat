const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('../db');

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query(
        'SELECT id, display_name, avatar_url, email FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) return next(new Error('User not found'));

      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Hive] User connected: ${socket.user.display_name} (${socket.user.id})`);

    // Join workspace room
    socket.on('join:workspace', async (workspaceId) => {
      try {
        socket.join(`workspace:${workspaceId}`);
        socket.workspaceId = workspaceId;

        // Set presence to online
        await pool.query(
          `INSERT INTO user_presence (user_id, workspace_id, status, last_active)
           VALUES ($1, $2, 'online', NOW())
           ON CONFLICT (user_id, workspace_id) DO UPDATE SET status = 'online', last_active = NOW()`,
          [socket.user.id, workspaceId]
        );

        // Notify others
        socket.to(`workspace:${workspaceId}`).emit('presence:update', {
          user_id: socket.user.id,
          status: 'online',
        });

        // Send online users list
        const onlineUsers = await pool.query(
          `SELECT user_id, status FROM user_presence WHERE workspace_id = $1 AND status != 'offline'`,
          [workspaceId]
        );
        socket.emit('presence:online_users', onlineUsers.rows);
      } catch (err) {
        console.error('Socket join:workspace error:', err);
      }
    });

    // Join channel
    socket.on('join:channel', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    // Leave channel
    socket.on('leave:channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // Join DM conversation
    socket.on('join:conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    // Channel message
    socket.on('message:send', async (data) => {
      try {
        const { channel_id, content, parent_id } = data;

        const result = await pool.query(
          `INSERT INTO messages (channel_id, user_id, content, parent_id)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [channel_id, socket.user.id, content.trim(), parent_id || null]
        );

        const message = result.rows[0];

        if (parent_id) {
          await pool.query('UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1', [parent_id]);
        }

        const full = await pool.query(
          `SELECT m.*, u.display_name, u.avatar_url, u.email
           FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
          [message.id]
        );

        const msg = { ...full.rows[0], reactions: [], files: [] };

        if (parent_id) {
          // Thread reply - broadcast to channel room
          io.to(`channel:${channel_id}`).emit('thread:message', msg);
        } else {
          io.to(`channel:${channel_id}`).emit('message:new', msg);
        }
      } catch (err) {
        console.error('Socket message:send error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // DM message
    socket.on('dm:send', async (data) => {
      try {
        const { conversation_id, content, parent_id } = data;

        const result = await pool.query(
          `INSERT INTO messages (conversation_id, user_id, content, parent_id)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [conversation_id, socket.user.id, content.trim(), parent_id || null]
        );

        if (parent_id) {
          await pool.query('UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1', [parent_id]);
        }

        await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation_id]);

        const full = await pool.query(
          `SELECT m.*, u.display_name, u.avatar_url, u.email
           FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`,
          [result.rows[0].id]
        );

        const msg = { ...full.rows[0], reactions: [], files: [] };

        if (parent_id) {
          io.to(`conversation:${conversation_id}`).emit('thread:message', msg);
        } else {
          io.to(`conversation:${conversation_id}`).emit('dm:message', msg);
        }
      } catch (err) {
        console.error('Socket dm:send error:', err);
        socket.emit('error', { message: 'Failed to send DM' });
      }
    });

    // Typing indicators
    socket.on('typing:start', (data) => {
      const { channel_id, conversation_id } = data;
      const room = channel_id ? `channel:${channel_id}` : `conversation:${conversation_id}`;
      socket.to(room).emit('typing:update', {
        user_id: socket.user.id,
        display_name: socket.user.display_name,
        is_typing: true,
        channel_id,
        conversation_id,
      });
    });

    socket.on('typing:stop', (data) => {
      const { channel_id, conversation_id } = data;
      const room = channel_id ? `channel:${channel_id}` : `conversation:${conversation_id}`;
      socket.to(room).emit('typing:update', {
        user_id: socket.user.id,
        display_name: socket.user.display_name,
        is_typing: false,
        channel_id,
        conversation_id,
      });
    });

    // Reactions
    socket.on('reaction:toggle', async (data) => {
      try {
        const { message_id, emoji } = data;

        const existing = await pool.query(
          'SELECT id FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
          [message_id, socket.user.id, emoji]
        );

        if (existing.rows.length > 0) {
          await pool.query('DELETE FROM reactions WHERE id = $1', [existing.rows[0].id]);
        } else {
          await pool.query(
            'INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
            [message_id, socket.user.id, emoji]
          );
        }

        const reactions = await pool.query(
          `SELECT r.*, u.display_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = $1`,
          [message_id]
        );

        // Broadcast to all rooms the message might be in
        const msg = await pool.query('SELECT channel_id, conversation_id FROM messages WHERE id = $1', [message_id]);
        if (msg.rows.length > 0) {
          const { channel_id, conversation_id } = msg.rows[0];
          const room = channel_id ? `channel:${channel_id}` : `conversation:${conversation_id}`;
          io.to(room).emit('reaction:update', { message_id, reactions: reactions.rows });
        }
      } catch (err) {
        console.error('Socket reaction error:', err);
      }
    });

    // Edit message
    socket.on('message:edit', async (data) => {
      try {
        const { message_id, content } = data;

        const result = await pool.query(
          `UPDATE messages SET content = $1, is_edited = true, updated_at = NOW()
           WHERE id = $2 AND user_id = $3 RETURNING *`,
          [content.trim(), message_id, socket.user.id]
        );

        if (result.rows.length > 0) {
          const msg = result.rows[0];
          const room = msg.channel_id ? `channel:${msg.channel_id}` : `conversation:${msg.conversation_id}`;
          io.to(room).emit('message:edited', msg);
        }
      } catch (err) {
        console.error('Socket edit error:', err);
      }
    });

    // Delete message
    socket.on('message:delete', async (data) => {
      try {
        const { message_id } = data;

        const msg = await pool.query(
          'SELECT * FROM messages WHERE id = $1 AND user_id = $2',
          [message_id, socket.user.id]
        );

        if (msg.rows.length > 0) {
          if (msg.rows[0].parent_id) {
            await pool.query(
              'UPDATE messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1',
              [msg.rows[0].parent_id]
            );
          }

          await pool.query('DELETE FROM messages WHERE id = $1', [message_id]);

          const room = msg.rows[0].channel_id
            ? `channel:${msg.rows[0].channel_id}`
            : `conversation:${msg.rows[0].conversation_id}`;

          io.to(room).emit('message:deleted', {
            message_id,
            channel_id: msg.rows[0].channel_id,
            conversation_id: msg.rows[0].conversation_id,
          });
        }
      } catch (err) {
        console.error('Socket delete error:', err);
      }
    });

    // Presence
    socket.on('presence:set', async (data) => {
      try {
        const { status } = data;
        if (socket.workspaceId) {
          await pool.query(
            `INSERT INTO user_presence (user_id, workspace_id, status, last_active)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, workspace_id) DO UPDATE SET status = $3, last_active = NOW()`,
            [socket.user.id, socket.workspaceId, status]
          );

          io.to(`workspace:${socket.workspaceId}`).emit('presence:update', {
            user_id: socket.user.id,
            status,
          });
        }
      } catch (err) {
        console.error('Socket presence error:', err);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      try {
        console.log(`[Hive] User disconnected: ${socket.user.display_name}`);
        if (socket.workspaceId) {
          await pool.query(
            `UPDATE user_presence SET status = 'offline', last_active = NOW()
             WHERE user_id = $1 AND workspace_id = $2`,
            [socket.user.id, socket.workspaceId]
          );

          socket.to(`workspace:${socket.workspaceId}`).emit('presence:update', {
            user_id: socket.user.id,
            status: 'offline',
          });
        }
      } catch (err) {
        console.error('Socket disconnect error:', err);
      }
    });
  });

  return io;
}

module.exports = { setupSocket };
