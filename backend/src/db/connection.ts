import mongoose from "mongoose";
import { env } from "../config/env.js";

/* MongoDB connection singleton.
 *
 * Caches the connection on `globalThis` to prevent creating
 * multiple connections during development hot-reloads. */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? { conn: null, promise: null };
globalThis.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const MONGODB_URI = env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable in .env");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  const topology = await cached.conn.connection.db!.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    cached.conn = null;
    cached.promise = null;
    await mongoose.disconnect();
    throw new Error("MongoDB replica set required for atomic security/audit updates. Use the supplied Docker Compose replica set or MongoDB Atlas.");
  }
  return cached.conn;
}

export default connectDB;
