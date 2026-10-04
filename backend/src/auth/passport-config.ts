import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "../config/env.js";
import { connectDB } from "../db/connection.js";
import User from "../db/models/user.js";

/**
 * Passport.js Google OAuth 2.0 strategy.
 *
 * On first sign-in the callback creates a User document in MongoDB.
 * Subsequent sign-ins retrieve the existing document.
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        await connectDB();

        const email = profile.emails?.[0]?.value ?? "";
        const googleId = profile.id;
        const isBootstrapDeveloper = env.ADMIN_EMAILS.includes(email.toLowerCase());

        let user = await User.findOne({ googleId });

        if (user) {
          if (user.status === "suspended" || user.status === "banned") {
            return done(null, false, { message: "Account is suspended or banned" });
          }
          user.lastLoginAt = new Date();
          // Promote to developer if in ADMIN_EMAILS but not yet developer
          if (isBootstrapDeveloper && user.role !== "developer") {
            user.role = "developer";
          }
          await user.save();
        } else {
          user = await User.create({
            googleId,
            email,
            name: profile.displayName ?? "",
            avatarUrl: profile.photos?.[0]?.value ?? undefined,
            role: isBootstrapDeveloper ? "developer" : "user",
            status: "active",
          });
        }

        return done(null, {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          avatarUrl: user.avatarUrl,
        });
      } catch (error) {
        return done(error as Error);
      }
    },
  ),
);
