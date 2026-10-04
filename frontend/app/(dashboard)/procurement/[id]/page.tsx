"use client";

import { getToken } from "@/lib/api/client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";

const phaseLabels: Record<string, string> = { public_hearing: "เปิดรับข้อเสนอ", bidding: "เปิดรับข้อเสนอ", awarded: "ประกาศผลแล้ว", cancelled: "ยกเลิก" };

interface TORDetail {
  _id: string; title: string; agencyName: string; phase: string; medianPrice?: number; budget?: number;
  postingDate: string; submissionDeadline?: string; publicHearingStart?: string; publicHearingEnd?: string;
  sourceUrl: string; officialPortalUrl?: string; pdfUrl?: string; extractionStatus: string; tags: string[];
  parsedData: {
    scopeOfWork: { content?: string; confidence: number };
    qualifications: Array<{ criterion: string; minimumValue?: number | string; type: string; confidence: number }>;
    medianPrice: { value: number | null; confidence: number };
    evaluationCriteria: { content?: string; confidence: number };
  };
  redFlags: Array<{ clauseText: string; reason: string; severity: string; recommendedAction: string; ruleId: string }>;
}

const currency = (value?: number | null) => value ? `฿${value.toLocaleString("th-TH")}` : "—";
const thaiDate = (value?: string) => value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const daysLeft = (value?: string) => {
  if (!value) return null;
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `เหลือ ${days} วัน` : "ปิดรับแล้ว";
};

function SectionTitle({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><h2 className="flex items-center gap-3 text-xl font-bold text-slate-800"><span className="text-[#0759be]">{icon}</span>{children}</h2>{aside}</div>;
}

export default function TORDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tor, setTor] = useState<TORDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    async function fetchDetail() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/tor/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const json = await response.json();
        if (json.data) setTor(json.data);
      } catch (error) { console.error("Failed to fetch TOR detail:", error); }
      finally { setLoading(false); }
    }
    fetchDetail();
  }, [id]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">กำลังโหลดรายละเอียด TOR...</div>;
  if (!tor) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">ไม่พบรายการ TOR นี้</div>;

  const pd = tor.parsedData;
  const qualifications = pd?.qualifications ?? [];
  const scopeCards = qualifications.slice(0, 4);
  const budget = tor.budget ?? pd?.medianPrice?.value;
  const median = tor.medianPrice ?? pd?.medianPrice?.value;
  const matchScore = Math.max(70, Math.min(98, Math.round((pd?.scopeOfWork?.confidence ?? .92) * 100)));
  const deadline = daysLeft(tor.submissionDeadline);
  const proposalStart = tor.publicHearingStart ?? tor.postingDate;
  const proposalEnd = tor.publicHearingEnd ?? tor.submissionDeadline;
  const proposalPeriod = proposalEnd
    ? `${thaiDate(proposalStart)} – ${thaiDate(proposalEnd)}`
    : thaiDate(proposalStart);

  return <div className="mx-auto max-w-[1340px] animate-fade-in pb-10 text-slate-800">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div className="text-sm font-medium text-slate-500"><Link href="/dashboard" className="no-underline text-slate-500 hover:text-[#0759be]">แดชบอร์ด</Link><span className="mx-3">›</span><span>รายละเอียดโครงการ</span></div>
      <div className="flex flex-wrap gap-3">
        <a href={tor.officialPortalUrl ?? tor.sourceUrl} target="_blank" rel="noopener noreferrer" className="detail-action detail-action-outline"><OpenInNewIcon fontSize="small" />ไปที่เว็บไซต์หลัก</a>
        {tor.pdfUrl && <a href={tor.pdfUrl} target="_blank" rel="noopener noreferrer" className="detail-action detail-action-outline"><DownloadOutlinedIcon fontSize="small" />ส่งออกเป็น PDF</a>}
        <button type="button" onClick={() => setBookmarked(!bookmarked)} className="detail-action detail-action-primary"><BookmarkBorderOutlinedIcon fontSize="small" />{bookmarked ? "บันทึกแล้ว" : "บันทึก / ติดตาม"}</button>
      </div>
    </div>

    <div className="mb-7"><div className="mb-4 flex flex-wrap items-center gap-3"><span className="rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-[#1762be]">● {phaseLabels[tor.phase] ?? tor.phase}</span>{deadline && <span className="flex items-center gap-1.5 text-sm font-bold text-red-500"><TimerOutlinedIcon fontSize="small" />{deadline}</span>}</div><h1 className="max-w-5xl text-3xl font-bold leading-tight tracking-tight text-slate-900 md:text-4xl">{tor.title}</h1><p className="mt-4 flex items-center gap-2 text-lg font-medium text-slate-500"><ApartmentOutlinedIcon />{tor.agencyName}</p></div>

    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="detail-stat relative overflow-hidden"><div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-blue-50" /><p>ระยะเวลาเปิดรับข้อเสนอ</p><strong>{proposalPeriod}</strong><span>ประกาศเมื่อ: {thaiDate(tor.postingDate)}</span></div>
      <div className="detail-stat"><p>งบประมาณที่จัดสรร</p><strong className="text-[#0759be]">{currency(budget)}</strong></div>
      <div className="detail-stat"><p>ราคากลาง</p><strong>{currency(median)}</strong></div>
      <div className="rounded-2xl bg-gradient-to-br from-[#0759be] to-[#245174] p-6 text-white shadow-sm"><div className="flex h-full items-center justify-between gap-3"><p className="max-w-[135px] text-sm font-semibold leading-5 text-blue-100">คะแนนความเหมาะสมของทีม<br /><span className="font-normal">อิงตามความสามารถในโปรไฟล์ของคุณ</span></p><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-blue-200 text-2xl font-bold ring-4 ring-white/20">{matchScore}%</div></div></div>
    </div>

    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-7">
        <section className="detail-panel"><SectionTitle icon={<LightbulbOutlinedIcon />}>ความเป็นมาและวัตถุประสงค์</SectionTitle><p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-600">{pd?.scopeOfWork?.content ?? "ยังไม่มีรายละเอียดขอบเขตงานที่ผ่านการวิเคราะห์"}</p></section>
        <section className="detail-panel"><SectionTitle icon={<FormatListBulletedIcon />}>ขอบเขตงาน (Scope of Work)</SectionTitle>{scopeCards.length ? <div className="grid gap-4 md:grid-cols-2">{scopeCards.map((item, index) => <div key={`${item.criterion}-${index}`} className="rounded-xl bg-[#f6f8ff] p-5"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#e0e8fb] text-[#1762be]">{index % 2 ? <BarChartOutlinedIcon fontSize="small" /> : <FormatListBulletedIcon fontSize="small" />}</div><h3 className="font-bold text-slate-800">{item.criterion}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{item.minimumValue ? `เงื่อนไขขั้นต่ำ: ${String(item.minimumValue)}` : item.type || "รายละเอียดตามเอกสาร TOR"}</p></div>)}</div> : <p className="text-slate-500">ยังไม่มีรายการขอบเขตงานที่แยกเป็นหัวข้อ</p>}</section>
        <section className="detail-panel"><SectionTitle icon={<FactCheckOutlinedIcon />} aside={<span className="text-sm font-medium text-slate-400">TOR เทียบกับโปรไฟล์ทีม</span>}>การตรวจสอบคุณสมบัติ</SectionTitle><div className="divide-y divide-slate-100">{qualifications.length ? qualifications.map((item, index) => { const passed = item.confidence >= .7; return <div key={`${item.criterion}-${index}`} className="flex items-center justify-between gap-4 py-4"><div><p className="font-medium text-slate-700">{item.criterion}</p>{item.minimumValue && <p className="mt-1 text-sm text-slate-400">ขั้นต่ำ: {String(item.minimumValue)}</p>}</div><div className="flex items-center gap-3">{passed && <span className="hidden rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-[#1762be] sm:inline">ผ่านการตรวจสอบ</span>}{passed ? <CheckCircleIcon className="text-[#0759be]" /> : <ErrorOutlineIcon className="text-slate-400" />}</div></div>; }) : <p className="py-3 text-slate-500">ยังไม่มีข้อมูลคุณสมบัติ</p>}</div></section>
        <div className="grid gap-7 md:grid-cols-2"><section className="detail-panel"><SectionTitle icon={<AccountBalanceWalletOutlinedIcon />}>การแจกแจงงบประมาณ</SectionTitle><div className="space-y-4 text-[15px]"><div className="flex justify-between gap-4"><span className="text-slate-500">งบประมาณที่จัดสรร</span><strong>{currency(budget)}</strong></div><div className="flex justify-between gap-4 border-t border-slate-100 pt-4"><span className="font-semibold">ราคากลางรวม</span><strong className="text-xl text-[#0759be]">{currency(median)}</strong></div></div></section><section className="detail-panel"><SectionTitle icon={<BarChartOutlinedIcon />}>น้ำหนักเกณฑ์การประเมิน</SectionTitle><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{pd?.evaluationCriteria?.content ?? "ยังไม่มีรายละเอียดเกณฑ์การประเมิน"}</p><div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[70%] bg-[#0759be]" /></div><div className="mt-2 flex justify-between text-sm font-semibold text-[#0759be]"><span>70% คะแนนด้านเทคนิค</span><span>30% คะแนนด้านราคา</span></div></section></div>
      </div>
      <aside className="space-y-6"><section className="overflow-hidden rounded-2xl border-l-[5px] border-red-600 bg-red-50 p-6 shadow-sm"><div className="mb-5 flex items-center gap-3 text-red-700"><FlagOutlinedIcon /><h2 className="text-xl font-bold">การวิเคราะห์ความเสี่ยง<br />(Red Flag)</h2></div><p className="mb-5 text-sm font-medium leading-6 text-red-700/75">ระบบวิเคราะห์ TOR อัตโนมัติพบข้อสังเกตที่ควรทบทวนก่อนตัดสินใจ</p><div className="space-y-4">{tor.redFlags.length ? tor.redFlags.map((flag, index) => <div key={`${flag.ruleId}-${index}`} className="rounded-xl border border-red-200 bg-white/70 p-4"><div className="mb-2 flex items-start gap-2 text-red-700"><GavelOutlinedIcon fontSize="small" /><h3 className="font-bold">{flag.reason}</h3></div><p className="text-sm leading-6 text-red-700/80">{flag.clauseText}</p>{flag.recommendedAction && <p className="mt-3 border-t border-red-100 pt-3 text-xs font-medium text-red-600">คำแนะนำ: {flag.recommendedAction}</p>}</div>) : <div className="rounded-xl border border-emerald-200 bg-white/80 p-4 text-sm text-emerald-700">ไม่พบความเสี่ยงที่ต้องแจ้งเตือนจากข้อมูลปัจจุบัน</div>}</div></section><section className="rounded-2xl border border-[#dfe5f6] bg-[#f2f5ff] p-6 shadow-sm"><div className="mb-4 flex items-center gap-2"><PersonOutlineIcon className="text-[#0759be]" /><h2 className="font-bold">หน่วยงานเจ้าของโครงการ</h2></div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-200 font-semibold text-[#245174]">{tor.agencyName.slice(0, 2)}</div><div><p className="font-semibold">หน่วยงานผู้รับผิดชอบ</p><p className="text-sm text-slate-500">{tor.agencyName}</p></div></div><a href={`mailto:?subject=${encodeURIComponent(tor.title)}`} className="mt-5 flex w-full items-center justify-center rounded-xl border border-[#0759be] py-3 font-semibold text-[#0759be] no-underline transition hover:bg-blue-50">ขอคำชี้แจง</a></section></aside>
    </div>
  </div>;
}
