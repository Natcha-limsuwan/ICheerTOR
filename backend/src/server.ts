import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./db/connection.js";

async function start() {
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    app.listen(env.PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${env.PORT}`);
      console.log(`   Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

start();
