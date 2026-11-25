/**
 * What the first-run tour says, and what it points at.
 *
 * Kept apart from the tour component so the wording can be changed without
 * touching positioning or completion logic.
 *
 * Targets are CSS selectors resolved at the moment the step is shown. A
 * missing target is not an error: the step still appears, centred, without a
 * highlight. That matters because the sidebar is `hidden md:flex`, so on a
 * phone those elements genuinely are not rendered.
 *
 * Anchors use `data-tour` attributes rather than class names, so restyling a
 * component cannot silently break the tour.
 *
 * Changing the steps: if the change is large enough that someone who saw the
 * old tour should see the new one, raise TOUR_ID (welcome-v1 → welcome-v2).
 * Users who completed v1 will then be shown v2 once. Editing a sentence does
 * not need a new id.
 */

export const TOUR_ID = "welcome-v1";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  id: string;
  /** CSS selector for the element to highlight; omit to centre the step. */
  target?: string;
  title: string;
  body: string;
  /** Optional aside, shown in a tinted box. */
  hint?: string;
  placement?: TourPlacement;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "ยินดีต้อนรับสู่ I Cheer TOR",
    body:
      "เครื่องมือนี้รวมประกาศจัดซื้อจัดจ้างด้านซอฟต์แวร์ของกรุงเทพมหานคร " +
      "มาไว้ที่เดียว แล้วช่วยดูว่าทีมของคุณมีคุณสมบัติตรงกับ TOR แต่ละฉบับแค่ไหน",
    hint: "ใช้เวลาแนะนำประมาณ 1 นาที — กด ข้าม ได้ตลอด",
    placement: "center",
  },
  {
    id: "procurement",
    target: '[data-tour="nav-procurement"]',
    title: "ค้นหางานที่เปิดรับ",
    body:
      "รายการประกาศทั้งหมดอยู่ที่นี่ กรองตามหน่วยงาน งบประมาณ หรือวันปิดรับซองได้ " +
      "และเปิดดูเอกสาร TOR ฉบับเต็มจาก e-GP ได้โดยตรง",
    placement: "right",
  },
  {
    id: "profile",
    target: '[data-tour="nav-profile"]',
    title: "กรอกโปรไฟล์ก่อนเป็นอันดับแรก",
    body:
      "ระบบเทียบคุณสมบัติในโปรไฟล์ เช่น ทุนจดทะเบียน ผลงานที่ผ่านมา และเทคโนโลยีที่ถนัด " +
      "กับเงื่อนไขใน TOR ถ้ายังไม่กรอก จะยังไม่เห็นผลการเทียบ",
    hint: "แนะนำให้เริ่มจากขั้นตอนนี้ เพราะฟีเจอร์อื่นต่อยอดจากข้อมูลตรงนี้",
    placement: "right",
  },
  {
    id: "alerts",
    target: '[data-tour="nav-alerts"]',
    title: "รับแจ้งเตือนเมื่อมีงานใหม่",
    body:
      "ช่วงเปิดรับฟังความเห็นร่าง TOR มักสั้นเพียงไม่กี่วัน " +
      "ตั้งแจ้งเตือนไว้เพื่อให้รู้ทันทีที่มีประกาศตรงกับโปรไฟล์ของคุณ",
    placement: "right",
  },
  {
    id: "bookmarks",
    target: '[data-tour="nav-bookmarks"]',
    title: "เก็บงานที่สนใจไว้",
    body: "กดบันทึกประกาศที่น่าสนใจไว้อ่านต่อ หรือเปรียบเทียบหลายฉบับพร้อมกันได้ภายหลัง",
    placement: "right",
  },
  {
    id: "done",
    title: "เริ่มต้นใช้งานได้เลย",
    body:
      "ขั้นตอนถัดไปที่แนะนำคือกรอกโปรไฟล์ของทีม แล้วจึงเปิดดูรายการประกาศ " +
      "ระบบจะแสดงความเข้ากันได้ของแต่ละ TOR ให้อัตโนมัติ",
    hint: "ข้อมูลทั้งหมดมาจากระบบ e-GP ของกรมบัญชีกลาง — การยื่นข้อเสนอต้องทำผ่านช่องทางราชการเท่านั้น",
    placement: "center",
  },
];
