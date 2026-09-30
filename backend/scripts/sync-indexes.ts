/**
 * Bring MongoDB indexes in line with the Mongoose schemas.
 *
 * Needed after any index change in src/db/models — in particular the
 * TORRecord text index: a collection may hold only one text index, so
 * Mongoose's autoIndex cannot add the new one while the old one exists and
 * fails with an index-options conflict. syncIndexes drops indexes that are no
 * longer declared and creates the missing ones.
 *
 * Usage (in container):
 *   # show what would change, without touching the DB
 *   docker compose --profile tools run --rm tools npx tsx scripts/sync-indexes.ts --dry-run
 *   # apply
 *   docker compose --profile tools run --rm tools npx tsx scripts/sync-indexes.ts
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";

import AdminActionLog from "../src/db/models/admin-action-log";
import Bookmark from "../src/db/models/bookmark";
import ConsentRecord from "../src/db/models/consent-record";
import ExtractionLog from "../src/db/models/extraction-log";
import IngestJob from "../src/db/models/ingest-job";
import Notification from "../src/db/models/notification";
import TORRecord from "../src/db/models/tor-record";
import TORSource from "../src/db/models/tor-source";
import User from "../src/db/models/user";
import UserCorrection from "../src/db/models/user-correction";
import VendorProfile from "../src/db/models/vendor-profile";

const MODELS = [
  AdminActionLog,
  Bookmark,
  ConsentRecord,
  ExtractionLog,
  IngestJob,
  Notification,
  TORRecord,
  TORSource,
  User,
  UserCorrection,
  VendorProfile,
];

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ต้องมี MONGODB_URI ใน .env");
    process.exit(1);
  }

  // Index creation is done explicitly below, not as a side effect of connecting.
  mongoose.set("autoIndex", false);
  await mongoose.connect(uri);
  console.log(`[db] เชื่อมต่อแล้ว${dryRun ? " | DRY RUN" : ""}`);

  for (const model of MODELS) {
    const name = model.collection.collectionName;
    const diff = await model.diffIndexes();

    if (diff.toDrop.length === 0 && diff.toCreate.length === 0) {
      console.log(`  ${name}: ตรงแล้ว`);
      continue;
    }

    console.log(`  ${name}:`);
    for (const idx of diff.toDrop) console.log(`    - drop   ${JSON.stringify(idx)}`);
    for (const idx of diff.toCreate) console.log(`    + create ${JSON.stringify(idx)}`);

    if (!dryRun) {
      await model.syncIndexes();
      console.log(`    ✓ sync แล้ว`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n[fatal]", e);
  process.exit(1);
});
