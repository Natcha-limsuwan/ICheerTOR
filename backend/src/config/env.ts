import dotenv from "dotenv";
dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  ADMIN_EMAILS: string[];
  FRONTEND_URL: string;

  // Vertex AI
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
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;

  // Scraper
  CRON_SECRET: string;
  SCRAPER_RATE_LIMIT_MS: number;
}

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  JWT_SECRET: process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me",
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? "7d",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:3001/api/auth/google/callback",
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",

  // Vertex AI
  VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
  VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION ?? "asia-southeast1",
  VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL ?? "gemini-2.0-flash",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  AI_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD ?? "0.6"),
  AI_CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.AI_CIRCUIT_BREAKER_THRESHOLD ?? "3", 10),
  AI_CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS ?? "60000", 10),
  AI_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "30000", 10),

  // Notifications
  SMTP_HOST: process.env.SMTP_HOST ?? "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? "587", 10),
  SMTP_USER: process.env.SMTP_USER ?? "",
  SMTP_PASS: process.env.SMTP_PASS ?? "",
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ?? "",

  // Scraper
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  SCRAPER_RATE_LIMIT_MS: parseInt(process.env.SCRAPER_RATE_LIMIT_MS ?? "2000", 10),
};
