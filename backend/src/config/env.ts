import dotenv from "dotenv";
dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  /** Re-authentication is required after this many minutes without API activity. */
  SESSION_IDLE_TIMEOUT_MINUTES: number;
  /** Absolute session lifetime (also the JWT exp), regardless of activity. */
  SESSION_MAX_HOURS: number;
  /** Express "trust proxy" hop count; set to 1 when running behind one reverse proxy. */
  TRUST_PROXY: number;
  /** Requests per IP per 15 minutes across /api (default 300). */
  RATE_LIMIT_API_MAX: number;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  ADMIN_EMAILS: string[];
  FRONTEND_URL: string;

  // Vertex AI
  /** Express-mode API key. When set, project/location/credentials are not used. */
  VERTEX_AI_API_KEY: string;
  VERTEX_AI_PROJECT_ID: string;
  VERTEX_AI_LOCATION: string;
  VERTEX_AI_MODEL: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
  AI_CONFIDENCE_THRESHOLD: number;
  AI_CIRCUIT_BREAKER_THRESHOLD: number;
  AI_CIRCUIT_BREAKER_COOLDOWN_MS: number;
  AI_REQUEST_TIMEOUT_MS: number;

  // Notifications
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;

  // Scraper
  CRON_SECRET: string;
  SCRAPER_RATE_LIMIT_MS: number;
}

/** Development-only fallback. assertSecureConfig() refuses it in production. */
const DEV_JWT_SECRET = "dev-secret-change-me";

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  JWT_SECRET: process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? DEV_JWT_SECRET,
  SESSION_IDLE_TIMEOUT_MINUTES: parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? "30", 10),
  SESSION_MAX_HOURS: parseInt(process.env.SESSION_MAX_HOURS ?? "8", 10),
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY ?? "0", 10),
  RATE_LIMIT_API_MAX: parseInt(process.env.RATE_LIMIT_API_MAX ?? "300", 10),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:3001/api/auth/google/callback",
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",

  // Vertex AI
  VERTEX_AI_API_KEY: (process.env.VERTEX_AI_API_KEY ?? "").trim(),
  VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
  VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION ?? "asia-southeast1",
  // No default: model ids retire (gemini-2.0-flash did on 2026-06-01), and a
  // stale default fails at request time instead of at startup. Pick one from
  // Model Garden — see docs/VERTEX-SETUP.md.
  VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL ?? "",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  AI_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD ?? "0.6"),
  AI_CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.AI_CIRCUIT_BREAKER_THRESHOLD ?? "3", 10),
  AI_CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS ?? "60000", 10),
  // A scanned TOR plus the bidding document takes 25–95 s on Gemini 3 Flash.
  AI_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "180000", 10),

  // Notifications (email via Gmail SMTP)
  SMTP_HOST: process.env.SMTP_HOST ?? "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? "587", 10),
  SMTP_USER: process.env.SMTP_USER ?? "",
  SMTP_PASS: process.env.SMTP_PASS ?? "",

  // Scraper
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  SCRAPER_RATE_LIMIT_MS: parseInt(process.env.SCRAPER_RATE_LIMIT_MS ?? "2000", 10),
};

/**
 * Fail closed on insecure configuration (ASVS V13.3.1, threat T03/T26).
 *
 * In production the server refuses to start with a missing, default or short
 * JWT secret, missing OAuth/database credentials, or a non-HTTPS frontend.
 * In development it only warns so local setup keeps working.
 */
export function assertSecureConfig(): void {
  const problems: string[] = [];

  if (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET must be a random value of at least 32 characters (not the dev default)");
  }
  if (!env.MONGODB_URI) problems.push("MONGODB_URI is required");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    problems.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }
  if (!Number.isFinite(env.SESSION_IDLE_TIMEOUT_MINUTES) || env.SESSION_IDLE_TIMEOUT_MINUTES < 1) {
    problems.push("SESSION_IDLE_TIMEOUT_MINUTES must be a positive integer");
  }
  if (!Number.isFinite(env.SESSION_MAX_HOURS) || env.SESSION_MAX_HOURS < 1) {
    problems.push("SESSION_MAX_HOURS must be a positive integer");
  }
  if (!Number.isFinite(env.RATE_LIMIT_API_MAX) || env.RATE_LIMIT_API_MAX < 1) {
    problems.push("RATE_LIMIT_API_MAX must be a positive integer");
  }
  if (env.NODE_ENV === "production" && env.RATE_LIMIT_API_MAX > 10000) {
    console.warn("[config] RATE_LIMIT_API_MAX is very high; only raise it for a local DAST run");
  }
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32) {
    problems.push("CRON_SECRET, when set, must be at least 32 characters");
  }

  if (env.NODE_ENV === "production") {
    // Loopback is exempt so the local docker-compose stack (NODE_ENV=production on
    // http://localhost) still runs; any real host must use HTTPS.
    const httpsOrLoopback = (url: string) =>
      url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
    if (!httpsOrLoopback(env.FRONTEND_URL)) problems.push("FRONTEND_URL must use https:// in production");
    if (!httpsOrLoopback(env.GOOGLE_CALLBACK_URL)) {
      problems.push("GOOGLE_CALLBACK_URL must use https:// in production");
    }
    if (problems.length > 0) {
      throw new Error(`Insecure configuration, refusing to start:\n - ${problems.join("\n - ")}`);
    }
    return;
  }

  for (const p of problems) console.warn(`[config] ${p} (allowed outside production)`);
}
