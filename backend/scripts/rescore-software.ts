/**
 * Re-run the software filter over records already in MongoDB.
 *
 * Ingest only ever upserts, so tightening the filter does nothing to records
 * that got in under the old rules. This finds them. Needed after the filter
 * stopped scoring agency names: "สำนักงานพัฒนาระบบสาธารณสุข" had matched the
 * strong keyword "พัฒนาระบบ" and pulled in that agency's medical purchases.
 *
 * Default is a dry run that only prints what would change.
 *
 *   --apply   delete records that no longer pass, and refresh filter score /
 *             reason / "uncertain-classification" tag on the ones that stay.
 *             A record someone has bookmarked is never deleted — it is tagged
 *             "not-software" instead and listed, so the user's list does not
 *             silently lose an item.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npx tsx scripts/rescore-software.ts
 *   docker compose --profile tools run --rm tools npx tsx scripts/rescore-software.ts --apply
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";

import { scoreSoftware } from "../src/services/ingestion/software-filter";
import TORRecord from "../src/db/models/tor-record";
import Bookmark from "../src/db/models/bookmark";

const apply = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ต้องมี MONGODB_URI ใน .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[db] เชื่อมต่อแล้ว${apply ? "" : " | DRY RUN (ใส่ --apply เพื่อเขียนจริง)"}`);

  const records = await TORRecord.find({}, { title: 1, phase: 1, tags: 1, metadata: 1 }).lean();
  const bookmarked = new Set(
    (await Bookmark.distinct("torRecordId")).map((id) => String(id)),
  );

  const toDelete: typeof records = [];
  const toKeepFlagged: typeof records = [];
  const updates: Parameters<typeof TORRecord.bulkWrite>[0] = [];

  for (const rec of records) {
    const r = scoreSoftware(rec.title);
    if (!r.isSoftware) {
      (bookmarked.has(String(rec._id)) ? toKeepFlagged : toDelete).push(rec);
      continue;
    }
    const tags = new Set(rec.tags);
    if (r.isUncertain) tags.add("uncertain-classification");
    else tags.delete("uncertain-classification");
    updates.push({
      updateOne: {
        filter: { _id: rec._id },
        update: {
          $set: {
            tags: [...tags],
            "metadata.filterScore": r.score,
            "metadata.filterReason": r.reason,
          },
        },
      },
    });
  }

  console.log(`\nทั้งหมด ${records.length} | ยังผ่าน ${updates.length} | ไม่ผ่านแล้ว ${toDelete.length + toKeepFlagged.length}`);

  if (toDelete.length) {
    console.log(`\nจะลบ ${toDelete.length} รายการ:`);
    for (const rec of toDelete) {
      console.log(`  - [${rec.phase}] ${rec.title.slice(0, 90)}`);
      console.log(`      เดิม: ${rec.metadata?.filterReason ?? "-"}`);
    }
  }
  if (toKeepFlagged.length) {
    console.log(`\nไม่ผ่านแต่มีคน bookmark — จะติด tag "not-software" แทนการลบ (${toKeepFlagged.length}):`);
    for (const rec of toKeepFlagged) console.log(`  - ${rec.title.slice(0, 90)}`);
  }

  if (!apply) {
    await mongoose.disconnect();
    return;
  }

  const del = await TORRecord.deleteMany({ _id: { $in: toDelete.map((r) => r._id) } });
  const flag = await TORRecord.updateMany(
    { _id: { $in: toKeepFlagged.map((r) => r._id) } },
    { $addToSet: { tags: "not-software" }, $pull: { tags: "software" } },
  );
  const upd = updates.length ? await TORRecord.bulkWrite(updates) : null;

  console.log(
    `\n[db] ลบ ${del.deletedCount} | ติด not-software ${flag.modifiedCount} | อัปเดตคะแนน ${upd?.modifiedCount ?? 0}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n[fatal]", e);
  process.exit(1);
});
