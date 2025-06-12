# Hermes Web UI

This directory contains the web interface for the Hermes platform, consisting of:
- **Frontend**: Next.js application built with the T3 stack
- **Backend**: Rust/Axum API server that acts as a backend-for-frontend (BFF)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js   │────▶│ Axum BFF    │────▶│ gRPC Services│
│   Frontend  │     │ (REST/WS)   │     │              │
└─────────────┘     └─────────────┘     └──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  (sessions) │
                    └─────────────┘
```

## Frontend (T3 Stack)

The frontend uses:
- **Next.js 14** with App Router
- **tRPC** for type-safe API calls
- **Drizzle ORM** for session/cache data
- **Tailwind CSS** for styling
- **WorkOS** for enterprise-ready authentication

### Setup

```bash
cd frontend
npm install  # or pnpm install
npm run dev
```

## Backend (Rust/Axum)

The backend provides:
- REST API endpoints for the frontend
- WebSocket support for real-time logs
- gRPC client connections to Hermes services
- JWT-based authentication
- Redis session management

### Setup

```bash
cd backend
cargo build
cargo run
```

### Environment Variables

Copy `.env.example` to `.env` and configure:
- Service URLs for gRPC connections
- Redis connection string
- JWT secret key
- WorkOS credentials (optional)

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user

### Executions
- `POST /api/executions` - Create new execution
- `GET /api/executions/:id` - Get execution status
- `GET /api/executions/:id/logs` - Get execution logs
- `POST /api/executions/:id/cancel` - Cancel execution

### Memory
- `POST /api/memory/store` - Store data in memory
- `POST /api/memory/search` - Vector search
- `POST /api/memory/query` - Omni language query

### Workspaces
- `GET /api/workspaces` - List workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces/:id` - Get workspace
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace

### WebSocket
- `WS /ws/logs` - Real-time execution logs

## Development

Both frontend and backend support hot-reloading during development:

```bash
# Terminal 1: Backend
cd backend && cargo watch -x run

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Production Deployment

### Backend
```bash
cd backend
docker build -t hermes-web-ui-backend .
docker run -p 8080:8080 --env-file .env hermes-web-ui-backend
```

### Frontend
```bash
cd frontend
npm run build
npm start
```

## Testing

```bash
# Backend tests
cd backend && cargo test

# Frontend tests
cd frontend && npm test
```

## Security Considerations

- All API endpoints (except auth) require JWT authentication
- CORS is configured for production domains only
- Rate limiting is applied to prevent abuse
- Sessions are stored in Redis with TTL
- Passwords are hashed with Argon2id

## Future Enhancements

- [ ] GraphQL API option
- [ ] Real-time collaboration features
- [ ] Advanced workspace management
- [ ] File upload/download support
- [ ] Integration with more auth providers