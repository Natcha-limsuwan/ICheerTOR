import express from "express";
import cors from "cors";
import passport from "passport";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";

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

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
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

app.use(errorHandler);

export default app;
