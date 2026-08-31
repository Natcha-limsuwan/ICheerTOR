# I Cheer TOR — Bangkok Software Procurement Tracker

AI-powered civic-technology platform for monitoring BMA (Bangkok Metropolitan Administration) software procurement. Discover, parse, and analyze Terms of Reference (TOR) documents.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, TypeScript)
- **UI**: [MUI v9](https://mui.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **Auth**: [NextAuth.js v5](https://authjs.dev/) (Google OAuth)
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
- **AI**: Google Vertex AI (Gemini)
- **Testing**: [Vitest](https://vitest.dev/)
- **CI/CD**: GitHub Actions + Docker

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [npm](https://www.npmjs.com/) v10+
- MongoDB (local or [Atlas](https://cloud.mongodb.com/))
- Google OAuth credentials ([setup guide](./ENV_SETUP_GUIDE.md#2-authentication--nextauthjs-v5))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Natcha-limsuwan/Software-Process.git
cd Software-Process

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env — see ENV_SETUP_GUIDE.md for details

# 4. Start dev server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Run with Docker

```bash
# 1. Configure environment variables
cp .env.example .env
# Edit .env (use MONGODB_URI=mongodb://mongo:27017/icheertor for Docker)

# 2. Build and start the full stack (app + MongoDB)
docker compose up --build
```

See [Docker Deployment](./ENV_SETUP_GUIDE.md#-docker-deployment) for production Docker usage.

## Available Scripts

| Command              | Description              |
| -------------------- | ------------------------ |
| `npm run dev`      | Start development server |
| `npm run build`    | Create production build  |
| `npm run start`    | Start production server  |
| `npm run lint`     | Run ESLint               |
| `npx tsc --noEmit` | Type check               |
| `npx vitest run`   | Run tests                |

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── (admin)/            # Admin panel (developer/admin only)
│   │   └── admin/
│   │       ├── page.tsx    # Admin dashboard
│   │       ├── users/      # User management
│   │       └── logs/       # Action audit logs
│   ├── (auth)/             # Auth pages (login)
│   ├── (dashboard)/        # User-facing pages
│   └── api/                # API routes
├── components/             # React components
│   ├── auth/               # Auth guards
│   ├── layout/             # Sidebar, TopBar, AdminSidebar
│   └── providers/          # Context providers
├── lib/                    # Shared libraries
│   ├── auth/               # NextAuth config & middleware
│   ├── db/                 # MongoDB connection & models
│   ├── services/           # Business logic
│   └── utils/              # Utilities
├── .github/workflows/      # CI/CD pipelines
├── Dockerfile              # Production Docker image
└── docker-compose.yml      # Local full-stack setup
```

## Role System

The app uses a 3-tier role system managed via the Admin Panel (no environment variables needed after initial setup):

| Role                | Permissions                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| **Developer** | Full access — can change users' roles (admin/user), suspend, ban, reinstate |
| **Admin**     | Can suspend, ban, reinstate users — cannot change roles                     |
| **User**      | Normal user access                                                           |

### First-time Setup (Bootstrap)

1. Set `ADMIN_EMAILS` in `.env` to your email address.
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
