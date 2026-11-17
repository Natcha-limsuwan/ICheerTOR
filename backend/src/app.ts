import express from "express";
import cors from "cors";
import helmet from "helmet";
import passport from "passport";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiLimiter } from "./middleware/rate-limit.js";

// Route imports
import authRoutes from "./routes/auth.routes.js";
import torRoutes from "./routes/tor.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import bookmarkRoutes from "./routes/bookmark.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import pdpaRoutes from "./routes/pdpa.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import cronRoutes from "./routes/cron.routes.js";

// Passport config
import "./auth/passport-config.js";

const app = express();

/* ─── Middleware ───────────────────────────────────────────────────── */

// Only trust X-Forwarded-For from the configured number of proxy hops, so
// clients cannot spoof their IP for rate limiting and logs (ASVS V4.1.3).
app.set("trust proxy", env.TRUST_PROXY);

// Security headers (threat T25; ASVS V3.4.x). This server only returns JSON,
// so the CSP denies everything, including framing.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: "no-referrer" },
  }),
);

// CORS: a single fixed origin from configuration, never "*" (ASVS V3.4.2).
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// API responses carry personal data: never store them in browser or proxy caches (ASVS V14.3.2).
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api", apiLimiter);
app.use(express.json({ limit: "100kb", strict: true }));
app.use(passport.initialize());

/* ─── Routes ──────────────────────────────────────────────────────── */

app.use("/api/auth", authRoutes);
app.use("/api/tor", torRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/pdpa", pdpaRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/cron", cronRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ─── Error handler (must be last) ────────────────────────────────── */

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
