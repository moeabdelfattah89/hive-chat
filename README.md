# Hive - Team Communication Platform

An open-source, self-hosted team communication platform built as a Slack alternative. Deploy on your own infrastructure for full control over your team's conversations.

## Features

- **Real-time messaging** via WebSocket (Socket.io)
- **Channels** - Public and private channels with topic/description
- **Direct messages** - 1:1 conversations with online status
- **Threaded replies** - Keep conversations organized
- **Emoji reactions** - 200+ emojis with categorized picker
- **File sharing** - Upload images, documents, and files (up to 50MB)
- **Message search** - Full-text search across all messages
- **Message editing & deletion** - Edit or delete your messages
- **Typing indicators** - See when someone is typing
- **User presence** - Online/away/offline status tracking
- **Multiple workspaces** - Support for separate team workspaces
- **Mobile responsive** - Works on desktop, tablet, and mobile
- **JWT authentication** - Secure token-based auth

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Axios, Socket.io-client |
| Backend | Node.js, Express, Socket.io, Multer |
| Database | PostgreSQL 16 |
| Auth | JWT, bcryptjs |
| DevOps | Docker, docker-compose, nginx |

## Quick Start (Docker)

The fastest way to get Hive running:

```bash
# Clone the repo
cd hive

# Start all services
docker compose up -d

# Open in browser
open http://localhost:5173
```

This starts PostgreSQL, the backend API, and the frontend (nginx).

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm or yarn

### 1. Database

```bash
# Start PostgreSQL (or use Docker for just the DB)
docker compose up postgres -d

# Or use your own PostgreSQL and create a database:
# CREATE DATABASE hive;
```

### 2. Backend

```bash
cd backend

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials

# Start the server
npm run dev
```

The API runs on `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app runs on `http://localhost:5173`.

## Deploy to GCP

### Option 1: Google Compute Engine (VM)

```bash
# SSH into your GCE instance
gcloud compute ssh your-instance

# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin

# Clone your repo and start
cd hive
sudo docker compose up -d
```

### Option 2: Google Kubernetes Engine (GKE)

Build and push images to Google Artifact Registry, then deploy with Kubernetes manifests. Recommended for production at scale.

### Option 3: Cloud Run

Build container images and deploy the backend and frontend as separate Cloud Run services. Use Cloud SQL for PostgreSQL.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://hive:hive_secret@localhost:5432/hive` |
| `JWT_SECRET` | Secret key for JWT tokens | (change in production!) |
| `PORT` | Backend server port | `3001` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `52428800` (50MB) |
| `UPLOAD_DIR` | File upload directory | `./uploads` |

## Project Structure

```
hive/
├── backend/
│   ├── db/
│   │   ├── index.js          # Database pool
│   │   └── schema.sql        # Full database schema
│   ├── middleware/
│   │   └── auth.js            # JWT auth middleware
│   ├── routes/
│   │   ├── auth.js            # Register, login, profile
│   │   ├── channels.js        # Channel CRUD
│   │   ├── messages.js        # Messages, threads, reactions, search
│   │   ├── users.js           # Users, DM conversations, presence
│   │   └── files.js           # File uploads
│   ├── socket/
│   │   └── index.js           # Socket.io real-time events
│   ├── server.js              # Express app entry point
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/index.js       # Axios client
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx
│   │   │   └── SocketContext.jsx
│   │   ├── components/
│   │   │   ├── auth/          # Login, Register
│   │   │   ├── layout/        # Sidebar
│   │   │   ├── chat/          # ChannelView, DMView, Message, MessageInput, ThreadPanel, EmojiPicker
│   │   │   └── modals/        # CreateChannel, NewDM
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
└── README.md
```

## License

MIT
