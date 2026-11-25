"use client";

import { api } from "@/lib/api/client";
import {
  CONFLICT_LABELS,
  EXTRACTION_STATUS_LABELS,
  formatBaht,
  formatThaiDateTime,
} from "@/lib/admin/review";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import RefreshIcon from "@mui/icons-material/Refresh";
import RssFeedIcon from "@mui/icons-material/RssFeed";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/* ─── Shapes from backend/src/services/pipeline-health.ts ───────────── */

type HealthLevel = "ok" | "warning" | "error";

interface PipelineHealth {
  status: HealthLevel;
  checkedAt: string;
  problems: Array<{ level: "warning" | "error"; stage: "rss" | "egp2" | "extraction"; message: string }>;
  rss: Array<{
    announceType: string;
    lastPolledAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastMaintenanceAt: string | null;
    lastMaintenanceNotice: string | null;
    gaps: number;
    failures: number;
  }>;
  rssCandidates: Record<string, number>;
  egp2LastJob: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    counts: Record<string, number> | null;
    error: string | null;
  } | null;
  extraction: {
    byStatus: Record<string, number>;
    waitingOpen: number;
    stuck: number;
    needsReview: number;
    needsCheck: number;
    lastExtractedAt: string | null;
  };
  vertex7d: {
    calls: number;
    failures: number;
    failuresByCode: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
  };
}

interface TorCheckItem {
  _id: string;
  title: string;
  agencyName: string;
  phase?: string;
  budget?: number | null;
  medianPrice?: number | null;
  officialPortalUrl?: string;
  metadata?: { projectId?: string };
  dataChecks: {
    conflicts: Array<{ code: string; severity: "info" | "check"; message: string }>;
    checkedAt?: string;
  };
}

const LEVEL_STYLE: Record<HealthLevel, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  ok: { label: "ทำงานปกติ", bg: "#E8F8ED", color: "#166534", icon: <CheckCircleOutlineIcon /> },
  warning: { label: "มีคำเตือน", bg: "#FFF8EB", color: "#92400E", icon: <WarningAmberOutlinedIcon /> },
  error: { label: "มีปัญหา", bg: "#FEF2F2", color: "#991B1B", icon: <ErrorOutlineIcon /> },
};

const STAGE_LABELS: Record<string, string> = {
  rss: "ดึงประกาศ (RSS)",
  egp2: "นำเข้าข้อมูล e-GP",
  extraction: "AI อ่าน TOR",
};

const JOB_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  running: { label: "กำลังประมวลผล", bg: "#DBEAFE", color: "#1D4ED8" },
  completed: { label: "สำเร็จ", bg: "#E8F8ED", color: "#166534" },
  failed: { label: "ล้มเหลว", bg: "#FEF2F2", color: "#991B1B" },
};

const RSS_FEED_LABELS: Record<string, string> = {
  B0: "B0 · ร่างเอกสาร (รับฟังความคิดเห็น)",
  D0: "D0 · ประกาศเชิญชวน",
  P0: "P0 · แผนจัดซื้อจัดจ้าง",
  W0: "W0 · ประกาศผู้ชนะ",
  "15": "15 · ราคากลาง",
};

const RSS_CANDIDATE_LABELS: Record<string, string> = {
  new: "รอนำเข้า",
  ingested: "นำเข้าแล้ว",
  skipped: "ข้าม",
  failed: "ล้มเหลว",
};

export default function AdminPipelinePage() {
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const [checks, setChecks] = useState<TorCheckItem[]>([]);
  const [checksTotal, setChecksTotal] = useState(0);
  const [checksPage, setChecksPage] = useState(0);
  const [checksError, setChecksError] = useState<string | null>(null);
  const [loadingChecks, setLoadingChecks] = useState(true);

  const [resolveTarget, setResolveTarget] = useState<TorCheckItem | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await api.get<PipelineHealth>("/admin/pipeline/health");
      setHealth(res.data);
    } catch (e) {
      setHealthError((e as Error).message);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadChecks = useCallback(async (page: number) => {
    setLoadingChecks(true);
    setChecksError(null);
    try {
      const res = await api.get<TorCheckItem[]>("/admin/tor-checks", { page: page + 1, limit: 10 });
      setChecks(res.data ?? []);
      setChecksTotal(res.meta?.total ?? 0);
    } catch (e) {
      setChecksError((e as Error).message);
    } finally {
      setLoadingChecks(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    loadChecks(checksPage);
  }, [loadChecks, checksPage]);

  async function resolve() {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      await api.patch(`/admin/tor-checks/${encodeURIComponent(resolveTarget._id)}`, {
        note: resolveNote.trim() || undefined,
      });
      setToast(`บันทึกว่าตรวจแล้ว: ${resolveTarget.title}`);
      setResolveTarget(null);
      setResolveNote("");
      await Promise.all([loadChecks(checksPage), loadHealth()]);
    } catch (e) {
      setToast(`บันทึกไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setResolving(false);
    }
  }

  const level = health ? LEVEL_STYLE[health.status] : null;
  const byStatus = health?.extraction.byStatus ?? {};
  const extractionTotal = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">สถานะระบบประมวลผลข้อมูล</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            ติดตามการดึงประกาศ การนำเข้าข้อมูล e-GP และการอ่าน TOR ด้วย AI พร้อมรายการข้อมูลที่ไม่สอดคล้อง
          </p>
        </div>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadHealth();
            loadChecks(checksPage);
          }}
          disabled={loadingHealth}
          sx={{ textTransform: "none", borderColor: "var(--color-border)", color: "var(--color-text-primary)", alignSelf: { xs: "flex-start", sm: "center" } }}
        >
          ตรวจสอบอีกครั้ง
        </Button>
      </div>

      {toast && (
        <Alert severity={toast.startsWith("บันทึกไม่สำเร็จ") ? "error" : "success"} onClose={() => setToast(null)}>
          {toast}
        </Alert>
      )}
      {healthError && <Alert severity="error">โหลดสถานะไม่สำเร็จ: {healthError}</Alert>}

      {/* Overall status + problems */}
      {health && level && (
        <Card sx={{ borderRadius: "var(--radius-card)", border: `1px solid ${level.color}33` }}>
          <CardContent sx={{ p: 3 }}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ backgroundColor: level.bg, color: level.color }}>
                  {level.icon}
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">สถานะรวม</p>
                  <p className="text-lg font-bold" style={{ color: level.color }}>
                    {level.label}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">ตรวจเมื่อ {formatThaiDateTime(health.checkedAt)}</p>
            </div>

            {health.problems.length > 0 && (
              <div className="mt-4 space-y-2">
                {health.problems.map((p, i) => (
                  <Alert key={i} severity={p.level} sx={{ alignItems: "center" }}>
                    <span className="font-semibold">{STAGE_LABELS[p.stage] ?? p.stage}:</span> {p.message}
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loadingHealth && !health && <p className="text-sm text-[var(--color-text-secondary)]">กำลังโหลดสถานะ...</p>}

      {health && (
        <>
          {/* Extraction status counts */}
          <Card sx={{ borderRadius: "var(--radius-card)" }}>
            <CardContent sx={{ p: 3 }}>
              <div className="flex items-center gap-2 mb-4">
                <SmartToyOutlinedIcon sx={{ color: "var(--color-primary)" }} />
                <h2 className="text-base font-semibold">การอ่าน TOR ด้วย AI (Extraction)</h2>
                <span className="text-xs text-[var(--color-text-secondary)] ml-auto">
                  อ่านล่าสุด {formatThaiDateTime(health.extraction.lastExtractedAt)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {["completed", "processing", "pending", "failed", "skipped"].map((s) => {
                  const meta = EXTRACTION_STATUS_LABELS[s];
                  const n = byStatus[s] ?? 0;
                  return (
                    <div key={s} className="rounded-lg border border-[var(--color-border)] px-4 py-3">
                      <p className="text-xs text-[var(--color-text-secondary)]">{meta.label}</p>
                      <p className="text-2xl font-bold" style={{ color: meta.color }}>
                        {n}
                      </p>
                      {extractionTotal > 0 && (
                        <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(n / extractionTotal) * 100}%`, backgroundColor: meta.color }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                <MiniStat label="ค้างประมวลผล (stuck)" value={health.extraction.stuck} warn={health.extraction.stuck > 0} />
                <MiniStat label="โครงการเปิดรับที่รอ AI อ่าน" value={health.extraction.waitingOpen} warn={health.extraction.waitingOpen > 0} />
                <MiniStat label="รอ admin ตรวจทาน" value={health.extraction.needsReview} warn={health.extraction.needsReview > 0} href="/admin/tor-review" />
                <MiniStat label="ข้อมูลไม่สอดคล้องรอตรวจ" value={health.extraction.needsCheck} warn={health.extraction.needsCheck > 0} href="#tor-checks" />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* RSS feeds */}
            <Card sx={{ borderRadius: "var(--radius-card)" }}>
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-center gap-2 mb-4">
                  <RssFeedIcon sx={{ color: "#EA580C" }} />
                  <h2 className="text-base font-semibold">ดึงประกาศจาก e-GP (RSS)</h2>
                </div>
                {health.rss.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">ยังไม่มีประวัติการดึง</p>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Feed</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>สำเร็จล่าสุด</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>สถานะ</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {health.rss.map((f) => {
                        const feedProblem = health.problems.find((p) => p.stage === "rss" && p.message.startsWith(`${f.announceType}:`));
                        const chip = f.lastError
                          ? JOB_STATUS.failed
                          : feedProblem
                            ? { label: feedProblem.level === "error" ? "หยุดทำงาน" : "มีคำเตือน", bg: feedProblem.level === "error" ? "#FEF2F2" : "#FFF8EB", color: feedProblem.level === "error" ? "#991B1B" : "#92400E" }
                            : JOB_STATUS.completed;
                        return (
                          <TableRow key={f.announceType}>
                            <TableCell sx={{ fontSize: "0.8rem" }}>{RSS_FEED_LABELS[f.announceType] ?? f.announceType}</TableCell>
                            <TableCell sx={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                              {formatThaiDateTime(f.lastSuccessAt)}
                              {f.lastError && <p className="text-xs text-[#991B1B] mt-0.5 line-clamp-2">{f.lastError}</p>}
                            </TableCell>
                            <TableCell>
                              <Chip label={chip.label} size="small" sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600, height: 22 }} />
                              {(f.failures > 0 || f.gaps > 0) && (
                                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                  ล้มเหลว {f.failures} · หลุด {f.gaps}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {Object.keys(health.rssCandidates).length > 0 && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-3">
                    รายการที่พบจาก RSS:{" "}
                    {Object.entries(health.rssCandidates)
                      .map(([k, v]) => `${RSS_CANDIDATE_LABELS[k] ?? k} ${v}`)
                      .join(" · ")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Ingest job + Vertex */}
            <div className="space-y-6">
              <Card sx={{ borderRadius: "var(--radius-card)" }}>
                <CardContent sx={{ p: 3 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <CloudDownloadOutlinedIcon sx={{ color: "var(--color-info)" }} />
                    <h2 className="text-base font-semibold">งานนำเข้าข้อมูล e-GP ล่าสุด (Ingestion)</h2>
                  </div>
                  {health.egp2LastJob ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const c = JOB_STATUS[health.egp2LastJob.status] ?? { label: health.egp2LastJob.status, bg: "#F1F5F9", color: "#334155" };
                          return <Chip label={c.label} size="small" sx={{ backgroundColor: c.bg, color: c.color, fontWeight: 600 }} />;
                        })()}
                        <span className="text-[var(--color-text-secondary)]">
                          เริ่ม {formatThaiDateTime(health.egp2LastJob.startedAt)} · จบ {formatThaiDateTime(health.egp2LastJob.finishedAt)}
                        </span>
                      </div>
                      {health.egp2LastJob.counts && (
                        <p className="text-[var(--color-text-secondary)]">
                          {Object.entries(health.egp2LastJob.counts)
                            .map(([k, v]) => `${k} ${v}`)
                            .join(" · ")}
                        </p>
                      )}
                      {health.egp2LastJob.error && <Alert severity="error">{health.egp2LastJob.error}</Alert>}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-text-secondary)]">ยังไม่มีประวัติการนำเข้า</p>
                  )}
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: "var(--radius-card)" }}>
                <CardContent sx={{ p: 3 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <SmartToyOutlinedIcon sx={{ color: "#7C3AED" }} />
                    <h2 className="text-base font-semibold">Vertex AI (7 วันล่าสุด)</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <MiniStat label="เรียกใช้" value={health.vertex7d.calls} />
                    <MiniStat label="ล้มเหลว" value={health.vertex7d.failures} warn={health.vertex7d.failures > 0} />
                    <MiniStat
                      label="Token (เข้า/ออก)"
                      value={`${health.vertex7d.inputTokens.toLocaleString()} / ${health.vertex7d.outputTokens.toLocaleString()}`}
                    />
                  </div>
                  {Object.keys(health.vertex7d.failuresByCode).length > 0 && (
                    <p className="text-xs text-[#991B1B] mt-2">
                      {Object.entries(health.vertex7d.failuresByCode)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Data consistency queue */}
      <Card id="tor-checks" sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 0 }}>
          <div className="flex items-center gap-2 px-6 pt-5 pb-3">
            <CompareArrowsIcon sx={{ color: "#B45309" }} />
            <h2 className="text-base font-semibold">ข้อมูลไม่สอดคล้องที่ต้องตรวจ</h2>
            <Chip label={checksTotal} size="small" sx={{ height: 22, fontWeight: 600, backgroundColor: "#FFF8EB", color: "#92400E" }} />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] px-6 pb-3">
            โครงการที่ข้อมูลจากแหล่งต่าง ๆ ขัดกัน (สถานะ ราคา วันที่) ระบบตรวจทุกวัน — admin ตรวจแล้วกด &quot;ตรวจแล้ว&quot; เพื่อปิดรายการ
          </p>
          {checksError && (
            <Alert severity="error" sx={{ mx: 3, mb: 2 }}>
              โหลดรายการไม่สำเร็จ: {checksError}
            </Alert>
          )}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>โครงการ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>ความไม่สอดคล้องที่พบ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>ราคา</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    การดำเนินการ
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingChecks ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 5, color: "var(--color-text-secondary)" }}>
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : checks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 5, color: "var(--color-text-secondary)" }}>
                      ไม่มีข้อมูลไม่สอดคล้องที่รอตรวจ
                    </TableCell>
                  </TableRow>
                ) : (
                  checks.map((t) => (
                    <TableRow key={t._id} hover>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <p className="font-medium text-sm line-clamp-2">{t.title}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {t.agencyName}
                          {t.metadata?.projectId ? ` · ${t.metadata.projectId}` : ""}
                        </p>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 420 }}>
                        <div className="space-y-1.5">
                          {t.dataChecks.conflicts.map((c, i) => (
                            <div key={i} className="text-xs">
                              <Chip
                                label={CONFLICT_LABELS[c.code] ?? c.code}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.68rem",
                                  mr: 1,
                                  backgroundColor: c.severity === "check" ? "#FEF2F2" : "#F1F5F9",
                                  color: c.severity === "check" ? "#991B1B" : "#475569",
                                }}
                              />
                              <span className="text-[var(--color-text-secondary)]">{c.message}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        <p>งบ {formatBaht(t.budget)}</p>
                        <p className="text-[var(--color-text-secondary)]">ราคากลาง {formatBaht(t.medianPrice)}</p>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {t.officialPortalUrl && (
                          <Button
                            href={t.officialPortalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            startIcon={<OpenInNewIcon fontSize="small" />}
                            sx={{ textTransform: "none", mr: 1, color: "var(--color-text-secondary)" }}
                          >
                            e-GP
                          </Button>
                        )}
                        <Button
                          component={Link}
                          href={`/admin/tor-review/${t._id}`}
                          size="small"
                          sx={{ textTransform: "none", mr: 1 }}
                        >
                          เปิดดู
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          disableElevation
                          onClick={() => setResolveTarget(t)}
                          sx={{ textTransform: "none", backgroundColor: "var(--color-primary)" }}
                        >
                          ตรวจแล้ว
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={checksTotal}
            page={checksPage}
            rowsPerPage={10}
            rowsPerPageOptions={[10]}
            onPageChange={(_, p) => setChecksPage(p)}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
          />
        </CardContent>
      </Card>

      <Dialog open={!!resolveTarget} onClose={() => !resolving && setResolveTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>ยืนยันว่าตรวจข้อมูลแล้ว</DialogTitle>
        <DialogContent>
          <p className="text-sm mb-3">{resolveTarget?.title}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            ความไม่สอดคล้องที่มีอยู่ตอนนี้จะถูกปิด หากพบความไม่สอดคล้องแบบใหม่ ระบบจะแจ้งอีกครั้งในการตรวจรอบถัดไป
          </p>
          <TextField
            label="หมายเหตุ (ไม่บังคับ)"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value.slice(0, 1000))}
            fullWidth
            multiline
            minRows={2}
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResolveTarget(null)} disabled={resolving} sx={{ textTransform: "none" }}>
            ยกเลิก
          </Button>
          <Button variant="contained" disableElevation onClick={resolve} disabled={resolving} sx={{ textTransform: "none" }}>
            {resolving ? "กำลังบันทึก..." : "ยืนยัน"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value, warn, href }: { label: string; value: number | string; warn?: boolean; href?: string }) {
  const body = (
    <div
      className={`rounded-lg border px-4 py-3 h-full ${warn ? "border-[#FCD34D] bg-[#FFFBEB]" : "border-[var(--color-border)]"} ${href ? "hover:shadow-sm transition-shadow" : ""}`}
    >
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-[#92400E]" : ""}`}>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="no-underline text-inherit">
      {body}
    </Link>
  ) : (
    body
  );
}
