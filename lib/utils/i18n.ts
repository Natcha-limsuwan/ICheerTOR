/**
 * Lightweight i18n utility for Thai (primary) and English UI strings.
 *
 * Usage:
 *   import { t } from "@/lib/utils/i18n";
 *   t("nav.home")        → "หน้าหลัก" (when locale is "th")
 *   t("nav.home", "en")  → "Home"
 */

export type Locale = "th" | "en";

/* ---------- dictionary ------------------------------------------------ */

const dict: Record<string, Record<Locale, string>> = {
  // Navigation
  "nav.home": { th: "หน้าหลัก", en: "Home" },
  "nav.procurement": { th: "จัดซื้อจัดจ้าง", en: "Procurement" },
  "nav.alerts": { th: "การแจ้งเตือน", en: "Alerts" },
  "nav.profile": { th: "โปรไฟล์", en: "Profile" },
  "nav.bookmarks": { th: "บันทึกไว้", en: "Bookmarks" },
  "nav.admin": { th: "ผู้ดูแลระบบ", en: "Admin" },
  "nav.dashboard": { th: "แดชบอร์ด", en: "Dashboard" },
  "nav.compare": { th: "เปรียบเทียบ", en: "Compare" },

  // Auth
  "auth.signIn": { th: "เข้าสู่ระบบ", en: "Sign In" },
  "auth.signInGoogle": { th: "เข้าสู่ระบบด้วย Google", en: "Sign in with Google" },
  "auth.signOut": { th: "ออกจากระบบ", en: "Sign Out" },

  // Common
  "common.search": { th: "ค้นหา", en: "Search" },
  "common.filter": { th: "ตัวกรอง", en: "Filter" },
  "common.save": { th: "บันทึก", en: "Save" },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.delete": { th: "ลบ", en: "Delete" },
  "common.edit": { th: "แก้ไข", en: "Edit" },
  "common.loading": { th: "กำลังโหลด...", en: "Loading..." },
  "common.noResults": { th: "ไม่พบผลลัพธ์", en: "No results found" },
  "common.confirm": { th: "ยืนยัน", en: "Confirm" },
  "common.export": { th: "ส่งออกข้อมูล", en: "Export Data" },

  // TOR
  "tor.phase.publicHearing": { th: "ขั้นตอนรับฟังความคิดเห็น", en: "Public Hearing" },
  "tor.phase.bidding": { th: "ขั้นตอนเสนอราคา", en: "Bidding" },
  "tor.phase.awarded": { th: "ประกาศผลแล้ว", en: "Awarded" },
  "tor.phase.cancelled": { th: "ยกเลิก", en: "Cancelled" },
  "tor.medianPrice": { th: "ราคากลาง", en: "Median Price" },
  "tor.agency": { th: "หน่วยงาน", en: "Agency" },
  "tor.deadline": { th: "กำหนดส่ง", en: "Deadline" },
  "tor.scopeOfWork": { th: "ขอบเขตงาน", en: "Scope of Work" },
  "tor.qualifications": { th: "คุณสมบัติ", en: "Qualifications" },
  "tor.evaluationCriteria": { th: "เกณฑ์การประเมิน", en: "Evaluation Criteria" },
  "tor.viewSource": { th: "ดูประกาศต้นฉบับ", en: "View Source" },
  "tor.submitBid": { th: "ไปยังระบบจัดซื้อจัดจ้าง", en: "Go to Official Portal" },

  // Match
  "match.eligible": { th: "ผ่านคุณสมบัติ", en: "Eligible" },
  "match.ineligible": { th: "ไม่ผ่านคุณสมบัติ", en: "Ineligible" },
  "match.partial": { th: "ผ่านบางส่วน", en: "Partial Match" },
  "match.pass": { th: "ผ่าน", en: "Pass" },
  "match.fail": { th: "ไม่ผ่าน", en: "Fail" },
  "match.gap": { th: "ส่วนต่าง", en: "Gap" },
  "match.bridgeable": { th: "อาจปิดช่องว่างได้", en: "Potentially Bridgeable" },
  "match.completeProfile": {
    th: "กรุณากรอกโปรไฟล์บริษัทให้ครบถ้วนเพื่อดูผลจับคู่",
    en: "Please complete your company profile to view match results",
  },

  // Red Flags
  "redFlag.title": { th: "ข้อสังเกตเบื้องต้น", en: "Red Flags" },
  "redFlag.noFlags": { th: "ไม่พบข้อสังเกต", en: "No Flags Detected" },
  "redFlag.notHearingPhase": {
    th: "ไม่อยู่ในช่วงรับฟังความคิดเห็น",
    en: "Not in Public Hearing Phase",
  },
  "redFlag.submitFeedback": {
    th: "ส่งความคิดเห็นผ่านช่องทางราชการ",
    en: "Submit Feedback via Official Channel",
  },

  // Confidence
  "confidence.high": { th: "ความเชื่อมั่นสูง", en: "High Confidence" },
  "confidence.medium": { th: "ความเชื่อมั่นปานกลาง", en: "Medium Confidence" },
  "confidence.low": { th: "ความเชื่อมั่นต่ำ — กรุณาตรวจสอบ", en: "Low Confidence — Please Review" },

  // Notifications
  "notification.newMatch": { th: "TOR ใหม่ที่ตรงกับโปรไฟล์ของคุณ", en: "New TOR matching your profile" },
  "notification.publicHearing": { th: "TOR เข้าสู่ช่วงรับฟังความคิดเห็น", en: "TOR entering public hearing" },
  "notification.deadline": { th: "ใกล้ถึงกำหนดส่ง", en: "Deadline approaching" },
  "notification.award": { th: "ประกาศผลจัดซื้อจัดจ้าง", en: "Award announced" },

  // PDPA
  "pdpa.consent": { th: "ความยินยอม", en: "Consent" },
  "pdpa.exportData": { th: "ส่งออกข้อมูลส่วนบุคคล", en: "Export Personal Data" },
  "pdpa.deleteAccount": { th: "ลบบัญชีผู้ใช้", en: "Delete Account" },
  "pdpa.privacyNotice": {
    th: "เราใช้ข้อมูลส่วนบุคคลของคุณเพื่อจับคู่โอกาสจัดซื้อจัดจ้างและแจ้งเตือน กรุณายินยอมเพื่อดำเนินการต่อ",
    en: "We use your personal data for procurement opportunity matching and notifications. Please consent to continue.",
  },

  // Admin
  "admin.users": { th: "จัดการผู้ใช้", en: "Manage Users" },
  "admin.approve": { th: "อนุมัติ", en: "Approve" },
  "admin.suspend": { th: "ระงับ", en: "Suspend" },
  "admin.ban": { th: "แบน", en: "Ban" },
  "admin.reinstate": { th: "คืนสถานะ", en: "Reinstate" },
  "admin.verify": { th: "ยืนยันตัวตน", en: "Verify" },
};

/* ---------- API -------------------------------------------------------- */

let currentLocale: Locale = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as Locale) || "th";

/** Get the current active locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set the active locale. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Translate a key. Falls back to the key itself if not found.
 */
export function t(key: string, locale?: Locale): string {
  const l = locale ?? currentLocale;
  return dict[key]?.[l] ?? dict[key]?.["en"] ?? key;
}
