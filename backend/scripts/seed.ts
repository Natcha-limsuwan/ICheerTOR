/**
 * Seed script — populate MongoDB with demo data for development.
 *
 * Usage: npx tsx scripts/seed.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
config({ path: ".env.local" });

import User from "../lib/db/models/user";
import VendorProfile from "../lib/db/models/vendor-profile";
import TORRecord from "../lib/db/models/tor-record";
import Bookmark from "../lib/db/models/bookmark";
import Notification from "../lib/db/models/notification";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env.local");
  process.exit(1);
}

function dedupeHash(title: string, agency: string, date: string): string {
  return crypto
    .createHash("sha256")
    .update(`${title.trim()}|${agency.trim()}|${date}`)
    .digest("hex")
    .slice(0, 16);
}

async function seed() {
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected to MongoDB");

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
    TORRecord.deleteMany({}),
    Bookmark.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log("Cleared existing data");

  // ─── Users ──────────────────────────────────────────────────────
  const [userDemo, adminDemo] = await User.create([
    {
      googleId: "google-demo-user-001",
      email: "demo@icheertor.dev",
      name: "ทีมพัฒนา Demo",
      avatarUrl: "https://ui-avatars.com/api/?name=Demo+User&background=0047AB&color=fff",
      role: "user",
      status: "active",
      isVerified: true,
      notificationPrefs: { inApp: true, email: true, line: false },
      locale: "th",
    },
    {
      googleId: "google-admin-001",
      email: "admin@icheertor.dev",
      name: "ผู้ดูแลระบบ",
      avatarUrl: "https://ui-avatars.com/api/?name=Admin&background=DC3545&color=fff",
      role: "admin",
      status: "active",
      isVerified: true,
      notificationPrefs: { inApp: true, email: true, line: false },
      locale: "th",
    },
  ]);
  console.log(`Created ${2} users`);

  // ─── Vendor Profile ─────────────────────────────────────────────
  await VendorProfile.create({
    userId: userDemo._id,
    companyName: "บริษัท เดโม เทคโนโลยี จำกัด",
    companyAge: 5,
    pastContracts: [
      { description: "ระบบจัดการข้อมูลสำหรับ สำนักงานเขตบางรัก", value: 3500000, year: 2025, agencyName: "สำนักงานเขตบางรัก" },
      { description: "ระบบบริหารงานบุคคล สำนักยุทธศาสตร์", value: 7200000, year: 2024, agencyName: "สำนักยุทธศาสตร์และประเมินผล" },
    ],
    techStacks: ["React", "Node.js", "MongoDB", "Python", "TypeScript", "Next.js"],
    credentials: [
      { name: "ISO 27001", issuedBy: "BSI", expiresAt: new Date("2027-12-31") },
      { name: "มาตรฐาน มรท. 8001", issuedBy: "สมอ." },
    ],
    teamSize: 18,
  });
  console.log("Created vendor profile");

  // ─── TOR Records ────────────────────────────────────────────────
  const torRecords = await TORRecord.create([
    {
      title: "จ้างพัฒนาระบบจัดการข้อมูลเมืองอัจฉริยะ (Smart City Data Platform)",
      agencyName: "สำนักยุทธศาสตร์และประเมินผล",
      phase: "bidding",
      medianPrice: 12500000,
      budget: 14000000,
      postingDate: new Date("2026-08-01"),
      submissionDeadline: new Date("2026-09-15"),
      sourceUrl: "https://procurement.bangkok.go.th/example/001",
      officialPortalUrl: "https://www.gprocurement.go.th/example/001",
      pdfUrl: "https://procurement.bangkok.go.th/example/001/tor.pdf",
      parsedData: {
        scopeOfWork: { content: "พัฒนาระบบรวบรวมและวิเคราะห์ข้อมูลเมืองจากเซ็นเซอร์ IoT ทั่วกรุงเทพมหานคร เชื่อมต่อกับระบบ GIS และแดชบอร์ดแบบ Real-time สำหรับผู้บริหาร", confidence: 0.92 },
        qualifications: [
          { criterion: "ทุนจดทะเบียนไม่น้อยกว่า 5,000,000 บาท", minimumValue: 5000000, type: "contract_value", confidence: 0.95 },
          { criterion: "อายุบริษัทไม่น้อยกว่า 3 ปี", minimumValue: 3, type: "company_age", confidence: 0.88 },
          { criterion: "มีประสบการณ์ด้าน IoT/Cloud Computing", minimumValue: "IoT, Cloud Computing", type: "tech_stack", confidence: 0.85 },
          { criterion: "ได้รับมาตรฐาน ISO 27001", minimumValue: "ISO 27001", type: "certification", confidence: 0.90 },
        ],
        medianPrice: { value: 12500000, confidence: 0.95 },
        evaluationCriteria: { content: "คะแนนด้านเทคนิค 70% (ประเมินจากแผนงาน ประสบการณ์ ทีมงาน) และด้านราคา 30%", confidence: 0.87 },
      },
      redFlags: [],
      extractionStatus: "completed",
      deduplicationHash: dedupeHash("จ้างพัฒนาระบบจัดการข้อมูลเมืองอัจฉริยะ", "สำนักยุทธศาสตร์และประเมินผล", "2026-08-01"),
      tags: ["IoT", "Cloud", "GIS", "Dashboard", "Smart City"],
    },
    {
      title: "จ้างพัฒนาระบบ AI สำหรับวิเคราะห์การจราจร กรุงเทพมหานคร",
      agencyName: "สำนักการจราจรและขนส่ง",
      phase: "public_hearing",
      medianPrice: 8500000,
      budget: 9000000,
      postingDate: new Date("2026-08-10"),
      publicHearingStart: new Date("2026-08-10"),
      publicHearingEnd: new Date("2026-08-25"),
      submissionDeadline: new Date("2026-10-01"),
      sourceUrl: "https://procurement.bangkok.go.th/example/002",
      officialPortalUrl: "https://www.gprocurement.go.th/example/002",
      parsedData: {
        scopeOfWork: { content: "พัฒนาระบบ AI วิเคราะห์สภาพจราจรแบบ Real-time จากกล้อง CCTV ในพื้นที่กรุงเทพมหานคร พร้อมระบบแจ้งเตือนและรายงานสถิติ", confidence: 0.89 },
        qualifications: [
          { criterion: "ทุนจดทะเบียนไม่น้อยกว่า 10,000,000 บาท", minimumValue: 10000000, type: "contract_value", confidence: 0.93 },
          { criterion: "อายุบริษัทไม่น้อยกว่า 5 ปี", minimumValue: 5, type: "company_age", confidence: 0.91 },
          { criterion: "มีประสบการณ์ด้าน AI/Machine Learning", minimumValue: "AI, Machine Learning", type: "tech_stack", confidence: 0.87 },
          { criterion: "ต้องเคยทำโครงการกับหน่วยงานราชการ มูลค่าไม่น้อยกว่า 8,000,000 บาท", minimumValue: 8000000, type: "contract_value", confidence: 0.85 },
        ],
        medianPrice: { value: 8500000, confidence: 0.92 },
        evaluationCriteria: { content: "คะแนนเทคนิค 60% ราคา 40%", confidence: 0.88 },
      },
      redFlags: [
        {
          clauseText: "ต้องเคยทำโครงการกับหน่วยงานราชการ มูลค่าไม่น้อยกว่า 8,000,000 บาท",
          reason: "ข้อกำหนดมูลค่าขั้นต่ำของสัญญาสูงเมื่อเทียบกับราคากลาง (94% ของราคากลาง) ซึ่งอาจจำกัดการแข่งขัน",
          severity: "warning",
          recommendedAction: "พิจารณายื่นความคิดเห็นในช่วงรับฟังความคิดเห็น เสนอให้ลดมูลค่าขั้นต่ำลงเพื่อเปิดโอกาสการแข่งขัน",
          ruleId: "RF-002",
        },
      ],
      extractionStatus: "completed",
      deduplicationHash: dedupeHash("จ้างพัฒนาระบบ AI สำหรับวิเคราะห์การจราจร", "สำนักการจราจรและขนส่ง", "2026-08-10"),
      tags: ["AI", "Machine Learning", "CCTV", "Traffic", "Real-time"],
    },
    {
      title: "จ้างพัฒนาเว็บไซต์บริการประชาชนออนไลน์ (Digital Service Portal)",
      agencyName: "สำนักงานคณะกรรมการข้อมูลข่าวสารของราชการ",
      phase: "bidding",
      medianPrice: 3200000,
      budget: 3500000,
      postingDate: new Date("2026-07-20"),
      submissionDeadline: new Date("2026-08-30"),
      sourceUrl: "https://procurement.bangkok.go.th/example/003",
      officialPortalUrl: "https://www.gprocurement.go.th/example/003",
      parsedData: {
        scopeOfWork: { content: "ออกแบบและพัฒนาเว็บไซต์ให้บริการประชาชนแบบ One-Stop Service รองรับการยื่นคำร้อง ติดตามสถานะ และชำระค่าธรรมเนียมออนไลน์", confidence: 0.94 },
        qualifications: [
          { criterion: "ทุนจดทะเบียนไม่น้อยกว่า 2,000,000 บาท", minimumValue: 2000000, type: "contract_value", confidence: 0.96 },
          { criterion: "อายุบริษัทไม่น้อยกว่า 2 ปี", minimumValue: 2, type: "company_age", confidence: 0.93 },
          { criterion: "มีประสบการณ์ด้าน Web Development", minimumValue: "Web Development", type: "tech_stack", confidence: 0.91 },
        ],
        medianPrice: { value: 3200000, confidence: 0.97 },
        evaluationCriteria: { content: "พิจารณาจากคุณภาพทางเทคนิค 70% และราคา 30%", confidence: 0.90 },
      },
      redFlags: [],
      extractionStatus: "completed",
      deduplicationHash: dedupeHash("จ้างพัฒนาเว็บไซต์บริการประชาชนออนไลน์", "สำนักงานคณะกรรมการข้อมูลข่าวสาร", "2026-07-20"),
      tags: ["Web Development", "E-Government", "Portal", "React"],
    },
    {
      title: "จ้างพัฒนาระบบบริหารจัดการฐานข้อมูลทะเบียนราษฎร์ดิจิทัล",
      agencyName: "สำนักทะเบียน กรุงเทพมหานคร",
      phase: "bidding",
      medianPrice: 18000000,
      budget: 20000000,
      postingDate: new Date("2026-08-05"),
      submissionDeadline: new Date("2026-09-20"),
      sourceUrl: "https://procurement.bangkok.go.th/example/004",
      officialPortalUrl: "https://www.gprocurement.go.th/example/004",
      parsedData: {
        scopeOfWork: { content: "พัฒนาระบบฐานข้อมูลทะเบียนราษฎร์แบบดิจิทัล รองรับการเชื่อมต่อกับระบบ Linkage Center ของรัฐบาล", confidence: 0.45 },
        qualifications: [
          { criterion: "ทุนจดทะเบียนไม่น้อยกว่า 15,000,000 บาท", minimumValue: 15000000, type: "contract_value", confidence: 0.88 },
          { criterion: "อายุบริษัทไม่น้อยกว่า 7 ปี", minimumValue: 7, type: "company_age", confidence: 0.55 },
        ],
        medianPrice: { value: 18000000, confidence: 0.93 },
        evaluationCriteria: { content: "ประเมินจากคุณสมบัติและเทคนิค", confidence: 0.40 },
      },
      redFlags: [],
      extractionStatus: "completed",
      deduplicationHash: dedupeHash("จ้างพัฒนาระบบบริหารจัดการฐานข้อมูลทะเบียนราษฎร์ดิจิทัล", "สำนักทะเบียน", "2026-08-05"),
      tags: ["Database", "Government", "Digital", "Integration"],
    },
    {
      title: "จ้างพัฒนาแอปพลิเคชันแจ้งเหตุฉุกเฉิน กรุงเทพมหานคร",
      agencyName: "สำนักป้องกันและบรรเทาสาธารณภัย",
      phase: "awarded",
      medianPrice: 5500000,
      budget: 6000000,
      postingDate: new Date("2026-06-01"),
      submissionDeadline: new Date("2026-07-15"),
      awardDate: new Date("2026-08-01"),
      sourceUrl: "https://procurement.bangkok.go.th/example/005",
      officialPortalUrl: "https://www.gprocurement.go.th/example/005",
      parsedData: {
        scopeOfWork: { content: "พัฒนาแอปพลิเคชันบนเว็บสำหรับแจ้งเหตุฉุกเฉินและติดตามสถานะการช่วยเหลือ", confidence: 0.91 },
        qualifications: [
          { criterion: "ทุนจดทะเบียนไม่น้อยกว่า 3,000,000 บาท", minimumValue: 3000000, type: "contract_value", confidence: 0.94 },
          { criterion: "อายุบริษัทไม่น้อยกว่า 3 ปี", minimumValue: 3, type: "company_age", confidence: 0.92 },
        ],
        medianPrice: { value: 5500000, confidence: 0.96 },
        evaluationCriteria: { content: "คุณภาพทางเทคนิค 60% ราคา 40%", confidence: 0.89 },
      },
      redFlags: [],
      extractionStatus: "completed",
      deduplicationHash: dedupeHash("จ้างพัฒนาแอปพลิเคชันแจ้งเหตุฉุกเฉิน", "สำนักป้องกันและบรรเทาสาธารณภัย", "2026-06-01"),
      tags: ["Mobile", "Emergency", "Real-time", "GIS"],
    },
  ]);
  console.log(`Created ${torRecords.length} TOR records`);

  // ─── Bookmarks ──────────────────────────────────────────────────
  await Bookmark.create([
    { userId: userDemo._id, torRecordId: torRecords[0]._id },
    { userId: userDemo._id, torRecordId: torRecords[2]._id },
  ]);
  console.log("Created bookmarks");

  // ─── Notifications ──────────────────────────────────────────────
  await Notification.create([
    {
      userId: userDemo._id,
      torRecordId: torRecords[0]._id,
      type: "new_match",
      title: "TOR ใหม่ที่ตรงกับโปรไฟล์ของคุณ",
      body: "พบ TOR ใหม่: จ้างพัฒนาระบบจัดการข้อมูลเมืองอัจฉริยะ จากสำนักยุทธศาสตร์และประเมินผล ราคากลาง ฿12,500,000",
      linkUrl: `/procurement/${torRecords[0]._id}`,
      channels: { inApp: { sent: true }, email: { sent: false }, line: { sent: false } },
    },
    {
      userId: userDemo._id,
      torRecordId: torRecords[1]._id,
      type: "public_hearing",
      title: "TOR เข้าสู่ช่วงรับฟังความคิดเห็น",
      body: "TOR: จ้างพัฒนาระบบ AI สำหรับวิเคราะห์การจราจร เข้าสู่ช่วงรับฟังความคิดเห็น ถึงวันที่ 25 สิงหาคม 2569",
      linkUrl: `/procurement/${torRecords[1]._id}`,
      channels: { inApp: { sent: true }, email: { sent: true, sentAt: new Date() }, line: { sent: false } },
    },
  ]);
  console.log("Created notifications");

  console.log("\n✅ Seed complete!");
  console.log(`  Users: 2 (1 user, 1 admin)`);
  console.log(`  Vendor Profiles: 1`);
  console.log(`  TOR Records: ${torRecords.length}`);
  console.log(`  Bookmarks: 2`);
  console.log(`  Notifications: 2`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
