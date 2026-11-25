/**
 * Mock Vendor Profiles for all loginable users in MongoDB.
 * Leaves panthat.k@gmail.com (the reference profile) untouched, and creates/updates
 * rich, realistic Thai IT vendor profiles for every other active user in the `users` collection.
 *
 * Usage: npx tsx scripts/mock-user-profiles.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
config({ path: ".env" });

import User from "../src/db/models/user";
import VendorProfile, {
  IPastContract,
  ICredential,
  IPersonnel,
} from "../src/db/models/vendor-profile";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env");
  process.exit(1);
}

interface MockProfilePayload {
  companyName: string;
  foundedYear: number;
  companyAge: number;
  registeredCapital: number;
  teamSize: number;
  pastContracts: IPastContract[];
  techStacks: string[];
  interestedCategories: string[];
  credentials: ICredential[];
  personnel: IPersonnel[];
}

const REFERENCE_EMAIL = "panthat.k@gmail.com";

const MOCK_PROFILES_BY_EMAIL: Record<string, MockProfilePayload> = {
  "panthut.k@ku.th": {
    companyName: "บริษัท สยามดิจิทัล โซลูชันส์ จำกัด (Siam Digital Solutions Co., Ltd.)",
    foundedYear: 2018,
    companyAge: 8,
    registeredCapital: 10000000,
    teamSize: 35,
    pastContracts: [
      {
        description:
          "ระบบพอร์ทัลบริการประชาชนออนไลน์และยื่นคำร้องดิจิทัล (One-Stop e-Service Portal)",
        value: 6800000,
        year: 2026,
        agencyName: "สำนักยุทธศาสตร์และประเมินผล กรุงเทพมหานคร",
        agencyType: "government",
      },
      {
        description:
          "แอปพลิเคชันแจ้งเรื่องร้องทุกข์และติดตามงานบริการสาธารณะ (Citizen Connect Mobile App)",
        value: 4500000,
        year: 2025,
        agencyName: "กรมส่งเสริมการปกครองท้องถิ่น",
        agencyType: "government",
      },
      {
        description:
          "ระบบบริหารจัดการข้อมูลสารสนเทศองค์กรและเอกสารอิเล็กทรอนิกส์ (Enterprise MIS & Workflow)",
        value: 3100000,
        year: 2024,
        agencyName: "สำนักงานปลัดกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม",
        agencyType: "government",
      },
    ],
    techStacks: [
      "React",
      "Next.js",
      "TypeScript",
      "Node.js",
      "PostgreSQL",
      "Flutter",
      "Docker",
      "AWS",
    ],
    interestedCategories: [
      "ระบบเว็บแอปพลิเคชัน (Web Application)",
      "แอปพลิเคชันมือถือ (Mobile Application)",
      "ระบบสารสนเทศ / พอร์ทัลข้อมูล (Data Portal & MIS)",
    ],
    credentials: [
      {
        name: "ISO/IEC 29110",
        issuedBy: "สถาบันรับรองมาตรฐานไอเอสโอ (MASCI)",
        expiresAt: new Date("2028-06-30"),
      },
      {
        name: "ISO/IEC 27001",
        issuedBy: "BSI Thailand",
        expiresAt: new Date("2028-12-31"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการดิจิทัล (depa d-list)",
        issuedBy: "สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa)",
        expiresAt: new Date("2027-12-31"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการ SME (THAI SME-GP)",
        issuedBy: "สำนักงานส่งเสริมวิสาหกิจขนาดกลางและขนาดย่อม (สสว.)",
        expiresAt: new Date("2027-09-30"),
      },
    ],
    personnel: [
      {
        role: "Project Manager",
        count: 2,
        certifications: ["PMP", "Certified ScrumMaster (CSM)"],
      },
      {
        role: "System Analyst",
        count: 4,
        certifications: ["CBAP", "ITIL 4 Foundation"],
      },
      {
        role: "Full-Stack Developer",
        count: 12,
        certifications: ["AWS Certified Developer"],
      },
      {
        role: "QA / Software Tester",
        count: 4,
        certifications: ["ISTQB Certified Tester"],
      },
    ],
  },

  "natcha.limsu@ku.th": {
    companyName: "บริษัท นครา ดาต้า แอนด์ เอไอ จำกัด (Nakara Data & AI Co., Ltd.)",
    foundedYear: 2020,
    companyAge: 6,
    registeredCapital: 8000000,
    teamSize: 28,
    pastContracts: [
      {
        description:
          "ระบบแดชบอร์ดวิเคราะห์ข้อมูลเมืองอัจฉริยะและพยากรณ์การจราจรด้วย AI (Smart City Analytics & Traffic AI)",
        value: 5400000,
        year: 2026,
        agencyName: "สำนักการจราจรและขนส่ง กรุงเทพมหานคร",
        agencyType: "government",
      },
      {
        description:
          "ระบบคลังข้อมูลขนาดใหญ่และรายงานอัจฉริยะสำหรับผู้บริหาร (Enterprise Data Lake & Executive BI)",
        value: 4200000,
        year: 2025,
        agencyName: "สำนักงานสถิติแห่งชาติ",
        agencyType: "government",
      },
    ],
    techStacks: [
      "Python",
      "React",
      "Next.js",
      "TypeScript",
      "Node.js",
      "PostgreSQL",
      "AI & Machine Learning",
      "Data Analytics / BI",
      "Google Cloud (GCP)",
    ],
    interestedCategories: [
      "ปัญญาประดิษฐ์ (AI & Machine Learning)",
      "แดชบอร์ดและวิเคราะห์ข้อมูล (Dashboard & Analytics)",
      "อินเทอร์เน็ตของสรรพสิ่ง / สมาร์ทซิตี้ (IoT & Smart City)",
      "ระบบสารสนเทศ / พอร์ทัลข้อมูล (Data Portal & MIS)",
    ],
    credentials: [
      {
        name: "ISO/IEC 29110",
        issuedBy: "MASCI",
        expiresAt: new Date("2028-05-15"),
      },
      {
        name: "ISO/IEC 27001",
        issuedBy: "TÜV NORD",
        expiresAt: new Date("2028-11-30"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการ SME (THAI SME-GP)",
        issuedBy: "สสว.",
        expiresAt: new Date("2027-11-30"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการดิจิทัล (depa d-list)",
        issuedBy: "depa",
        expiresAt: new Date("2028-03-31"),
      },
    ],
    personnel: [
      {
        role: "Project Manager",
        count: 2,
        certifications: ["PMP", "Agile Certified Practitioner (PMI-ACP)"],
      },
      {
        role: "Data Scientist / AI Engineer",
        count: 6,
        certifications: [
          "Google Cloud Professional Machine Learning Engineer",
          "TensorFlow Developer",
        ],
      },
      {
        role: "Data Engineer",
        count: 4,
        certifications: ["Google Cloud Professional Data Engineer"],
      },
      {
        role: "System Analyst",
        count: 3,
        certifications: ["CBAP", "ITIL 4 Foundation"],
      },
    ],
  },

  "piyawat.wiri@ku.th": {
    companyName:
      "บริษัท บางกอก คลาวด์ แอนด์ ซีเคียวริตี้ จำกัด (Bangkok Cloud & Security Co., Ltd.)",
    foundedYear: 2017,
    companyAge: 9,
    registeredCapital: 20000000,
    teamSize: 62,
    pastContracts: [
      {
        description:
          "โครงการจัดหาและติดตั้งระบบโครงสร้างพื้นฐานคลาวด์ภาครัฐและศูนย์สำรองข้อมูล (Private Cloud & DR Site)",
        value: 14500000,
        year: 2026,
        agencyName: "การประปานครหลวง (MWA)",
        agencyType: "government",
      },
      {
        description:
          "โครงการพัฒนาระบบความมั่นคงปลอดภัยไซเบอร์และศูนย์เฝ้าระวังภัยคุกคาม 24 ชั่วโมง (SOC & Zero Trust)",
        value: 9800000,
        year: 2025,
        agencyName: "สำนักเทคโนโลยีสารสนเทศ กรมสรรพากร",
        agencyType: "government",
      },
      {
        description:
          "โครงการบำรุงรักษาและปรับปรุงระบบเครือข่ายและแม่ข่ายหลัก (Core Infrastructure Maintenance)",
        value: 6200000,
        year: 2024,
        agencyName:
          "สำนักงานคณะกรรมการกิจการกระจายเสียง กิจการโทรทัศน์ และกิจการโทรคมนาคมแห่งชาติ (กสทช.)",
        agencyType: "government",
      },
    ],
    techStacks: [
      "Docker",
      "Kubernetes",
      "AWS",
      "Microsoft Azure",
      "Java",
      "Spring Boot",
      "Go",
      "PostgreSQL",
      "Redis",
    ],
    interestedCategories: [
      "ระบบคลาวด์และโครงสร้างพื้นฐาน (Cloud & Infrastructure)",
      "ความมั่นคงปลอดภัยไซเบอร์ (Cybersecurity)",
      "จัดหาและติดตั้งระบบสารสนเทศ (IT Procurement & Setup)",
      "พัฒนาระบบและบำรุงรักษา (Maintenance & Support)",
    ],
    credentials: [
      {
        name: "ISO/IEC 27001",
        issuedBy: "BSI Thailand",
        expiresAt: new Date("2028-10-31"),
      },
      {
        name: "ISO/IEC 20000-1",
        issuedBy: "SGS Thailand",
        expiresAt: new Date("2028-08-31"),
      },
      {
        name: "ISO 9001",
        issuedBy: "SGS Thailand",
        expiresAt: new Date("2028-08-31"),
      },
      {
        name: "CSA STAR (Cloud Security)",
        issuedBy: "Cloud Security Alliance",
        expiresAt: new Date("2027-12-31"),
      },
      {
        name: "หนังสือแต่งตั้งตัวแทนจำหน่าย (Authorized Reseller/Partner)",
        issuedBy: "AWS / Palo Alto Networks",
        expiresAt: new Date("2027-12-31"),
      },
    ],
    personnel: [
      {
        role: "Project Manager",
        count: 4,
        certifications: ["PMP", "PRINCE2 Practitioner"],
      },
      {
        role: "Cloud & Infrastructure Architect",
        count: 6,
        certifications: [
          "AWS Solutions Architect Professional",
          "CKA (Certified Kubernetes Administrator)",
        ],
      },
      {
        role: "Cybersecurity Specialist",
        count: 5,
        certifications: ["CISSP", "CISM", "CEH"],
      },
      {
        role: "System Engineer",
        count: 8,
        certifications: ["ITIL 4 Foundation", "CCNP Enterprise"],
      },
    ],
  },

  "natchalimsuwan1@gmail.com": {
    companyName:
      "บริษัท ไอเชียร์ ซอฟต์แวร์ สตูดิโอ จำกัด (ICheer Software Studio Co., Ltd.)",
    foundedYear: 2021,
    companyAge: 5,
    registeredCapital: 3000000,
    teamSize: 16,
    pastContracts: [
      {
        description:
          "ระบบจองคิวออนไลน์และให้บริการประชาชนผ่านเว็บและแอปพลิเคชัน (Smart Queue & Citizen Service)",
        value: 2400000,
        year: 2026,
        agencyName: "สำนักงานเขตจตุจักร กรุงเทพมหานคร",
        agencyType: "government",
      },
      {
        description:
          "แอปพลิเคชันติดตามการตรวจเยี่ยมและรายงานผลภาคสนาม (Mobile Field Inspection App)",
        value: 1850000,
        year: 2025,
        agencyName: "สำนักอนามัย กรุงเทพมหานคร",
        agencyType: "government",
      },
    ],
    techStacks: [
      "Next.js",
      "React",
      "TypeScript",
      "Node.js",
      "MySQL",
      "MongoDB",
      "React Native",
      "iOS (Swift)",
      "Android (Kotlin)",
    ],
    interestedCategories: [
      "ระบบเว็บแอปพลิเคชัน (Web Application)",
      "แอปพลิเคชันมือถือ (Mobile Application)",
      "พัฒนาระบบและบำรุงรักษา (Maintenance & Support)",
    ],
    credentials: [
      {
        name: "ISO/IEC 29110",
        issuedBy: "MASCI",
        expiresAt: new Date("2028-04-30"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการ SME (THAI SME-GP)",
        issuedBy: "สสว.",
        expiresAt: new Date("2027-12-31"),
      },
      {
        name: "ขึ้นทะเบียนผู้ประกอบการดิจิทัล (depa d-list)",
        issuedBy: "depa",
        expiresAt: new Date("2028-01-31"),
      },
    ],
    personnel: [
      {
        role: "Project Manager",
        count: 2,
        certifications: ["PMP", "Certified ScrumMaster (CSM)"],
      },
      {
        role: "System Analyst",
        count: 2,
        certifications: ["ITIL 4 Foundation"],
      },
      {
        role: "Mobile & Web Developer",
        count: 8,
        certifications: ["Meta React Native Specialist"],
      },
      {
        role: "UX/UI Designer",
        count: 2,
        certifications: ["Google UX Design Certificate"],
      },
    ],
  },

  "nicekuy7868@gmail.com": {
    companyName:
      "บริษัท เจ้าพระยา อินทิเกรชัน ซิสเต็มส์ จำกัด (Chao Phraya Integration Systems Co., Ltd.)",
    foundedYear: 2016,
    companyAge: 10,
    registeredCapital: 15000000,
    teamSize: 48,
    pastContracts: [
      {
        description:
          "ระบบบริหารจัดการงบประมาณ พัสดุ และทรัพยากรบุคคลภาครัฐ (Government ERP & e-Budgeting)",
        value: 8900000,
        year: 2026,
        agencyName: "สำนักการคลัง กรุงเทพมหานคร",
        agencyType: "government",
      },
      {
        description:
          "ระบบเชื่อมโยงข้อมูลทะเบียนและแลกเปลี่ยนข้อมูลระหว่างหน่วยงานผ่าน API Gateway (Inter-Agency API Hub)",
        value: 5600000,
        year: 2025,
        agencyName: "กรมการปกครอง กระทรวงมหาดไทย",
        agencyType: "government",
      },
    ],
    techStacks: [
      "Java",
      "Spring Boot",
      "C# / .NET",
      "Angular",
      "TypeScript",
      "PostgreSQL",
      "MySQL",
      "Docker",
      "Kubernetes",
    ],
    interestedCategories: [
      "ระบบบริหารจัดการองค์กร (ERP / CRM)",
      "ระบบเชื่อมโยงข้อมูล (System Integration & API)",
      "พัฒนาระบบและบำรุงรักษา (Maintenance & Support)",
    ],
    credentials: [
      {
        name: "CMMI Level 3",
        issuedBy: "ISACA / CMMI Institute",
        expiresAt: new Date("2028-09-30"),
      },
      {
        name: "ISO/IEC 27001",
        issuedBy: "BSI Thailand",
        expiresAt: new Date("2028-06-30"),
      },
      {
        name: "ISO 9001",
        issuedBy: "MASCI",
        expiresAt: new Date("2028-06-30"),
      },
      {
        name: "มาตรฐาน มรท. 8001",
        issuedBy: "สมอ.",
        expiresAt: new Date("2027-12-31"),
      },
    ],
    personnel: [
      {
        role: "Project Manager",
        count: 3,
        certifications: ["PMP", "PRINCE2 Practitioner"],
      },
      {
        role: "System Analyst",
        count: 5,
        certifications: ["CBAP", "ITIL 4 Foundation"],
      },
      {
        role: "Enterprise Integration Architect",
        count: 3,
        certifications: ["TOGAF 9 Certified", "Oracle Certified Master"],
      },
      {
        role: "Backend Developer",
        count: 14,
        certifications: ["Oracle Certified Professional Java SE"],
      },
    ],
  },
};

async function main() {
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected to MongoDB");

  const users = await User.find({ status: "active" }).lean();
  console.log(`Found ${users.length} active loginable users\n`);

  for (const user of users) {
    if (user.email === REFERENCE_EMAIL) {
      console.log(`⏭️  Skipping reference user: ${user.email}`);
      continue;
    }

    const payload = MOCK_PROFILES_BY_EMAIL[user.email];
    if (!payload) {
      console.log(`⚠️  No mock payload configured for: ${user.email}`);
      continue;
    }

    const existing = await VendorProfile.findOne({ userId: user._id });
    if (existing) {
      existing.set(payload);
      await existing.save(); // triggers pre-save hook to recompute maxContractValue
      console.log(
        `✅ Updated profile for ${user.email} → ${existing.companyName} (maxContractValue: ${existing.maxContractValue.toLocaleString()} THB)`,
      );
    } else {
      const created = await VendorProfile.create({
        userId: user._id,
        ...payload,
      });
      console.log(
        `🆕 Created profile for ${user.email} → ${created.companyName} (maxContractValue: ${created.maxContractValue.toLocaleString()} THB)`,
      );
    }
  }

  console.log("\nDone!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed to mock user profiles:", err);
  process.exit(1);
});
