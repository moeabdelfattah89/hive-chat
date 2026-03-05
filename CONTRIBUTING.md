# Contributing to Hive

Thanks for your interest in contributing to Hive! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/hive-chat.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Follow the [Quick Start](README.md#quick-start) to set up your dev environment
5. Make your changes
6. Push and open a pull request

## Development Setup

```bash
# Backend (runs on :3001)
cd backend && npm install && npm run dev

# Frontend (runs on :5173)
cd frontend && npm install && npm run dev
```

You'll need PostgreSQL running with the schema applied:

```bash
createdb hive
psql hive < backend/db/schema.sql
```

## Pull Request Guidelines

- **One feature/fix per PR** - Keep PRs focused and reviewable
- **Describe what and why** - Explain what your PR does and why the change is needed
- **Test your changes** - Make sure existing functionality still works
- **Follow existing patterns** - Match the code style and conventions already in the project
- **Keep commits clean** - Use clear, descriptive commit messages

## Code Style

- **Backend**: Node.js/Express with async/await, camelCase for variables, snake_case for database columns
- **Frontend**: React functional components with hooks, JSX
- **SQL**: Explicit column lists (no `SELECT *`), parameterized queries (no string concatenation)

## What to Work On

### Good First Issues

Check [issues labeled `good first issue`](https://github.com/moeabdelfattah89/hive-chat/labels/good%20first%20issue) for beginner-friendly tasks.

### Feature Ideas

- Unit and integration tests
- Dark mode / theme system
- Browser push notifications
- Better mobile responsive layouts
- Accessibility improvements (ARIA, keyboard nav)
- Message formatting (code blocks, lists, blockquotes)
- Admin panel for workspace management
- API documentation (OpenAPI/Swagger)
- Docker Compose production setup
- i18n / localization

### Bug Reports

When filing a bug, please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser and OS
- Screenshots if applicable

## Project Architecture

### Backend

- **Express** REST API with JWT authentication
- **Socket.io** for real-time events (messages, typing, presence)
- **PostgreSQL** with the `pg` driver (no ORM)
- All routes require auth middleware; workspace membership is verified on every request
- Authorization checks on all endpoints and socket events

### Frontend

- **React 18** with Context API for state (AuthContext, SocketContext)
- **Axios** for API calls with auth token interceptor
- **Socket.io-client** for real-time updates
- Component structure: `auth/`, `chat/`, `layout/`, `modals/`

### Key Files

| File | Purpose |
|------|---------|
| `backend/server.js` | Express app setup, middleware, routes |
| `backend/socket/index.js` | All real-time event handlers |
| `backend/middleware/auth.js` | JWT verification, role checks |
| `backend/db/schema.sql` | Complete database schema |
| `frontend/src/App.jsx` | Main app component, routing |
| `frontend/src/contexts/SocketContext.jsx` | WebSocket connection management |
| `frontend/src/contexts/AuthContext.jsx` | Auth state, login/logout |

## Security

- Always use parameterized queries (`$1`, `$2`) — never concatenate user input into SQL
- Validate and sanitize all user inputs on the backend
- Use explicit column lists in SELECT queries — never `SELECT *`
- Check authorization (membership, ownership) before any data access
- Never expose user emails in API responses to other users
- HTML-escape user content before rendering

## Questions?

Open an issue or start a discussion. We're happy to help!
