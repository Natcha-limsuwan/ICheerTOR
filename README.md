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

The app uses a 3-tier role system. After initial setup, all role management is done via the **Admin Panel** (`/admin/users`).

| Role | Permissions |
| ------------- | ------------------------------------------------------------------ |
| **Developer** | Full access — manage roles (promote/demote to admin/user), suspend, ban, reinstate users |
| **Admin** | Can suspend, ban, reinstate users — **cannot** change roles |
| **User** | Normal user access — browse TOR listings, save favorites, receive notifications |

### What Each Role Can Do

#### 👑 Developer (highest privilege)
- Everything an Admin can do, **plus**:
- Promote users to `admin` or demote them back to `user`
- Promote users to `developer`
- Access the full Admin Panel at `/admin`

#### 🛡️ Admin
- View all registered users in the Admin Panel
- **Suspend** a user (temporarily block access)
- **Ban** a user (permanently block access)
- **Reinstate** a suspended/banned user
- View admin action audit logs at `/admin/logs`

#### 👤 User
- Sign in with Google
- Browse and search TOR procurement listings
- Save favorites and set up notifications
- View their own profile

### First-time Setup (Bootstrap)

Since there is no environment-based auto-promotion, the **first developer** must be set up directly in the database:

1. Sign in with Google so your user document is created in MongoDB.
2. Open your MongoDB client (e.g. [Atlas UI](https://cloud.mongodb.com/), `mongosh`, or Compass).
3. Find your user in the `users` collection and update the role:

```javascript
// In mongosh or Atlas UI → Edit Document
db.users.updateOne(
  { email: "your-email@gmail.com" },
  { $set: { role: "developer" } }
)
```

4. Sign out and sign back in to refresh your session.
5. You now have access to the Admin Panel at `/admin/users` to manage all other users' roles.

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
