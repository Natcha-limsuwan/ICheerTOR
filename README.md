# I Cheer TOR — Bangkok Software Procurement Tracker

AI-powered civic-technology platform for monitoring BMA (Bangkok Metropolitan Administration) software procurement. Discover, parse, and analyze Terms of Reference (TOR) documents.

## Architecture

The project is split into two services:

| Service | Stack | Port | Directory |
|---------|-------|------|-----------|
| **Backend** | Node.js + Express 5, Mongoose, Passport.js (JWT) | `:3001` | `backend/` |
| **Frontend** | Next.js 16 (App Router, UI only) | `:3000` | `frontend/` |

### Tech Stack

- **Backend**: [Express 5](https://expressjs.com/) + [TypeScript](https://www.typescriptlang.org/)
- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router, TypeScript)
- **UI**: [MUI v9](https://mui.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **Auth**: [Passport.js](https://www.passportjs.org/) (Google OAuth) + JWT tokens
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
- **AI**: Google Vertex AI (Gemini)
- **CI/CD**: GitHub Actions + Docker

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [npm](https://www.npmjs.com/) v10+
- MongoDB (local or [Atlas](https://cloud.mongodb.com/))
- Google OAuth credentials ([setup guide](./ENV_SETUP_GUIDE.md#2-authentication--passport--jwt))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Natcha-limsuwan/Software-Process.git
cd Software-Process

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure backend environment variables
cp .env.example .env
# Edit .env — see ENV_SETUP_GUIDE.md for details

# 4. Install frontend dependencies
cd ../frontend
npm install

# 5. Start both servers (in separate terminals)

# Terminal 1 — Backend
cd backend
npm run dev          # → http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm run dev          # → http://localhost:3000
```

The app will be available at [http://localhost:3000](http://localhost:3000).
The API is served at [http://localhost:3001/api](http://localhost:3001/api).

### Run with Docker

```bash
# 1. Configure backend environment variables
cp backend/.env.example backend/.env
# Edit backend/.env (use MONGODB_URI=mongodb://mongo:27017/icheertor for Docker)

# 2. Build and start the full stack (backend + frontend + MongoDB)
docker compose up --build
```

See [Docker Deployment](./ENV_SETUP_GUIDE.md#-docker-deployment) for production Docker usage.

## Available Scripts

### Backend (`backend/`)

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `npm run dev`        | Start dev server (tsx watch) |
| `npm run build`      | Compile TypeScript to `dist/` |
| `npm run start`      | Start production server      |
| `npx tsc --noEmit`   | Type check                   |

### Frontend (`frontend/`)

| Command              | Description              |
| -------------------- | ------------------------ |
| `npm run dev`        | Start Next.js dev server |
| `npm run build`      | Create production build  |
| `npm run start`      | Start production server  |
| `npm run lint`       | Run ESLint               |

## Project Structure

```
├── backend/                    # Express API server
│   ├── src/
│   │   ├── app.ts             # Express app setup (CORS, routes)
│   │   ├── server.ts          # Entry point (connect DB, start server)
│   │   ├── types.ts           # Shared types
│   │   ├── auth/              # Passport Google OAuth strategy
│   │   ├── config/            # Environment config
│   │   ├── db/                # MongoDB connection & Mongoose models
│   │   ├── middleware/        # Auth (JWT), error handler
│   │   ├── routes/            # Express route handlers
│   │   ├── services/          # Business logic (AI, ingestion, matching)
│   │   └── utils/             # API response helpers
│   ├── scripts/               # Seed & ingestion scripts
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                   # Next.js UI (pages only, no API routes)
│   ├── app/
│   │   ├── (admin)/           # Admin panel (developer/admin only)
│   │   │   └── admin/
│   │   │       ├── page.tsx   # Admin dashboard
│   │   │       ├── users/     # User management
│   │   │       └── logs/      # Action audit logs
│   │   ├── (auth)/            # Auth pages (login, callback)
│   │   └── (dashboard)/       # User-facing pages
│   ├── components/            # React components
│   │   ├── auth/              # Auth guards
│   │   ├── layout/            # Sidebar, TopBar, AdminSidebar
│   │   └── providers/         # AuthProvider (JWT context)
│   ├── lib/
│   │   ├── api/               # Backend API client
│   │   ├── theme/             # MUI theme
│   │   └── utils/             # Utilities (i18n, currency, date)
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml          # Full-stack: backend + frontend + mongo
├── SRS/                        # Software requirements specification
└── specs/                      # Feature specifications
```

## API Endpoints

All API routes are served by the backend at `http://localhost:3001/api/`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/google` | GET | Initiate Google OAuth login |
| `/api/auth/google/callback` | GET | OAuth callback (issues JWT) |
| `/api/auth/me` | GET | Get current user from JWT |
| `/api/tor` | GET | List TOR records (paginated) |
| `/api/tor/:id` | GET | Get single TOR record |
| `/api/tor/:id/corrections` | POST | Submit field correction |
| `/api/tor/:id/document` | GET | Get TOR document |
| `/api/tor/:id/match` | GET | Get vendor match results |
| `/api/bookmarks` | GET/POST | List/create bookmarks |
| `/api/bookmarks/:id` | DELETE | Remove bookmark |
| `/api/notifications` | GET/PUT | List/mark-read notifications |
| `/api/profile` | GET/POST/PUT | User profile CRUD |
| `/api/pdpa/consent` | GET/POST | PDPA consent management |
| `/api/pdpa/export` | GET | Export user data |
| `/api/pdpa/delete` | POST | Delete user data |
| `/api/admin/users` | GET | List all users (admin) |
| `/api/admin/users/:id` | PATCH | Suspend/ban/reinstate user |
| `/api/admin/users/:id/role` | PATCH | Change user role |
| `/api/admin/logs` | GET | Audit logs (admin) |
| `/api/cron/scrape` | POST | Trigger data scrape |
| `/api/health` | GET | Health check |

## Role System

The app uses a 3-tier role system managed via the Admin Panel (no environment variables needed after initial setup):

| Role                | Permissions                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| **Developer** | Full access — can change users' roles (admin/user), suspend, ban, reinstate |
| **Admin**     | Can suspend, ban, reinstate users — cannot change roles                     |
| **User**      | Normal user access                                                           |

### First-time Setup (Bootstrap)

1. Set `ADMIN_EMAILS` in `backend/.env` to your email address.
2. Sign in with Google for the first time.
3. If no developer exists in the DB, your account is automatically promoted to `developer`.
4. After this, manage all roles through the Admin Panel at `/admin/users`.

See [ADMIN_EMAILS](./ENV_SETUP_GUIDE.md#admin_emails) in the setup guide for details.

## CI/CD

### CI (`.github/workflows/ci.yml`)

Runs on push to `main`/`develop` and PRs to `main`:

1. **Lint** → **Type Check** → **Test** (parallel)
2. **Build** (after all three pass)

### Deploy (`.github/workflows/deploy.yml`)

Triggered after CI passes:

- `develop` branch → **Staging** (Docker)
- `main` branch → **Production** (Docker)

See [CI/CD Pipeline](./ENV_SETUP_GUIDE.md#-cicd-pipeline-github-actions) and [Required GitHub Secrets](./ENV_SETUP_GUIDE.md#required-github-secrets) for configuration.

## Environment Variables

See [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) for a complete reference of all environment variables, where to get them, and minimum configuration for local development.

## License

See [LICENSE](./LICENSE).
