"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import ConfidenceBadge from "@/components/tor/ConfidenceBadge";
import PillBadge from "@/components/shared/PillBadge";

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
};

interface TORDetail {
  _id: string;
  title: string;
  agencyName: string;
  phase: string;
  medianPrice?: number;
  budget?: number;
  postingDate: string;
  submissionDeadline?: string;
  publicHearingStart?: string;
  publicHearingEnd?: string;
  sourceUrl: string;
  officialPortalUrl?: string;
  pdfUrl?: string;
  parsedData: {
    scopeOfWork: { content?: string; confidence: number };
    qualifications: Array<{
      criterion: string;
      minimumValue?: number | string;
      type: string;
      confidence: number;
    }>;
    medianPrice: { value: number | null; confidence: number };
    evaluationCriteria: { content?: string; confidence: number };
  };
  redFlags: Array<{
    clauseText: string;
    reason: string;
    severity: string;
    recommendedAction: string;
    ruleId: string;
  }>;
  extractionStatus: string;
  tags: string[];
  sources?: Array<{
    portalName: string;
    sourceUrl: string;
    scrapedAt: string;
  }>;
}

export default function TORDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tor, setTor] = useState<TORDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/tor/${id}`);
        const json = await res.json();
        if (json.data) setTor(json.data);
      } catch (err) {
        console.error("Failed to fetch TOR detail:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[var(--color-text-secondary)]">กำลังโหลด...</p>
      </div>
    );
  }

  if (!tor) {
    return (
      <div className="flex items-center justify-center py-20">
        <p>ไม่พบ TOR</p>
      </div>
    );
  }

  const pd = tor.parsedData;

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      {/* Back link */}
      <Link
        href="/procurement"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] no-underline"
      >
        <ArrowBackIcon sx={{ fontSize: 16 }} />
        กลับ
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3 mb-2">
          <PillBadge label={phaseLabels[tor.phase] ?? tor.phase} value={tor.phase} />
          {tor.extractionStatus === "failed" && (
            <PillBadge label="AI ไม่สามารถวิเคราะห์ได้" value="critical" />
          )}
        </div>
        <h1 className="text-2xl font-bold">{tor.title}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {tor.agencyName}
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "ราคากลาง",
            value: tor.medianPrice ? `฿${tor.medianPrice.toLocaleString()}` : "—",
          },
          {
            label: "งบประมาณ",
            value: tor.budget ? `฿${tor.budget.toLocaleString()}` : "—",
          },
          {
            label: "วันที่ประกาศ",
            value: new Date(tor.postingDate).toLocaleDateString("th-TH"),
          },
          {
            label: "กำหนดส่ง",
            value: tor.submissionDeadline
              ? new Date(tor.submissionDeadline).toLocaleDateString("th-TH")
              : "—",
          },
        ].map((item, i) => (
          <Card key={i} sx={{ borderRadius: "var(--radius-card)" }}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {item.label}
              </p>
              <p className="text-sm font-semibold mt-1">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* External links */}
      <div className="flex flex-wrap gap-3">
        {tor.officialPortalUrl && (
          <Button
            variant="contained"
            href={tor.officialPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon />}
            size="small"
          >
            ดูประกาศต้นฉบับ
          </Button>
        )}
        {tor.pdfUrl && (
          <Button
            variant="outlined"
            href={tor.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon />}
            size="small"
          >
            ดาวน์โหลด TOR (PDF)
          </Button>
        )}
      </div>

      <Divider />

      {/* Parsed Data — Scope of Work */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">ขอบเขตงาน</h2>
            <ConfidenceBadge confidence={pd.scopeOfWork.confidence} />
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {pd.scopeOfWork.content ?? "ไม่มีข้อมูล"}
          </p>
        </CardContent>
      </Card>

      {/* Qualifications */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-lg font-semibold mb-3">คุณสมบัติ</h2>
          <div className="space-y-3">
            {pd.qualifications.map((q, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm">{q.criterion}</p>
                  {q.minimumValue && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      ค่าขั้นต่ำ: {String(q.minimumValue)}
                    </p>
                  )}
                </div>
                <ConfidenceBadge confidence={q.confidence} />
              </div>
            ))}
            {pd.qualifications.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                ไม่มีข้อมูลคุณสมบัติ
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Evaluation Criteria */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">เกณฑ์การประเมิน</h2>
            <ConfidenceBadge confidence={pd.evaluationCriteria.confidence} />
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {pd.evaluationCriteria.content ?? "ไม่มีข้อมูล"}
          </p>
        </CardContent>
      </Card>

      {/* Red Flags */}
      {tor.phase === "public_hearing" && tor.redFlags.length > 0 && (
        <Card
          sx={{
            borderRadius: "var(--radius-card)",
            borderLeft: "4px solid var(--color-warning)",
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <h2 className="text-lg font-semibold mb-3">
              ข้อสังเกตเบื้องต้น ({tor.redFlags.length})
            </h2>
            <div className="space-y-4">
              {tor.redFlags.map((flag, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <PillBadge label={flag.severity} value={flag.severity} />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {flag.ruleId}
                    </span>
                  </div>
                  <p className="text-sm">&ldquo;{flag.clauseText}&rdquo;</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {flag.reason}
                  </p>
                  <p className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                    💡 {flag.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source attribution */}
      {tor.sources && tor.sources.length > 0 && (
        <Card sx={{ borderRadius: "var(--radius-card)" }}>
          <CardContent sx={{ p: 3 }}>
            <h2 className="text-lg font-semibold mb-3">แหล่งข้อมูล</h2>
            <div className="space-y-2">
              {tor.sources.map((src, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="uppercase text-xs font-medium">
                    {src.portalName}
                  </span>
                  <a
                    href={src.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] flex items-center gap-1 hover:underline text-xs"
                  >
                    ดูต้นฉบับ
                    <OpenInNewIcon sx={{ fontSize: 12 }} />
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {tor.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tor.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
