/** Temporary real API + scratch MongoDB for browser E2E. Never uses .env DB. */
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { env } from "../../src/config/env.js";
import { connectDB } from "../../src/db/connection.js";
import User from "../../src/db/models/user.js";
import TORRecord from "../../src/db/models/tor-record.js";

async function main() {
  const database = `icheertor_qa_ui_${randomUUID().replaceAll("-", "")}`;
  env.MONGODB_URI = `mongodb://127.0.0.1:27019/${database}?serverSelectionTimeoutMS=3000`;
  env.JWT_SECRET = randomUUID();
  env.GOOGLE_CLIENT_ID = "synthetic-qa-client"; env.GOOGLE_CLIENT_SECRET = "synthetic-qa-secret";
  env.FRONTEND_URL = "http://127.0.0.1:3100"; env.SMTP_USER = "";
  await connectDB();
  const users = await User.create(["chrome", "firefox", "webkit"].map(name => ({ googleId: `qa-${name}`, name: `QA ${name}`, email: `${name}@example.invalid` })));
  const sessions = Object.fromEntries(users.map(user => [user.email.split("@")[0], {
    token: jwt.sign({ id: user._id.toString() }, env.JWT_SECRET, { expiresIn: "1h" }), email: user.email,
  }]));
  const records = await TORRecord.create([500000, 1000000, 2000000].map((price, index) => ({
    title: `โครงการ website QA ${index + 1}`, agencyName: "หน่วยงานจำลอง QA", phase: "bidding",
    medianPrice: price, budget: price, postingDate: new Date("2026-11-01"), submissionDeadline: new Date("2030-01-01"),
    sourceUrl: "https://example.invalid/source", tags: ["open", "website"], extractionStatus: "completed", deduplicationHash: `qa-${index}`,
    summary: { overview: "พัฒนาเว็บไซต์สำหรับประชาชน", confidence: 0.91 },
    parsedData: { scopeOfWork: { content: "พัฒนาเว็บไซต์สำหรับประชาชน", confidence: 0.91 },
      medianPrice: { value: price, confidence: 0.85 },
      qualifications: [{ criterion: "มีทีมพัฒนา", type: "personnel", confidence: 0.55 }],
      evaluationCriteria: { content: "ราคาและคุณภาพ", confidence: 0.75 } },
  })));
  const app = (await import("../../src/app.js")).default;
  const sessionFile = "/tmp/icheertor-qa-ui-session.json";
  await writeFile(sessionFile, JSON.stringify({ sessions, torId: records[0]._id.toString() }), { mode: 0o600 });
  const server = app.listen(3101, "127.0.0.1", () => console.log("QA real API ready on localhost:3101 (synthetic scratch database only)"));
  let closing = false;
  async function close() {
    if (closing) return; closing = true;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (mongoose.connection.name === database) {
      await Promise.all(Object.values(mongoose.models).map(model => model.init()));
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
    await unlink(sessionFile).catch(() => {});
  }
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
main().catch(() => { console.error("QA API setup failed"); process.exitCode = 1; void mongoose.disconnect(); });
