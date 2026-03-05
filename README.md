# Hive

A modern, open-source team communication platform. Self-hosted Slack alternative with real-time messaging, workspaces, channels, threads, and more.

**Built with React, Express, PostgreSQL, and Socket.io.**

## Features

- **Multi-Workspace** - Create and manage separate team workspaces
- **Channels** - Public and private channels with topic/description
- **Direct Messages** - 1:1 conversations between workspace members
- **Threaded Replies** - Keep conversations organized
- **Real-Time Messaging** - Instant delivery via WebSocket
- **Emoji Reactions** - React to any message with 200+ emojis
- **File Sharing** - Upload images, documents, and files (up to 50MB)
- **Message Search** - Full-text search across channels
- **Message Editing & Deletion** - Edit or delete your own messages
- **Typing Indicators** - See when someone is typing
- **User Presence** - Online/away/DND status tracking
- **User Profiles** - Display name, avatar, title, timezone, and status
- **Invite System** - Generate invite links with expiration and usage limits
- **Markdown** - Bold, italic, code, and link formatting
- **Security Hardened** - XSS prevention, rate limiting, authz on all endpoints

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Axios, Socket.io-client |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL |
| Auth | JWT, bcryptjs |
| Security | Helmet, express-rate-limit |

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Clone and install

```bash
git clone https://github.com/moeabdelfattah89/hive-chat.git
cd hive-chat

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Set up the database

```bash
createdb hive
psql hive < backend/db/schema.sql
```

### 3. Configure environment

Create `backend/.env`:

```env
DATABASE_URL=postgresql://localhost:5432/hive
JWT_SECRET=change-this-to-a-random-secret
FRONTEND_URL=http://localhost:5173
PORT=3001
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

### 4. Run

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open **http://localhost:5173** and create your first workspace.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | Secret key for JWT tokens | - |
| `PORT` | Backend server port | `3001` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `52428800` (50MB) |
| `UPLOAD_DIR` | File upload directory | `./uploads` |

## Project Structure

```
hive-chat/
├── backend/
│   ├── db/
│   │   ├── index.js            # Database connection pool
│   │   └── schema.sql          # Full database schema
│   ├── middleware/
│   │   └── auth.js             # JWT auth, role checks, workspace membership
│   ├── routes/
│   │   ├── auth.js             # Register, login, profile management
│   │   ├── channels.js         # Channel CRUD and membership
│   │   ├── files.js            # File upload handling
│   │   ├── messages.js         # Messages, threads, pins, search
│   │   ├── users.js            # Workspace users, presence, DMs
│   │   └── workspaces.js       # Workspace management, invites
│   ├── socket/
│   │   └── index.js            # Real-time events (messages, typing, presence)
│   ├── utils/
│   │   └── workspace.js        # Shared workspace creation logic
│   └── server.js               # Express app setup
├── frontend/
│   └── src/
│       ├── api/index.js        # Axios instance with auth interceptor
│       ├── components/
│       │   ├── auth/           # Login, Register
│       │   ├── chat/           # ChannelView, DMView, Message, MessageInput, ThreadPanel
│       │   ├── layout/         # Sidebar
│       │   └── modals/         # CreateChannel, CreateWorkspace, InviteModal, ProfileSettings
│       ├── contexts/
│       │   ├── AuthContext.jsx
│       │   └── SocketContext.jsx
│       └── App.jsx
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

## Contributing

We welcome contributions of all kinds! Check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/moeabdelfattah89/hive-chat/labels/good%20first%20issue) to get started.

### Areas We'd Love Help With

- **Testing** - Unit and integration tests (Jest, React Testing Library, Supertest)
- **Accessibility** - ARIA labels, keyboard navigation, screen reader support
- **Dark Mode** - Theme system with dark/light toggle
- **Notifications** - Browser push notifications for mentions and DMs
- **Mobile** - Responsive layouts for mobile and tablet
- **Message Formatting** - Code blocks, blockquotes, lists
- **Admin Panel** - Workspace admin dashboard
- **i18n** - Internationalization and localization
- **API Docs** - OpenAPI/Swagger documentation
- **Deployment** - Docker Compose, Kubernetes manifests, cloud deploy guides

## Security

If you discover a security vulnerability, please email the maintainer directly rather than opening a public issue.

## License

[MIT](LICENSE)
