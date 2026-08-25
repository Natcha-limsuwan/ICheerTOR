import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";

/**
 * NextAuth.js v5 configuration for Google OAuth.
 *
 * On first sign-in the callback creates a User document in MongoDB.
 * Subsequent sign-ins retrieve the existing document.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;

      try {
        await connectDB();

        // Parse admin emails from env (comma-separated)
        const adminEmails = (process.env.ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

        const isAdmin = adminEmails.includes(
          (user.email ?? "").toLowerCase(),
        );

        const existing = await User.findOne({ googleId: account.providerAccountId });

        if (existing) {
          if (existing.status === "suspended" || existing.status === "banned") {
            return false;
          }
          existing.lastLoginAt = new Date();
          // Promote to admin if email is in ADMIN_EMAILS but role is still user
          if (isAdmin && existing.role !== "admin") {
            existing.role = "admin";
          }
          await existing.save();
        } else {
          await User.create({
            googleId: account.providerAccountId,
            email: user.email ?? "",
            name: user.name ?? "",
            avatarUrl: user.image ?? undefined,
            role: isAdmin ? "admin" : "user",
            status: "active",
          });
        }

        return true;
      } catch (error) {
        console.error("NextAuth signIn error:", error);
        return false;
      }
    },

    async session({ session }) {
      if (session.user?.email) {
        await connectDB();
        const dbUser = await User.findOne({ email: session.user.email }).lean();
        if (dbUser) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = session.user as any;
          u.id = dbUser._id.toString();
          u.role = dbUser.role;
          u.status = dbUser.status;
        }
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
      }
      return token;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
