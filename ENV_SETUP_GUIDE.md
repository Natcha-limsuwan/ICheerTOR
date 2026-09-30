# 🔐 Environment Variables Setup Guide

This guide explains every variable in the backend `.env` file, what it does, and **where to get each value**.

> [!NOTE]
> All server-side environment variables live in `backend/.env`. The frontend only needs `NEXT_PUBLIC_API_URL` (configured in `frontend/.env`).

## Quick Start

```bash
# 1. Copy the template
cp backend/.env.example backend/.env

# 2. Fill in the values following the sections below

# 3. Start the backend
cd backend && npm run dev

# 4. In a separate terminal, start the frontend
cd frontend && npm run dev
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

### 2. Authentication — Passport + JWT

| Variable                 | Required | Example                                  |
| ------------------------ | -------- | ---------------------------------------- |
| `JWT_SECRET`           | ✅ Yes   | `a1b2c3d4e5f6...` (32+ chars)          |
| `JWT_EXPIRY`           | ❌ No    | `7d` (default)                          |
| `GOOGLE_CLIENT_ID`     | ✅ Yes   | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅ Yes   | `GOCSPX-xxxxx`                         |
| `GOOGLE_CALLBACK_URL`  | ✅ Yes   | `http://localhost:3001/api/auth/google/callback` |
| `FRONTEND_URL`         | ✅ Yes   | `http://localhost:3000`                |

#### `JWT_SECRET`

A random string used to sign JWT tokens.

**Generate it** by running one of these commands:

```bash
# Option A — OpenSSL
openssl rand -base64 32

# Option B — Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```env
JWT_SECRET=K7gN2xQ9pLm...your-generated-string
JWT_EXPIRY=7d
```

#### `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`

Used for **Google OAuth** sign-in via Passport.js.

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
   - `http://localhost:3001/api/auth/google/callback` (for local dev)
   - `https://your-api-url.com/api/auth/google/callback` (for production)
9. Click **Create** — copy the **Client ID** and **Client Secret**.

```env
GOOGLE_CLIENT_ID=123456789012-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdef123456
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

#### `FRONTEND_URL`

The URL of the frontend app. The backend redirects here after OAuth login.

```env
# Local development
FRONTEND_URL=http://localhost:3000

# Production
FRONTEND_URL=https://icheertor.example.com
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
4. A `.json` file will download. Move it into your project (e.g. `backend/keys/sa-key.json`).
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

The system supports **2 notification channels**:

| Channel | Description | Always on? |
|---------|-------------|------------|
| **In-App (Web)** | Notifications shown inside the iCheerTOR web app | ✅ Yes |
| **Email (Gmail SMTP)** | Notification emails sent via Gmail | User preference |

#### Email (SMTP via Gmail)

| Variable | Required | Default | Example |
| ------------- | -------- | ------- | ----------------------- |
| `SMTP_HOST` | ✅ Yes | `smtp.gmail.com` | `smtp.gmail.com` |
| `SMTP_PORT` | ✅ Yes | `587` | `587` |
| `SMTP_USER` | ✅ Yes | — | `yourname@gmail.com` |
| `SMTP_PASS` | ✅ Yes | — | `abcd efgh ijkl mnop` |

#### Step-by-Step: Get Gmail App Password

> [!IMPORTANT]
> You **cannot** use your regular Gmail password. Gmail requires a 16-character **App Password** for SMTP.

**Prerequisites:** You need a Gmail account with **2-Step Verification** enabled.

1. **Enable 2-Step Verification** (if not already):
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Find **2-Step Verification** and turn it **On**
   - Follow the prompts to set up (phone number or authenticator app)

2. **Generate an App Password:**
   - Go directly to [App Passwords](https://myaccount.google.com/apppasswords)
   - In the **App name** field, type: `iCheerTOR`
   - Click **Create**
   - Google will display a **16-character password** (e.g. `abcd efgh ijkl mnop`)
   - **Copy it immediately** — you won't be able to see it again

3. **Update `backend/.env`:**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

> [!CAUTION]
> Never share or commit your App Password. If compromised, revoke it at [App Passwords](https://myaccount.google.com/apppasswords) and generate a new one.

#### Testing Email

After configuring SMTP credentials, test the email system:

**Step 1 — Verify SMTP connection:**

```bash
cd backend
npm run test-email
```

Expected output if credentials are correct:
```
📡 Verifying SMTP connection...
✅ SMTP connection verified!
```

If credentials are wrong, you'll see:
```
❌ SMTP verification failed: Invalid login: 535-5.7.8 Username and Password not accepted.
```

**Step 2 — Send a test email:**

```bash
npm run test-email send your-email@gmail.com
```

Expected output:
```
📡 Verifying SMTP connection...
✅ SMTP connection verified!

📧 Sending test notification email to: your-email@gmail.com
[EMAIL] Sent to your-email@gmail.com — messageId: <abc123@gmail.com>

✅ Email sent successfully!
   Message ID: <abc123@gmail.com>

📬 Check your inbox at: your-email@gmail.com
```

Check your inbox for a styled HTML email from **iCheerTOR** with the test notification.

**Step 3 — Full dispatch test (optional, requires MongoDB):**

```bash
npm run test-email dispatch <mongoUserId>
```

This creates a notification in the database AND sends an email if the user has email notifications enabled in their preferences.

> [!TIP]
> If the test email lands in **Spam**, mark it as "Not spam" — Gmail will learn to deliver future emails to the inbox.

#### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Invalid login` error | Double-check `SMTP_USER` and `SMTP_PASS`. Make sure you're using an **App Password**, not your regular Gmail password. |
| `SMTP_USER or SMTP_PASS not configured` | The `.env` values are still placeholders. Replace `<email>` and `<app-password>` with real values. |
| Email lands in Spam | Mark as "Not spam" once. For production, consider setting up SPF/DKIM DNS records. |
| `Connection timeout` | Check if your firewall/network allows outbound connections on port 587. |
| App Passwords page not available | Ensure **2-Step Verification** is enabled on your Google Account first. |

---

### 5. Scraper / Cron

| Variable                  | Required | Default  | Example                      |
| ------------------------- | -------- | -------- | ---------------------------- |
| `CRON_SECRET`           | ✅ Yes   | —       | `my-super-secret-cron-key` |
| `SCRAPER_RATE_LIMIT_MS` | ❌ No    | `2000` | `3000`                     |

#### `CRON_SECRET`

A secret string used to protect the `/api/cron/scrape` endpoint from unauthorized access. The cron job must include this as a query parameter or header.

**Generate it** the same way as `JWT_SECRET`:

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

### 6. Frontend Settings

The frontend uses a separate `.env` file at `frontend/.env`:

| Variable                       | Required | Default                        | Example                           |
| ------------------------------ | -------- | ------------------------------ | --------------------------------- |
| `NEXT_PUBLIC_API_URL`        | ✅ Yes   | `http://localhost:3001/api`  | `https://api.icheertor.com/api` |
| `NEXT_PUBLIC_APP_NAME`       | ❌ No    | —                             | `I Cheer TOR`                   |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | ❌ No    | `th`                         | `en`                            |

> [!NOTE]
> Variables prefixed with `NEXT_PUBLIC_` are **exposed to the browser**. Do not put secrets in these.

```env
# frontend/.env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_NAME=I Cheer TOR
NEXT_PUBLIC_DEFAULT_LOCALE=th
```

---

## ✅ Minimal `.env` for Local Development

### Backend (`backend/.env`)

```env
# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/icheertor

# Auth
JWT_SECRET=<run: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:3000

# Bootstrap admin
ADMIN_EMAILS=your-email@gmail.com

# Cron protection
CRON_SECRET=<run: openssl rand -base64 32>
```

### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

The Vertex AI and SMTP variables are only needed if you're working on AI analysis or email notification features respectively.

---

## 🐳 Docker Deployment

### Local Development with Docker

You can run the full stack (backend + frontend + MongoDB) using Docker Compose:

```bash
# 1. Make sure backend/.env is configured
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# 2. Build and start
docker compose up --build

# 3. Services available at:
#    Frontend: http://localhost:3000
#    Backend:  http://localhost:3001
#    MongoDB:  localhost:27017
```

### docker-compose.yml Services

| Service | Description | Port |
|---------|-------------|------|
| `backend` | Express API server | 3001 |
| `frontend` | Next.js UI | 3000 |
| `mongo` | MongoDB 7 | 27017 |

MongoDB data is persisted in a named Docker volume (`mongo-data`).

> [!WARNING]
> When using Docker Compose with the local MongoDB, update `MONGODB_URI` in `backend/.env` to:
> ```env
> MONGODB_URI=mongodb://mongo:27017/icheertor
> ```
> (Use `mongo` as hostname instead of `localhost` because they are on the same Docker network.)

### Production Docker Build

Each service has its own multi-stage Dockerfile:

```bash
# Build individual images
docker build -t icheertor-backend:latest ./backend
docker build -t icheertor-frontend:latest ./frontend

# Run with environment variables
docker run -p 3001:3001 --env-file backend/.env icheertor-backend:latest
docker run -p 3000:3000 --env-file frontend/.env icheertor-frontend:latest
```

---

## 🔄 CI/CD Pipeline (GitHub Actions)

The project includes automated CI/CD via GitHub Actions:

### CI Pipeline (`.github/workflows/ci.yml`)

Triggered on **push** to `main`/`develop` and **pull requests** to `main`:

| Job | What it does |
|-----|------|
| **Lint** | `cd frontend && npm run lint` |
| **Type Check (Backend)** | `cd backend && npx tsc --noEmit` |
| **Type Check (Frontend)** | `cd frontend && npx tsc --noEmit` |
| **Build** | Build both services (runs after lint + typecheck pass) |

### Deploy Pipeline (`.github/workflows/deploy.yml`)

Triggered **after CI passes**:

| Branch | Target | Docker Tag |
|--------|--------|------------|
| `develop` | Staging server | `icheertor-*:staging` |
| `main` | Production server | `icheertor-*:latest` |

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
