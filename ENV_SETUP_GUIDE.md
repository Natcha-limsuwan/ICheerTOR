# 🔐 Environment Variables Setup Guide

This guide explains every variable in `.env`, what it does, and **where to get each value**.

## Quick Start

```bash
# 1. Copy the template
cp .env.example .env

# 2. Fill in the values following the sections below

# 3. Start the dev server
npm run dev
```

> [!CAUTION]
> **Never commit your `.env` file.** It is already listed in `.gitignore`. Only `.env.example` (with placeholder values) should be committed.

---

## 📂 Variable Reference

### 1. Database — MongoDB

| Variable        | Required | Example                                                              |
| --------------- | -------- | -------------------------------------------------------------------- |
| `MONGODB_URI` | ✅ Yes   | `mongodb+srv://admin:pass123@cluster0.abc12.mongodb.net/icheertor` |

**Where to get it:**

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/) and sign up / log in.
2. Create a **Free Shared Cluster** (M0).
3. Under **Database Access**, create a database user with a username and password.
4. Under **Network Access**, add your IP address (or `0.0.0.0/0` for development).
5. Click **Connect** → **Drivers** → copy the connection string.
6. Replace `<username>`, `<password>`, and append `/icheertor` as the database name.

```env
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.abc12.mongodb.net/icheertor
```

---

### 2. Authentication — NextAuth.js (v5)

| Variable                 | Required | Example                                  |
| ------------------------ | -------- | ---------------------------------------- |
| `NEXTAUTH_URL`         | ✅ Yes   | `http://localhost:3000`                |
| `NEXTAUTH_SECRET`      | ✅ Yes   | `a1b2c3d4e5f6...` (32+ chars)          |
| `GOOGLE_CLIENT_ID`     | ✅ Yes   | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅ Yes   | `GOCSPX-xxxxx`                         |

#### `NEXTAUTH_URL`

The canonical URL of your app. For local development:

```env
NEXTAUTH_URL=http://localhost:3000
```

For production, use your deployed domain (e.g. `https://icheertor.example.com`).

#### `NEXTAUTH_SECRET`

A random string used to encrypt JWTs and session tokens.

**Generate it** by running one of these commands:

```bash
# Option A — OpenSSL
openssl rand -base64 32

# Option B — Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```env
NEXTAUTH_SECRET=K7gN2xQ9pLm...your-generated-string
```

#### `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`

Used for **Google OAuth** sign-in.

**Where to get them:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services** → **Credentials**.
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**.
5. If prompted, configure the **OAuth consent screen** first:
   - User type: **External**
   - Fill in app name, user support email, etc.
   - Add scopes: `email`, `profile`, `openid`
6. Back in Credentials, select **Web application** as the application type.
7. Add **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local dev)
   - `https://your-production-url.com` (for production)
8. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
   - `https://your-production-url.com/api/auth/callback/google` (for production)
9. Click **Create** — copy the **Client ID** and **Client Secret**.

```env
GOOGLE_CLIENT_ID=123456789012-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdef123456
```

#### `ADMIN_EMAILS`

Comma-separated email addresses used **only for bootstrapping** the first developer account.

> [!IMPORTANT]
> This variable is **not** used for ongoing role management. Once a developer account exists in the database, all role assignments are done through the **Admin Panel**.

**How it works:**

1. When a user with an email listed in `ADMIN_EMAILS` signs in for the **first time** AND no `developer` role exists in the database yet → they are automatically assigned the `developer` role.
2. After a developer exists, new sign-ins from `ADMIN_EMAILS` get the default `user` role like everyone else.
3. The developer can then promote other users to `admin` or `user` via the Admin Panel.

**Role hierarchy:**

| Role | Permissions |
|------|-------------|
| `developer` | Full access — can change other users' roles (to admin/user), suspend, ban, reinstate |
| `admin` | Can suspend, ban, reinstate users — **cannot** change roles |
| `user` | Normal user access |

```env
# Comma-separated; only matters for the very first developer bootstrap
ADMIN_EMAILS=your-email@gmail.com
```

---

### 3. Vertex AI (Gemini)

| Variable | Required | Default | Example |
| ---------------------------------- | -------- | -------------------- | ---------------------- |
| `VERTEX_AI_PROJECT_ID` | ✅ Yes | — | `my-gcp-project-123` |
| `VERTEX_AI_LOCATION` | ❌ No | `asia-southeast1` | `us-central1` |
| `VERTEX_AI_MODEL` | ❌ No | `gemini-2.0-flash` | `gemini-2.0-pro` |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ Yes | — | `./keys/sa-key.json` |
| `AI_CONFIDENCE_THRESHOLD` | ❌ No | `0.6` | `0.7` |
| `AI_CIRCUIT_BREAKER_THRESHOLD` | ❌ No | `3` | `5` |
| `AI_CIRCUIT_BREAKER_COOLDOWN_MS` | ❌ No | `60000` | `120000` |
| `AI_REQUEST_TIMEOUT_MS` | ❌ No | `30000` | `60000` |

#### `VERTEX_AI_PROJECT_ID`

Your Google Cloud project ID.

**Where to get it:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Your project ID is shown in the **project selector** dropdown at the top of the page.
3. Or find it under **IAM & Admin** → **Settings**.

```env
VERTEX_AI_PROJECT_ID=my-icheertor-project
```

#### `GOOGLE_APPLICATION_CREDENTIALS`

Path to a **GCP service account key** JSON file. This authenticates the app with Vertex AI.

**Where to get it:**

1. In Google Cloud Console, go to **IAM & Admin** → **Service Accounts**.
2. Click **+ CREATE SERVICE ACCOUNT**.
   - Name: e.g. `icheertor-vertex-ai`
   - Grant role: **Vertex AI User** (`roles/aiplatform.user`)
3. After creating, click the service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**.
4. A `.json` file will download. Move it into your project (e.g. `keys/sa-key.json`).
5. **Add the file to `.gitignore`** so it's never committed.

```env
GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json
```

> [!WARNING]
> Never commit the service account key file. Add `keys/` to your `.gitignore`.

#### `VERTEX_AI_LOCATION` / `VERTEX_AI_MODEL`

These have sensible defaults. Only override if needed:

```env
# Optional — defaults shown
VERTEX_AI_LOCATION=asia-southeast1
VERTEX_AI_MODEL=gemini-2.0-flash
```

#### AI Tuning Parameters

These control the AI circuit breaker and request behavior. The defaults work well for most cases:

| Variable | What it does | Default |
| ---------------------------------- | --------------------------------------------------------- | --------- |
| `AI_CONFIDENCE_THRESHOLD` | Minimum confidence score to accept an AI result | `0.6` |
| `AI_CIRCUIT_BREAKER_THRESHOLD` | Number of consecutive failures before the circuit opens | `3` |
| `AI_CIRCUIT_BREAKER_COOLDOWN_MS` | How long (ms) to wait before retrying after circuit opens | `60000` |
| `AI_REQUEST_TIMEOUT_MS` | Timeout (ms) for individual AI requests | `30000` |

---

### 4. Notifications

#### Email (SMTP via Gmail)

| Variable | Required | Example |
| ------------- | -------- | ----------------------- |
| `SMTP_HOST` | ✅ Yes | `smtp.gmail.com` |
| `SMTP_PORT` | ✅ Yes | `587` |
| `SMTP_USER` | ✅ Yes | `yourname@gmail.com` |
| `SMTP_PASS` | ✅ Yes | `abcd efgh ijkl mnop` |

**Where to get `SMTP_PASS` (Gmail App Password):**

> [!IMPORTANT]
> You **cannot** use your regular Gmail password. You need an **App Password**.

1. Go to [Google Account Security](https://myaccount.google.com/security).
2. Enable **2-Step Verification** if not already enabled.
3. Go to [App Passwords](https://myaccount.google.com/apppasswords).
4. Select **Mail** and your device, then click **Generate**.
5. Copy the 16-character password (formatted as `xxxx xxxx xxxx xxxx`).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

#### LINE Messaging API

| Variable                      | Required | Example                              |
| ----------------------------- | -------- | ------------------------------------ |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ Yes   | `xxxxxxxxxxxxxxx...` (long string) |
| `LINE_CHANNEL_SECRET`       | ✅ Yes   | `abcdef1234567890`                 |

**Where to get them:**

1. Go to [LINE Developers Console](https://developers.line.biz/console/).
2. Create a **Provider** (or select an existing one).
3. Create a new **Messaging API Channel**.
4. Under the **Basic settings** tab → copy the **Channel secret**.
5. Under the **Messaging API** tab → issue a **Channel access token (long-lived)**.

```env
LINE_CHANNEL_ACCESS_TOKEN=your-very-long-token-string
LINE_CHANNEL_SECRET=your-channel-secret
```

---

### 5. Scraper / Cron

| Variable                  | Required | Default  | Example                      |
| ------------------------- | -------- | -------- | ---------------------------- |
| `CRON_SECRET`           | ✅ Yes   | —       | `my-super-secret-cron-key` |
| `SCRAPER_RATE_LIMIT_MS` | ❌ No    | `2000` | `3000`                     |

#### `CRON_SECRET`

A secret string used to protect the `/api/cron/scrape` endpoint from unauthorized access. The cron job must include this as a query parameter or header.

**Generate it** the same way as `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

```env
CRON_SECRET=some-random-secure-string
```

#### `SCRAPER_RATE_LIMIT_MS`

Delay (in milliseconds) between scraper requests to avoid rate-limiting by target sites.

```env
# Optional — default is 2000ms (2 seconds)
SCRAPER_RATE_LIMIT_MS=2000
```

---

### 6. App Settings (Public)

| Variable                       | Required | Default | Example         |
| ------------------------------ | -------- | ------- | --------------- |
| `NEXT_PUBLIC_APP_NAME`       | ❌ No    | —      | `I Cheer TOR` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | ❌ No    | `th`  | `en`          |

> [!NOTE]
> Variables prefixed with `NEXT_PUBLIC_` are **exposed to the browser**. Do not put secrets in these.

```env
NEXT_PUBLIC_APP_NAME=I Cheer TOR
NEXT_PUBLIC_DEFAULT_LOCALE=th
```

---

## ✅ Minimal `.env` for Local Development

If you just want to get the app running locally with core features, here is the **minimum** you need:

```env
# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/icheertor

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Cron protection
CRON_SECRET=<run: openssl rand -base64 32>
```

The Vertex AI, SMTP, and LINE variables are only needed if you're working on AI analysis, email notifications, or LINE bot features respectively.

---

## 🐳 Docker Deployment

### Local Development with Docker

You can run the full stack (app + MongoDB) using Docker Compose:

```bash
# 1. Make sure .env is configured
cp .env.example .env
# Edit .env with your values

# 2. Build and start
docker compose up --build

# 3. App is available at http://localhost:3000
```

### Production Docker Build

The project uses a multi-stage Dockerfile optimized for production:

```bash
# Build the production image
docker build -t icheertor:latest .

# Run with environment variables
docker run -p 3000:3000 --env-file .env icheertor:latest
```

> [!NOTE]
> The Docker build uses Next.js **standalone output** mode (`output: "standalone"` in `next.config.ts`), which produces a self-contained `server.js` with minimal dependencies (~100MB vs ~1GB).

### docker-compose.yml Services

| Service | Description | Port |
|---------|-------------|------|
| `app` | Next.js application | 3000 |
| `mongo` | MongoDB 7 | 27017 |

MongoDB data is persisted in a named Docker volume (`mongo-data`).

> [!WARNING]
> When using Docker Compose with the local MongoDB, update `MONGODB_URI` in `.env` to:
> ```env
> MONGODB_URI=mongodb://mongo:27017/icheertor
> ```
> (Use `mongo` as hostname instead of `localhost` because they are on the same Docker network.)

---

## 🔄 CI/CD Pipeline (GitHub Actions)

The project includes automated CI/CD via GitHub Actions:

### CI Pipeline (`.github/workflows/ci.yml`)

Triggered on **push** to `main`/`develop` and **pull requests** to `main`:

| Job | What it does |
|-----|------|
| **Lint** | `npm run lint` |
| **Type Check** | `npx tsc --noEmit` |
| **Test** | `npx vitest run` |
| **Build** | `npm run build` (runs after lint + typecheck + test pass) |

### Deploy Pipeline (`.github/workflows/deploy.yml`)

Triggered **after CI passes**:

| Branch | Target | Docker Tag |
|--------|--------|------------|
| `develop` | Staging server | `icheertor:staging` |
| `main` | Production server | `icheertor:latest` |

### Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `DOCKER_REGISTRY` | Docker registry URL (e.g. `ghcr.io/your-org`) |
| `DOCKER_USERNAME` | Registry username |
| `DOCKER_PASSWORD` | Registry password or access token |
| `STAGING_HOST` | Staging server IP/hostname |
| `STAGING_USER` | SSH username for staging |
| `STAGING_SSH_KEY` | SSH private key for staging |
| `PRODUCTION_HOST` | Production server IP/hostname |
| `PRODUCTION_USER` | SSH username for production |
| `PRODUCTION_SSH_KEY` | SSH private key for production |

---

## 🔗 Quick Links

| Service                  | URL                                               |
| ------------------------ | ------------------------------------------------- |
| MongoDB Atlas            | <https://cloud.mongodb.com/>                        |
| Google Cloud Console     | <https://console.cloud.google.com/>                 |
| Google OAuth Credentials | <https://console.cloud.google.com/apis/credentials> |
| Google App Passwords     | <https://myaccount.google.com/apppasswords>         |
| LINE Developers Console  | <https://developers.line.biz/console/>              |
