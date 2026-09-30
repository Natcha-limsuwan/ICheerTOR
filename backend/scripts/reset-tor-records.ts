/**
 * Empty the torrecords collection so the next ingest starts clean.
 *
 * Only torrecords — users, vendor profiles and everything else stay. Refuses
 * to run while bookmarks, notifications or corrections still point at TOR
 * records, since those would be left dangling.
 *
 * Usage (in container):
 *   # show what would be deleted
 *   docker compose --profile tools run --rm tools npx tsx scripts/reset-tor-records.ts
 *   # delete, then rebuild indexes and re-ingest
 *   docker compose --profile tools run --rm tools npx tsx scripts/reset-tor-records.ts --apply
 *   docker compose --profile tools run --rm tools npm run db:sync-indexes
 *   docker compose --profile tools run --rm tools npm run ingest
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";

import Bookmark from "../src/db/models/bookmark";
import Notification from "../src/db/models/notification";
import TORRecord from "../src/db/models/tor-record";
import UserCorrection from "../src/db/models/user-correction";

const apply = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ต้องมี MONGODB_URI ใน .env");
    process.exit(1);
  }

  mongoose.set("autoIndex", false);
  await mongoose.connect(uri);
  console.log(`[db] ${mongoose.connection.db!.databaseName}${apply ? "" : " | DRY RUN"}`);

  const total = await TORRecord.countDocuments();
  const byPhase = await TORRecord.aggregate([{ $group: { _id: "$phase", n: { $sum: 1 } } }]);
  console.log(`  torrecords: ${total} (${byPhase.map((p) => `${p._id} ${p.n}`).join(", ")})`);

  const refs = {
    bookmarks: await Bookmark.countDocuments(),
    notifications: await Notification.countDocuments(),
    usercorrections: await UserCorrection.countDocuments(),
  };
  const dangling = Object.entries(refs).filter(([, n]) => n > 0);
  if (dangling.length) {
    console.error(
      `  ยกเลิก: ยังมีข้อมูลที่อ้างถึง TOR record อยู่ — ${dangling.map(([k, n]) => `${k} ${n}`).join(", ")}`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!apply) {
    console.log("  ยังไม่ได้ลบ — ใส่ --apply เพื่อลบจริง");
  } else {
    const { deletedCount } = await TORRecord.deleteMany({});
    console.log(`  ✓ ลบ ${deletedCount} records แล้ว — ต่อด้วย db:sync-indexes และ ingest`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n[fatal]", e);
  process.exit(1);
});
