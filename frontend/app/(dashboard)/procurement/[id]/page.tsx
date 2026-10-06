"use client";

import { getToken } from "@/lib/api/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";

type Qualification = { clauseNumber?: string | null; criterion: string; minimumValue?: number | string; unit?: string; isBoilerplate?: boolean; requiredCerts?: string[]; sourcePage?: number };
type Detail = {
  _id: string; title: string; agencyName: string; phase: string; displayPhase?: string; budget?: number; medianPrice?: number; postingDate: string; submissionDeadline?: string; publicHearingStart?: string; publicHearingEnd?: string; sourceUrl: string; officialPortalUrl?: string; extractionStatus: string; bidWindow?: { state: "open" | "closed" | "upcoming" | "today" | "unknown" }; redFlags?: Array<{ reason: string; clauseText: string; recommendedAction?: string }>;
  metadata?: { projectId?: string; projectType?: string; purchaseMethod?: string; announceType?: string; contractStatus?: string; phaseReason?: string };
  summary?: { overview: string; keyPoints?: string[]; deliverables?: string[] };
  parsedData?: {
    workType?: string; scopeOfWork?: { content?: string }; qualifications?: Qualification[]; medianPrice?: { value?: number | null }; documentPrices?: { budget?: { value?: number | null }; medianPrice?: { value?: number | null } };
    evaluationCriteria?: { content?: string; method?: string | null; weights?: Array<{ criterion: string; weight: number }> }; keyDates?: { submissionDate?: { date?: string | null; startTime?: string | null; endTime?: string | null; closesAt?: string | null }; documentFeePeriod?: { from: string; to: string } | null; contractDurationDays?: { value?: number | null }; warrantyMonths?: { value?: number | null } };
    techRequirements?: Array<{ name: string; isMandatory: boolean }>; paymentTerms?: Array<{ installment: number; percent: number | null; condition: string }>;
  };
};
type MatchResult = { matchScore: number | null; overallStatus: "eligible" | "ineligible" | "incomplete" | "unknown"; counts: { pass: number; fail: number; unknown: number } };

const workType: Record<string, string> = { development: "พัฒนาระบบ", license: "ลิขสิทธิ์ซอฟต์แวร์", hardware: "ฮาร์ดแวร์", maintenance: "บำรุงรักษา", service: "บริการ", other: "อื่น ๆ" };
const money = (value?: number | null) => value != null ? `฿${value.toLocaleString("th-TH")}` : "—";
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "—";
const bangkokDay = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
};
const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return null;
  return Math.round((bangkokDay(deadline) - bangkokDay(new Date())) / 86_400_000);
};
function Title({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4 text-xl font-bold text-slate-800"><span className="text-[#0759be]">{icon}</span>{children}</div>; }
function Row({ label, value }: { label: string; value?: string }) { return value ? <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0"><span className="text-slate-500">{label}</span><strong className="text-right">{value}</strong></div> : null; }

export default function TORDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tor, setTor] = useState<Detail | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${apiUrl}/tor/${id}`, { headers }).then((r) => r.json()),
      fetch(`${apiUrl}/tor/${id}/match`, { headers }).then((r) => r.ok ? r.json() : null),
    ]).then(([detail, matchResponse]) => {
      setTor(detail.data ?? null);
      setMatch(matchResponse?.data ?? null);
    }).catch(() => setTor(null));
  }, [id]);
  if (!tor) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">กำลังโหลดรายละเอียด TOR...</div>;

  const parsed = tor.parsedData;
  const completed = tor.extractionStatus === "completed";
  const specific = (parsed?.qualifications ?? []).filter((item) => !item.isBoilerplate);
  const standard = (parsed?.qualifications ?? []).filter((item) => item.isBoilerplate);
  const overview = tor.summary?.overview ?? parsed?.scopeOfWork?.content;
  const bidDate = parsed?.keyDates?.submissionDate?.date ?? tor.submissionDeadline;
  const bidStartTime = parsed?.keyDates?.submissionDate?.startTime;
  const bidEndTime = parsed?.keyDates?.submissionDate?.endTime;
  const submissionDeadline = parsed?.keyDates?.submissionDate?.closesAt
    ?? parsed?.keyDates?.submissionDate?.date
    ?? tor.submissionDeadline;
  // Some records still carry the public-hearing phase after a final bidding
  // document has been extracted. Prefer the confirmed bid date when present
  // so list and detail views do not show different deadlines.
  const hasBidDeadline = Boolean(submissionDeadline);
  const deadline = submissionDeadline ?? tor.publicHearingEnd;
  const deadlineKind = hasBidDeadline ? "กำหนดยื่นข้อเสนอ" : "สิ้นสุดรับฟังความคิดเห็น";
  const remainingDays = daysUntil(deadline);
  const bidClosed = tor.displayPhase === "closed" || (tor.phase === "bidding" && tor.bidWindow?.state === "closed");
  const displayStatus = bidClosed ? "ปิดรับข้อเสนอแล้ว" : tor.phase === "bidding" ? "เปิดรับข้อเสนอ" : tor.phase === "public_hearing" ? "รับฟังความคิดเห็น" : tor.phase;
  const scheduleLabel = hasBidDeadline
    ? (bidClosed ? "กำหนดยื่นข้อเสนอ (ปิดแล้ว)" : "กำหนดยื่นข้อเสนอ")
    : "ช่วงรับฟังความคิดเห็น";
  const period = hasBidDeadline
    ? `${date(bidDate)}${bidStartTime ? ` เวลา ${bidStartTime}${bidEndTime ? `–${bidEndTime}` : ""}` : ""}`
    : tor.publicHearingStart || tor.publicHearingEnd
      ? `เริ่ม ${date(tor.publicHearingStart)} – สิ้นสุด ${date(tor.publicHearingEnd)}`
      : "ยังไม่ประกาศวันที่";

  return <div className="mx-auto max-w-[1340px] animate-fade-in pb-10 text-slate-800">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-500"><Link href="/procurement" className="no-underline text-slate-500 hover:text-[#0759be]">จัดซื้อจัดจ้าง</Link><span className="mx-3">›</span>รายละเอียดโครงการ</p>{tor.officialPortalUrl && <a href={tor.officialPortalUrl} target="_blank" rel="noreferrer" className="detail-action detail-action-outline"><OpenInNewIcon fontSize="small" />ไปที่ประกาศต้นทาง</a>}</div>
    <div className="mb-7"><div className="mb-4 flex gap-2"><span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${bidClosed ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-[#1762be]"}`}>● {displayStatus}</span>{completed && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">วิเคราะห์ TOR แล้ว</span>}</div><h1 className="text-3xl font-bold md:text-4xl">{tor.title}</h1><p className="mt-4 flex items-center gap-2 text-lg text-slate-500"><ApartmentOutlinedIcon />{tor.agencyName}</p></div>
    <DeadlineNotice label={deadlineKind} deadline={deadline} remainingDays={remainingDays} />
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label={scheduleLabel} value={period} /><Stat label="งบประมาณที่จัดสรร" value={money(tor.budget ?? parsed?.medianPrice?.value)} /><Stat label="ราคากลาง" value={money(tor.medianPrice ?? parsed?.medianPrice?.value)} /><Stat label="ความเหมาะสมกับทีม" value={match?.matchScore != null ? `${Math.round(match.matchScore * 100)}%` : "กรอกโปรไฟล์เพื่อดูผล"} note={match?.matchScore != null ? `ผ่าน ${match.counts.pass} / ตรวจได้ ${match.counts.pass + match.counts.fail} ข้อ` : undefined} /></div>
    {!completed ? <section className="detail-panel"><Title icon={<WarningAmberOutlinedIcon />}>สถานะการวิเคราะห์เอกสาร</Title><p className="text-slate-600">รายการนี้ยังไม่มีผล extraction ที่สมบูรณ์ จะแสดงรายละเอียดเชิงลึกเมื่อสถานะเป็น completed</p></section> : <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]"><main className="space-y-7">
      {overview && <section className="detail-panel"><Title icon={<LightbulbOutlinedIcon />}>สรุปโครงการและขอบเขตงาน</Title><p className="whitespace-pre-wrap leading-8 text-slate-600">{overview}</p>{tor.summary?.keyPoints?.length ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">{tor.summary.keyPoints.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>}
      {(tor.summary?.deliverables?.length || parsed?.techRequirements?.length) && <section className="detail-panel"><Title icon={<ComputerOutlinedIcon />}>สิ่งส่งมอบและข้อกำหนดทางเทคนิค</Title>{tor.summary?.deliverables?.length ? <Pills items={tor.summary.deliverables} /> : null}{parsed?.techRequirements?.length ? <Pills items={parsed.techRequirements.map((item) => `${item.name}${item.isMandatory ? " • จำเป็น" : ""}`)} /> : null}</section>}
      <section className="detail-panel"><Title icon={<FactCheckOutlinedIcon />}>คุณสมบัติผู้ยื่นข้อเสนอ</Title><Qualifications items={specific} empty="ไม่พบเงื่อนไขเฉพาะโครงการ" />{standard.length ? <details className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer font-semibold">เงื่อนไขทั่วไปตามระเบียบ ({standard.length} ข้อ)</summary><Qualifications items={standard} /></details> : null}</section>
      {(parsed?.keyDates?.submissionDate?.date || parsed?.keyDates?.documentFeePeriod || parsed?.keyDates?.contractDurationDays?.value != null || parsed?.keyDates?.warrantyMonths?.value != null) && <section className="detail-panel"><Title icon={<CalendarMonthOutlinedIcon />}>กำหนดการและระยะเวลาโครงการ</Title><div className="grid gap-3 sm:grid-cols-2"><Row label="วันยื่นข้อเสนอ" value={parsed?.keyDates?.submissionDate?.date ? `${date(parsed.keyDates.submissionDate.date)} ${parsed.keyDates.submissionDate.startTime ?? ""}–${parsed.keyDates.submissionDate.endTime ?? ""}` : undefined} /><Row label="ช่วงซื้อเอกสาร" value={parsed?.keyDates?.documentFeePeriod ? `${date(parsed.keyDates.documentFeePeriod.from)} – ${date(parsed.keyDates.documentFeePeriod.to)}` : undefined} /><Row label="ระยะเวลาดำเนินงาน" value={parsed?.keyDates?.contractDurationDays?.value != null ? `${parsed.keyDates.contractDurationDays.value} วัน` : undefined} /><Row label="ระยะเวลารับประกัน" value={parsed?.keyDates?.warrantyMonths?.value != null ? `${parsed.keyDates.warrantyMonths.value} เดือน` : undefined} /></div></section>}
      <div className="grid gap-7 md:grid-cols-2"><section className="detail-panel"><Title icon={<AccountBalanceWalletOutlinedIcon />}>การแจกแจงงบประมาณ</Title><Row label="งบประมาณที่จัดสรร" value={money(tor.budget)} /><Row label="ราคากลาง" value={money(tor.medianPrice)} /><Row label="วงเงินตาม TOR" value={money(parsed?.documentPrices?.budget?.value)} /></section><section className="detail-panel"><Title icon={<BarChartOutlinedIcon />}>เกณฑ์การประเมิน</Title><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{parsed?.evaluationCriteria?.content ?? "ยังไม่มีรายละเอียดเกณฑ์การประเมิน"}</p>{parsed?.evaluationCriteria?.weights?.map((item) => <div key={item.criterion} className="mt-3"><div className="flex justify-between text-sm"><span>{item.criterion}</span><strong>{item.weight}%</strong></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0759be]" style={{ width: `${item.weight}%` }} /></div></div>)}</section></div>
      {parsed?.paymentTerms?.length ? <section className="detail-panel"><Title icon={<ReceiptLongOutlinedIcon />}>เงื่อนไขการส่งมอบและชำระเงิน</Title>{parsed.paymentTerms.map((item) => <div key={item.installment} className="mb-3 rounded-xl bg-slate-50 p-4"><strong>งวดที่ {item.installment}{item.percent != null ? ` • ${item.percent}%` : ""}</strong><p className="mt-1 text-sm text-slate-600">{item.condition}</p></div>)}</section> : null}
    </main><aside className="space-y-6"><section className="detail-panel"><Title icon={<ReceiptLongOutlinedIcon />}>ข้อมูลการจัดซื้อจัดจ้าง</Title><Row label="ประเภทงาน" value={workType[parsed?.workType ?? ""]} /><Row label="ประเภทโครงการ" value={tor.metadata?.projectType} /><Row label="วิธีจัดซื้อ" value={tor.metadata?.purchaseMethod} /><Row label="ประเภทประกาศ" value={tor.metadata?.announceType} /><Row label="เลขที่โครงการ" value={tor.metadata?.projectId} /><Row label="สถานะ" value={tor.metadata?.contractStatus} />{tor.metadata?.phaseReason && <p className="mt-4 text-xs leading-5 text-slate-500">{tor.metadata.phaseReason}</p>}</section><section className="rounded-2xl border-l-4 border-red-600 bg-red-50 p-6"><Title icon={<FlagOutlinedIcon />}>การวิเคราะห์ความเสี่ยง</Title>{tor.redFlags?.length ? tor.redFlags.map((item) => <div key={item.reason} className="mb-3 rounded-xl bg-white p-4 text-sm"><strong>{item.reason}</strong><p className="mt-2">{item.clauseText}</p>{item.recommendedAction && <p className="mt-2 text-red-700">คำแนะนำ: {item.recommendedAction}</p>}</div>) : <p className="text-sm text-emerald-700">ไม่พบความเสี่ยงที่ต้องแจ้งเตือน</p>}</section></aside></div>}
  </div>;
}
function DeadlineNotice({ label, deadline, remainingDays }: { label: string; deadline?: string | null; remainingDays: number | null }) {
  const state = remainingDays == null
    ? { message: "ยังไม่ประกาศ deadline", className: "border-slate-200 bg-slate-50 text-slate-600" }
    : remainingDays < 0
      ? { message: `เลยกำหนดแล้ว ${Math.abs(remainingDays).toLocaleString("th-TH")} วัน`, className: "border-slate-300 bg-slate-100 text-slate-700" }
      : remainingDays === 0
        ? { message: "ครบกำหนดวันนี้", className: "border-red-300 bg-red-50 text-red-700" }
        : remainingDays <= 3
          ? { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-red-300 bg-red-50 text-red-700" }
          : remainingDays <= 7
            ? { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-amber-300 bg-amber-50 text-amber-800" }
            : { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-blue-200 bg-blue-50 text-blue-800" };

  return <div role="status" className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 ${state.className}`}><NotificationsActiveOutlinedIcon fontSize="small" /><strong>{state.message}</strong><span className="text-sm opacity-80">{deadline ? `${label}: ${date(deadline)}` : label}</span></div>;
}
function Stat({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="detail-stat"><p>{label}</p><strong>{value}</strong>{note && <span>{note}</span>}</div>; }
function Pills({ items }: { items: string[] }) { return <div className="mb-4 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm text-[#0759be]">{item}</span>)}</div>; }
function Qualifications({ items, empty }: { items: Qualification[]; empty?: string }) { return items.length ? <div className="divide-y divide-slate-100">{items.map((item, i) => <div key={`${item.clauseNumber}-${i}`} className="py-4"><p className="font-medium leading-6">{item.clauseNumber && <span className="mr-2 text-[#0759be]">ข้อ {item.clauseNumber}</span>}{item.criterion}</p>{item.minimumValue != null && <p className="mt-1 text-sm text-slate-500">ขั้นต่ำ: {typeof item.minimumValue === "number" && item.unit === "THB" ? money(item.minimumValue) : `${item.minimumValue} ${item.unit ?? ""}`}</p>}{item.requiredCerts?.length ? <p className="mt-1 text-sm text-slate-500">ใบรับรอง: {item.requiredCerts.join(", ")}</p> : null}</div>)}</div> : <p className="text-slate-500">{empty}</p>; }
