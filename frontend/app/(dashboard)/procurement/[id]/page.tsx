"use client";

import { getToken } from "@/lib/api/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import BookmarkOutlinedIcon from "@mui/icons-material/BookmarkOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useToast } from "@/components/providers/ToastProvider";

type Qualification = { clauseNumber?: string | null; criterion: string; minimumValue?: number | string; unit?: string; isBoilerplate?: boolean; requiredCerts?: string[]; sourcePage?: number };
type Detail = {
  _id: string; title: string; agencyName: string; phase: string; displayPhase?: string; budget?: number; medianPrice?: number; postingDate: string; submissionDeadline?: string; publicHearingStart?: string; publicHearingEnd?: string; sourceUrl: string; officialPortalUrl?: string; extractionStatus: string; bidWindow?: { state: "open" | "closed" | "upcoming" | "today" | "unknown" }; redFlags?: Array<{ reason: string; clauseText: string; recommendedAction?: string }>;
  metadata?: { projectId?: string; projectType?: string; purchaseMethod?: string; announceType?: string; contractStatus?: string };
  summary?: { overview: string; keyPoints?: string[]; deliverables?: string[] };
  parsedData?: {
    workType?: string; scopeOfWork?: { content?: string }; qualifications?: Qualification[]; medianPrice?: { value?: number | null }; documentPrices?: { budget?: { value?: number | null }; medianPrice?: { value?: number | null } };
    evaluationCriteria?: { content?: string; method?: string | null; weights?: Array<{ criterion: string; weight: number }> }; keyDates?: { submissionDate?: { date?: string | null; startTime?: string | null; endTime?: string | null; closesAt?: string | null }; documentFeePeriod?: { from: string; to: string } | null; contractDurationDays?: { value?: number | null }; warrantyMonths?: { value?: number | null } };
    techRequirements?: Array<{ name: string; isMandatory: boolean }>; paymentTerms?: Array<{ installment: number; percent: number | null; condition: string }>;
  };
};
type MatchDimension = "experience" | "technology" | "personnel" | "capacity" | "preference";
type MatchBreakdownItem = { label: string; weight: number; score: number | null; coverage: number; applicable: boolean; reasons: string[] };
type MatchResult = {
  matchScore: number | null;
  fitScore: number | null;
  dataCoverage: number;
  overallStatus: "eligible" | "ineligible" | "incomplete" | "unknown";
  eligibilityStatus: "eligible" | "ineligible" | "incomplete" | "unknown";
  counts: { pass: number; fail: number; unknown: number };
  breakdown: Record<MatchDimension, MatchBreakdownItem>;
  bidEstimate?: BidEstimate;
};
type BidScenario = { id: "aggressive" | "balanced" | "conservative"; label: string; bid: number; discountPercent: number; description: string };
type BidEstimate = {
  applicable: boolean;
  reason?: string;
  anchor?: { value: number; kind: "median_price" | "budget" };
  weights?: { price: number; technical: number };
  weightRows?: Array<{ criterion: string; weight: number; stated: number; isPrice: boolean; earned: number | null }>;
  rescaledSubCriteria?: boolean;
  technicalPoints?: number;
  scenarios?: BidScenario[];
  confidence?: "low" | "medium";
  assumptions?: string[];
  warnings?: string[];
};
type BidAnalysis = {
  verdict: string;
  risks: Array<{ topic: string; detail: string; impact: "high" | "medium" | "low" }>;
  opportunities: string[];
  priceAdjustmentPercent: number;
  priceAdjustmentReason: string;
  confidence: "low" | "medium" | "high";
};
type BookmarkStatus = { bookmarked: boolean; bookmarkId: string | null };
type DocumentResponse = { available: boolean; fileName?: string; downloadUrl?: string; message?: string };

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
const eligibilityCopy = {
  eligible: { label: "ผ่านเงื่อนไขบังคับ", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  ineligible: { label: "มีเงื่อนไขบังคับที่ไม่ผ่าน", className: "border-red-200 bg-red-50 text-red-800" },
  incomplete: { label: "ต้องตรวจเงื่อนไขเพิ่มเติม", className: "border-amber-200 bg-amber-50 text-amber-800" },
  unknown: { label: "ยังตรวจคุณสมบัติบังคับไม่ได้", className: "border-slate-200 bg-slate-50 text-slate-700" },
} as const;
function Title({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4 text-xl font-bold text-slate-800"><span className="text-[#0759be]">{icon}</span>{children}</div>; }
function Row({ label, value }: { label: string; value?: string }) { return value ? <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0"><span className="text-slate-500">{label}</span><strong className="text-right">{value}</strong></div> : null; }

export default function TORDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tor, setTor] = useState<Detail | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BidAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const { showToast } = useToast();
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${apiUrl}/tor/${id}`, { headers }).then((r) => r.json()),
      fetch(`${apiUrl}/tor/${id}/match`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${apiUrl}/bookmarks/tor/${id}`, { headers }).then((r) => r.ok ? r.json() : null),
    ]).then(([detail, matchResponse, bookmarkResponse]) => {
      setTor(detail.data ?? null);
      setMatch(matchResponse?.data ?? null);
      const bookmark = bookmarkResponse?.data as BookmarkStatus | undefined;
      setBookmarkId(bookmark?.bookmarked ? bookmark.bookmarkId : null);
    }).catch(() => setTor(null));
  }, [id]);


  /**
   * Ask the backend for an AI reading of the bid estimate.
   *
   * Explicitly user-triggered: it spends Vertex quota, so it must never run as
   * part of loading the page. The deterministic estimate stays on screen
   * throughout, including when this fails.
   */
  const runAnalysis = async () => {
    const token = getToken();
    if (!token) {
      showToast("กรุณาเข้าสู่ระบบก่อนใช้งาน", "warning");
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    try {
      const response = await fetch(`${apiUrl}/tor/${id}/bid-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? result.error ?? "วิเคราะห์ไม่สำเร็จ");
      setAnalysis(result.data?.analysis ?? null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const toggleBookmark = async () => {
    const token = getToken();
    if (!token) {
      showToast("กรุณาเข้าสู่ระบบก่อนบันทึกโครงการ", "warning");
      return;
    }

    setBookmarkLoading(true);
    setActionError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    try {
      if (bookmarkId) {
        const response = await fetch(`${apiUrl}/bookmarks/${bookmarkId}`, { method: "DELETE", headers });
        if (!response.ok) throw new Error("ไม่สามารถยกเลิกการบันทึกได้");
        setBookmarkId(null);
        showToast("นำโครงการออกจากรายการที่บันทึกไว้แล้ว", "info");
      } else {
        const response = await fetch(`${apiUrl}/bookmarks`, {
          method: "POST",
          headers,
          body: JSON.stringify({ torRecordId: id }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "ไม่สามารถบันทึก TOR ได้");
        setBookmarkId(result.data?._id ?? null);
        showToast("บันทึกโครงการในรายการที่บันทึกไว้เรียบร้อยแล้ว", "success");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก";
      setActionError(msg);
      showToast(msg, "error");
    } finally {
      setBookmarkLoading(false);
    }
  };

  const downloadDocument = async () => {
    setDocumentLoading(true);
    setActionError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    try {
      const response = await fetch(`${apiUrl}/tor/${id}/document`, {
        method: "GET",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "ไม่สามารถดาวน์โหลดเอกสารได้");
      const document = result.data as DocumentResponse;
      if (!document.available || !document.downloadUrl) {
        throw new Error(document.message ?? "ยังไม่มีเอกสารให้ดาวน์โหลด");
      }
      const link = window.document.createElement("a");
      link.href = document.downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (document.fileName) link.download = document.fileName;
      link.click();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดาวน์โหลด");
    } finally {
      setDocumentLoading(false);
    }
  };

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
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><p className="text-sm text-slate-500"><Link href="/procurement" className="no-underline text-slate-500 hover:text-[#0759be]">จัดซื้อจัดจ้าง</Link><span className="mx-3">›</span>รายละเอียดโครงการ</p><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={toggleBookmark} disabled={bookmarkLoading} className={bookmarkId ? "detail-action detail-action-primary disabled:cursor-wait disabled:opacity-60" : "detail-action detail-action-outline cursor-pointer disabled:cursor-wait disabled:opacity-60"}>{bookmarkId ? <BookmarkOutlinedIcon fontSize="small" /> : <BookmarkBorderOutlinedIcon fontSize="small" />}{bookmarkLoading ? "กำลังบันทึก..." : bookmarkId ? "บันทึกแล้ว" : "บันทึกไว้"}</button><button type="button" onClick={downloadDocument} disabled={documentLoading} className="detail-action detail-action-outline cursor-pointer disabled:cursor-wait disabled:opacity-60"><DownloadOutlinedIcon fontSize="small" />{documentLoading ? "กำลังเตรียมเอกสาร..." : "ดาวน์โหลดเอกสาร"}</button>{tor.officialPortalUrl && <a href={tor.officialPortalUrl} target="_blank" rel="noreferrer" className="detail-action detail-action-outline"><OpenInNewIcon fontSize="small" />ไปที่ประกาศต้นทาง</a>}</div></div>
    {actionError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}
    <div className="mb-7"><div className="mb-4 flex gap-2"><span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${bidClosed ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-[#1762be]"}`}>● {displayStatus}</span></div><h1 className="text-3xl font-bold md:text-4xl">{tor.title}</h1><p className="mt-4 flex items-center gap-2 text-lg text-slate-500"><ApartmentOutlinedIcon />{tor.agencyName}</p></div>
    <DeadlineNotice label={deadlineKind} deadline={deadline} remainingDays={remainingDays} />
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label={scheduleLabel} value={period} /><Stat label="งบประมาณที่จัดสรร" value={money(tor.budget ?? parsed?.medianPrice?.value)} /><Stat label="ราคากลาง" value={money(tor.medianPrice ?? parsed?.medianPrice?.value)} /><Stat label="ความเหมาะสมกับทีม" value={match?.matchScore != null ? `${Math.round(match.matchScore * 100)}%` : "กรอกโปรไฟล์เพื่อดูผล"} note={match?.matchScore != null ? `ข้อมูลที่ใช้ประเมิน ${Math.round(match.dataCoverage * 100)}%` : undefined} /></div>
    {match && <MatchSummary match={match} />}
    {!completed ? <section className="detail-panel"><Title icon={<WarningAmberOutlinedIcon />}>สถานะการวิเคราะห์เอกสาร</Title><p className="text-slate-600">รายการนี้ยังไม่มีผล extraction ที่สมบูรณ์ จะแสดงรายละเอียดเชิงลึกเมื่อสถานะเป็น completed</p></section> : <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]"><main className="space-y-7">
      {overview && <section className="detail-panel"><Title icon={<LightbulbOutlinedIcon />}>สรุปโครงการและขอบเขตงาน</Title><p className="whitespace-pre-wrap leading-8 text-slate-600">{overview}</p>{tor.summary?.keyPoints?.length ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">{tor.summary.keyPoints.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>}
      {(tor.summary?.deliverables?.length || parsed?.techRequirements?.length) && <section className="detail-panel"><Title icon={<ComputerOutlinedIcon />}>สิ่งส่งมอบและข้อกำหนดทางเทคนิค</Title>{tor.summary?.deliverables?.length ? <Pills items={tor.summary.deliverables} /> : null}{parsed?.techRequirements?.length ? <Pills items={parsed.techRequirements.map((item) => `${item.name}${item.isMandatory ? " • จำเป็น" : ""}`)} /> : null}</section>}
      <section className="detail-panel"><Title icon={<FactCheckOutlinedIcon />}>คุณสมบัติผู้ยื่นข้อเสนอ</Title><Qualifications items={specific} empty="ไม่พบเงื่อนไขเฉพาะโครงการ" />{standard.length ? <details className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer font-semibold">เงื่อนไขทั่วไปตามระเบียบ ({standard.length} ข้อ)</summary><Qualifications items={standard} /></details> : null}</section>
      {(parsed?.keyDates?.submissionDate?.date || parsed?.keyDates?.documentFeePeriod || parsed?.keyDates?.contractDurationDays?.value != null || parsed?.keyDates?.warrantyMonths?.value != null) && <section className="detail-panel"><Title icon={<CalendarMonthOutlinedIcon />}>กำหนดการและระยะเวลาโครงการ</Title><div className="grid gap-3 sm:grid-cols-2"><Row label="วันยื่นข้อเสนอ" value={parsed?.keyDates?.submissionDate?.date ? `${date(parsed.keyDates.submissionDate.date)} ${parsed.keyDates.submissionDate.startTime ?? ""}–${parsed.keyDates.submissionDate.endTime ?? ""}` : undefined} /><Row label="ช่วงซื้อเอกสาร" value={parsed?.keyDates?.documentFeePeriod ? `${date(parsed.keyDates.documentFeePeriod.from)} – ${date(parsed.keyDates.documentFeePeriod.to)}` : undefined} /><Row label="ระยะเวลาดำเนินงาน" value={parsed?.keyDates?.contractDurationDays?.value != null ? `${parsed.keyDates.contractDurationDays.value} วัน` : undefined} /><Row label="ระยะเวลารับประกัน" value={parsed?.keyDates?.warrantyMonths?.value != null ? `${parsed.keyDates.warrantyMonths.value} เดือน` : undefined} /></div></section>}
      <section className="detail-panel"><Title icon={<BarChartOutlinedIcon />}>เกณฑ์การประเมิน</Title><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{parsed?.evaluationCriteria?.content ?? "ยังไม่มีรายละเอียดเกณฑ์การประเมิน"}</p><EvaluationWeights rows={match?.bidEstimate?.weightRows} rescaled={match?.bidEstimate?.rescaledSubCriteria} fallback={parsed?.evaluationCriteria?.weights} /></section>
      {match?.bidEstimate && <BidEstimatePanel estimate={match.bidEstimate} analysis={analysis} loading={analysisLoading} error={analysisError} onAnalyse={runAnalysis} />}
      {parsed?.paymentTerms?.length ? <section className="detail-panel"><Title icon={<ReceiptLongOutlinedIcon />}>เงื่อนไขการส่งมอบและชำระเงิน</Title>{parsed.paymentTerms.map((item) => <div key={item.installment} className="mb-3 rounded-xl bg-slate-50 p-4"><strong>งวดที่ {item.installment}{item.percent != null ? ` • ${item.percent}%` : ""}</strong><p className="mt-1 text-sm text-slate-600">{item.condition}</p></div>)}</section> : null}
    </main><aside className="space-y-6"><section className="detail-panel"><Title icon={<ReceiptLongOutlinedIcon />}>ข้อมูลการจัดซื้อจัดจ้าง</Title><Row label="ประเภทงาน" value={workType[parsed?.workType ?? ""]} /><Row label="ประเภทโครงการ" value={tor.metadata?.projectType} /><Row label="วิธีจัดซื้อ" value={tor.metadata?.purchaseMethod} /><Row label="ประเภทประกาศ" value={tor.metadata?.announceType} /><Row label="เลขที่โครงการ" value={tor.metadata?.projectId} /><Row label="สถานะ" value={tor.metadata?.contractStatus} /></section><section className="rounded-2xl border-l-4 border-red-600 bg-red-50 p-6"><Title icon={<FlagOutlinedIcon />}>การวิเคราะห์ความเสี่ยง</Title>{tor.redFlags?.length ? tor.redFlags.map((item) => <div key={item.reason} className="mb-3 rounded-xl bg-white p-4 text-sm"><strong>{item.reason}</strong><p className="mt-2">{item.clauseText}</p>{item.recommendedAction && <p className="mt-2 text-red-700">คำแนะนำ: {item.recommendedAction}</p>}</div>) : <p className="text-sm text-emerald-700">ไม่พบความเสี่ยงที่ต้องแจ้งเตือน</p>}</section></aside></div>}
  </div>;
}
function DeadlineNotice({ label, deadline, remainingDays }: { label: string; deadline?: string | null; remainingDays: number | null }) {
  if (remainingDays == null || remainingDays < 0) return null;

  const state = remainingDays === 0
    ? { message: "ครบกำหนดวันนี้", className: "border-red-300 bg-red-50 text-red-700" }
    : remainingDays <= 3
      ? { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-red-300 bg-red-50 text-red-700" }
      : remainingDays <= 7
        ? { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-amber-300 bg-amber-50 text-amber-800" }
        : { message: `เหลือ ${remainingDays.toLocaleString("th-TH")} วัน`, className: "border-blue-200 bg-blue-50 text-blue-800" };

  return <div role="status" className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 ${state.className}`}><NotificationsActiveOutlinedIcon fontSize="small" /><strong>{state.message}</strong><span className="text-sm opacity-80">{deadline ? `${label}: ${date(deadline)}` : label}</span></div>;
}
/**
 * Suggested bid range for price-performance TORs.
 *
 * Deliberately verbose about its own limits: it shows a price, and a price
 * shown without its assumptions reads as advice. The scenarios, the assumption
 * list and the warnings are one unit — never render the numbers alone.
 */
/**
 * Two blocks inside the evaluation panel.
 *
 * First, what the TOR says: every criterion as a percentage of the full 100,
 * sub-criteria nested under the quality total they belong to. This is the
 * document's own structure and is shown whether or not a profile exists.
 *
 * Second, and only with a profile, what the team is estimated to score on the
 * quality half. Price is excluded there on purpose: those points follow the
 * bid, not the profile, so mixing them in would invent a number.
 *
 * Quality sub-criteria are frequently written as percentages of the quality
 * block rather than of the whole score — one BMA TOR lists eight rows of
 * "10%" and "15%" under a quality weight of 60. Taken literally those total
 * 140, so the backend rescales them and the printed figure is shown beside
 * the real one.
 */
function EvaluationWeights({ rows, rescaled, fallback }: {
  rows?: Array<{ criterion: string; weight: number; stated: number; isPrice: boolean; earned: number | null }>;
  rescaled?: boolean;
  fallback?: Array<{ criterion: string; weight: number }>;
}) {
  const resolved = rows?.length
    ? rows
    : fallback?.map((item) => ({ ...item, stated: item.weight, isPrice: false, earned: null }));
  if (!resolved?.length) return null;
  const round = (value: number) => Math.round(value * 10) / 10;
  const price = resolved.filter((item) => item.isPrice);
  const quality = resolved.filter((item) => !item.isPrice);
  const qualityMax = round(quality.reduce((sum, item) => sum + item.weight, 0));
  const scored = quality.filter((item) => item.earned != null);
  const qualityEarned = scored.length === quality.length && quality.length > 0
    ? round(quality.reduce((sum, item) => sum + (item.earned ?? 0), 0))
    : null;

  const weightBar = (item: { criterion: string; weight: number; stated: number }, nested: boolean) =>
    <div key={item.criterion} className={nested ? "mt-3 pl-4" : "mt-3"}>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className={nested ? "text-slate-600" : ""}>{item.criterion}{rescaled && item.stated !== item.weight ? <span className="ml-1 text-xs text-slate-400">(TOR เขียน {item.stated}%)</span> : null}</span><strong className="whitespace-nowrap">{item.weight}%</strong></div>
      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${nested ? "bg-[#6ba3e0]" : "bg-[#0759be]"}`} style={{ width: `${item.weight}%` }} /></div>
    </div>;

  return <>
    <div className="mt-5">
      {price.map((item) => weightBar(item, false))}
      {quality.length > 0 && <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-semibold">คะแนนด้านคุณภาพ</span><strong className="whitespace-nowrap">{qualityMax}%</strong></div>
        <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0759be]" style={{ width: `${qualityMax}%` }} /></div>
        {quality.length > 1 && quality.map((item) => weightBar(item, true))}
      </div>}
      {rescaled && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">TOR เขียนน้ำหนักหัวข้อย่อยเป็น % ของคะแนนคุณภาพ ระบบแปลงเป็นสัดส่วนจากคะแนนเต็ม 100 เพื่อให้เทียบกับคะแนนราคาได้โดยตรง</p>}
    </div>
    {qualityEarned != null && <div className="mt-7 rounded-xl border border-slate-200 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <strong className="text-sm">คะแนนด้านคุณภาพที่ทีมคาดว่าจะได้</strong>
        <span className="text-lg font-bold text-[#0759be]">{qualityEarned}<span className="text-sm font-normal text-slate-500"> / {qualityMax} คะแนน</span></span>
      </div>
      <div className="space-y-3">
        {quality.map((item) => {
          const filled = item.earned != null ? Math.max(0, Math.min(1, item.earned / item.weight)) * 100 : 0;
          return <div key={item.criterion}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-600">{item.criterion}</span><strong className="whitespace-nowrap">{item.earned}<span className="font-normal text-slate-500"> / {item.weight}</span></strong></div>
            <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#6ba3e0]" style={{ width: `${filled}%` }} /></div>
          </div>;
        })}
      </div>
      <p className="mt-4 text-xs leading-6 text-slate-500">ประมาณจากโปรไฟล์ของทีมเทียบกับคุณสมบัติที่ TOR กำหนด ไม่ใช่คะแนนจริงจากคณะกรรมการ ซึ่งพิจารณาจากเอกสารข้อเสนอที่ยื่นจริง — ไม่รวมคะแนนด้านราคา เพราะขึ้นกับราคาที่เสนอ</p>
    </div>}
  </>;
}

type BidEstimatePanelProps = {
  estimate: BidEstimate;
  analysis: BidAnalysis | null;
  loading: boolean;
  error: string | null;
  onAnalyse: () => void;
};

function BidEstimatePanel({ estimate, analysis, loading, error, onAnalyse }: BidEstimatePanelProps) {
  if (!estimate.applicable) {
    return <section className="detail-panel"><Title icon={<CalculateOutlinedIcon />}>ประมาณการราคาที่ควรเสนอ</Title><p className="text-sm leading-7 text-slate-600">{estimate.reason}</p></section>;
  }
  const scenarios = estimate.scenarios ?? [];
  const low = scenarios.length ? scenarios[0].bid : null;
  const high = scenarios.length ? scenarios[scenarios.length - 1].bid : null;
  return <section className="detail-panel">
    <Title icon={<CalculateOutlinedIcon />}>ประมาณการราคาที่ควรเสนอ</Title>
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${estimate.confidence === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>ความเชื่อมั่น{estimate.confidence === "medium" ? "ปานกลาง" : "ต่ำ"}</span>
      {estimate.weights && <span className="text-xs text-slate-500">น้ำหนักราคา {estimate.weights.price} / เทคนิค {estimate.weights.technical}</span>}
      {estimate.technicalPoints != null && estimate.weights && <span className="text-xs text-slate-500">คะแนนเทคนิคที่ประมาณได้ {estimate.technicalPoints.toFixed(1)} / {estimate.weights.technical}</span>}
    </div>
    {low != null && high != null && <div className="mb-6 rounded-xl bg-slate-50 p-5"><p className="text-sm text-slate-500">ช่วงราคาโดยประมาณ</p><strong className="text-2xl text-slate-800">{money(low)}{low !== high ? ` – ${money(high)}` : ""}</strong></div>}
    <div className="space-y-3">
      {scenarios.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm">{item.label}</strong><span className="text-lg font-bold text-[#0759be]">{money(item.bid)}<span className="ml-2 text-sm font-normal text-slate-500">{item.discountPercent > 0 ? `ต่ำกว่าฐาน ${item.discountPercent}%` : "เท่าราคาฐาน"}</span></span></div>
        <p className="mt-2 text-sm text-slate-600">{item.description}</p>
      </div>)}
    </div>
    {estimate.assumptions?.length ? <details className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold">สมมติฐานที่ใช้คำนวณ</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">{estimate.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
    {estimate.warnings?.length ? <ul className="mt-4 list-disc space-y-2 rounded-xl border-l-4 border-amber-500 bg-amber-50 py-4 pl-9 pr-4 text-sm text-amber-900">{estimate.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    <div className="mt-6 border-t border-slate-100 pt-5">
      {!analysis && <p className="mb-3 text-sm text-slate-500">ตัวเลขด้านบนคำนวณจากสูตรโดยตรง ถ้าต้องการให้ AI อ่านขอบเขตงาน เงื่อนไขการจ่ายเงิน และความเสี่ยงประกอบด้วย กดปุ่มด้านล่าง</p>}
      <button type="button" onClick={onAnalyse} disabled={loading} className="detail-action detail-action-outline cursor-pointer disabled:cursor-wait disabled:opacity-60"><AutoAwesomeOutlinedIcon fontSize="small" />{loading ? "กำลังวิเคราะห์..." : analysis ? "วิเคราะห์ใหม่อีกครั้ง" : "ให้ AI วิเคราะห์เชิงลึก"}</button>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {analysis && <AiAnalysis analysis={analysis} estimate={estimate} />}
    </div>
  </section>;
}

const impactStyle: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-200 text-slate-700",
};
const impactLabel: Record<string, string> = { high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
const aiConfidenceLabel: Record<string, string> = { high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };

/**
 * The model's reading of the estimate.
 *
 * Shown under the deterministic numbers, never instead of them: the suggested
 * adjustment is expressed against the calculated mid-point so the reader can
 * always see what was computed and what was opinion.
 */
function AiAnalysis({ analysis, estimate }: { analysis: BidAnalysis; estimate: BidEstimate }) {
  const scenarios = estimate.scenarios ?? [];
  const mid = scenarios.length ? scenarios[Math.floor(scenarios.length / 2)].bid : null;
  const adjusted = mid != null ? Math.floor((mid * (1 + analysis.priceAdjustmentPercent / 100)) / 1000) * 1000 : null;
  return <div className="mt-5 space-y-5 rounded-xl bg-slate-50 p-5">
    <div className="flex flex-wrap items-center gap-3"><strong className="text-sm">ผลวิเคราะห์จาก AI</strong><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">ความเชื่อมั่น{aiConfidenceLabel[analysis.confidence] ?? analysis.confidence}</span></div>
    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{analysis.verdict}</p>
    {mid != null && <div className="rounded-xl bg-white p-4"><p className="text-sm text-slate-500">AI แนะนำให้ปรับจากค่ากลางที่คำนวณได้ ({money(mid)})</p><p className="mt-1 text-lg font-bold text-slate-800">{analysis.priceAdjustmentPercent === 0 ? "ไม่ต้องปรับ" : `${analysis.priceAdjustmentPercent > 0 ? "+" : ""}${analysis.priceAdjustmentPercent}%`}{adjusted != null && analysis.priceAdjustmentPercent !== 0 ? ` → ${money(adjusted)}` : ""}</p><p className="mt-2 text-sm text-slate-600">{analysis.priceAdjustmentReason}</p></div>}
    {analysis.risks?.length ? <div><p className="mb-2 text-sm font-semibold">ความเสี่ยงที่ควรพิจารณา</p><div className="space-y-2">{analysis.risks.map((item) => <div key={item.topic + item.detail} className="rounded-xl bg-white p-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.topic}</strong><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${impactStyle[item.impact] ?? impactStyle.low}`}>ผลกระทบ{impactLabel[item.impact] ?? item.impact}</span></div><p className="mt-2 text-sm text-slate-600">{item.detail}</p></div>)}</div></div> : null}
    {analysis.opportunities?.length ? <div><p className="mb-2 text-sm font-semibold">สิ่งที่ทำได้เพื่อเพิ่มโอกาส</p><ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">{analysis.opportunities.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
    <p className="text-xs text-slate-500">ผลวิเคราะห์นี้สร้างจากโมเดลภาษา อาจคลาดเคลื่อนได้ ใช้ประกอบการตัดสินใจเท่านั้น ไม่ใช่คำแนะนำให้เสนอราคา</p>
  </div>;
}
function Stat({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="detail-stat"><p>{label}</p><strong>{value}</strong>{note && <span>{note}</span>}</div>; }
function MatchSummary({ match }: { match: MatchResult }) {
  const status = eligibilityCopy[match.eligibilityStatus ?? match.overallStatus];
  const dimensions = Object.values(match.breakdown ?? {}).filter((item) => item.applicable);
  return <section className="detail-panel mb-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <Title icon={<FactCheckOutlinedIcon />}>เหตุผลของคะแนนความเหมาะสม</Title>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
    </div>
    <p className="mb-5 text-sm text-slate-600">
      ผ่าน {match.counts.pass} ข้อ · ไม่ผ่าน {match.counts.fail} ข้อ · ต้องตรวจเพิ่ม {match.counts.unknown} ข้อ
      <span className="ml-2">ข้อมูลครอบคลุม {Math.round(match.dataCoverage * 100)}%</span>
    </p>
    <div className="grid gap-4 md:grid-cols-2">
      {dimensions.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3 text-sm"><strong>{item.label}</strong><span>{item.score == null ? "ข้อมูลไม่พอ" : `${Math.round(item.score * 100)}%`}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0759be]" style={{ width: `${Math.round((item.score ?? 0) * 100)}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">น้ำหนัก {item.weight}% · ตรวจได้ {Math.round(item.coverage * 100)}%</p>
        {item.reasons[0] && <p className="mt-1 text-xs text-slate-600">{item.reasons[0]}</p>}
      </div>)}
    </div>
    <p className="mt-4 text-xs text-slate-500">คะแนนใช้ช่วยคัดกรองโอกาส ไม่แทนการตรวจเอกสาร TOR ฉบับจริง โดยข้อมูลที่ยังตรวจไม่ได้จะถูกคิดเป็นค่ากลางและแสดงในความครอบคลุม</p>
  </section>;
}
function Pills({ items }: { items: string[] }) { return <div className="mb-4 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm text-[#0759be]">{item}</span>)}</div>; }
function Qualifications({ items, empty }: { items: Qualification[]; empty?: string }) { return items.length ? <div className="divide-y divide-slate-100">{items.map((item, i) => <div key={`${item.clauseNumber}-${i}`} className="py-4"><p className="font-medium leading-6">{item.clauseNumber && <span className="mr-2 text-[#0759be]">ข้อ {item.clauseNumber}</span>}{item.criterion}</p>{item.minimumValue != null && <p className="mt-1 text-sm text-slate-500">ขั้นต่ำ: {typeof item.minimumValue === "number" && item.unit === "THB" ? money(item.minimumValue) : `${item.minimumValue} ${item.unit ?? ""}`}</p>}{item.requiredCerts?.length ? <p className="mt-1 text-sm text-slate-500">ใบรับรอง: {item.requiredCerts.join(", ")}</p> : null}</div>)}</div> : <p className="text-slate-500">{empty}</p>; }
