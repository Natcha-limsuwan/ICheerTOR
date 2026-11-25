"use client";

import { api } from "@/lib/api/client";
import {
  CONFLICT_LABELS,
  formatBaht,
  formatThaiDateTime,
  QUALIFICATION_TYPE_LABELS,
  REVIEW_STATUS_CHIP,
  WORK_TYPE_LABELS,
  type TorReviewState,
  type UncertainItem,
} from "@/lib/admin/review";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

/* ─── Shapes from GET /api/admin/tor-review/:id ─────────────────────── */

interface Qualification {
  _id?: string;
  clauseNumber?: string | null;
  criterion: string;
  minimumValue?: number | string | null;
  unit?: "THB" | "years" | "persons" | "text";
  type: string;
  isMandatory?: boolean;
  confidence?: number;
  sourcePage?: number | null;
  [key: string]: unknown;
}

interface TorRecord {
  _id: string;
  title: string;
  agencyName: string;
  budget?: number | null;
  medianPrice?: number | null;
  phase?: string;
  officialPortalUrl?: string;
  metadata?: { projectId?: string };
  extractionStatus?: string;
  extraction?: {
    extractedAt?: string;
    needsReview?: boolean;
    issues?: Array<{ severity: string; field: string; message: string }>;
  };
  parsedData?: {
    workType?: string;
    scopeOfWork?: { content?: string; confidence?: number };
    keyDates?: {
      warrantyMonths?: { value?: number | null; confidence?: number };
      contractDurationDays?: { value?: number | null; confidence?: number };
    };
    qualifications?: Qualification[];
  };
  dataChecks?: { conflicts: Array<{ code: string; severity: string; message: string }>; needsCheck: boolean };
  review?: TorReviewState;
}

interface ReviewDetail {
  record: TorRecord;
  uncertain: UncertainItem[];
  editableFields: string[];
}

/* ─── Form model (only fields the backend accepts) ──────────────────── */

interface FormState {
  title: string;
  agencyName: string;
  budget: string;
  medianPrice: string;
  workType: string;
  scopeOfWork: string;
  warrantyMonths: string;
  contractDurationDays: string;
  qualifications: Qualification[];
}

function toForm(r: TorRecord): FormState {
  const num = (v?: number | null) => (v == null ? "" : String(v));
  return {
    title: r.title ?? "",
    agencyName: r.agencyName ?? "",
    budget: num(r.budget),
    medianPrice: num(r.medianPrice),
    workType: r.parsedData?.workType ?? "other",
    scopeOfWork: r.parsedData?.scopeOfWork?.content ?? "",
    warrantyMonths: num(r.parsedData?.keyDates?.warrantyMonths?.value),
    contractDurationDays: num(r.parsedData?.keyDates?.contractDurationDays?.value),
    qualifications: (r.parsedData?.qualifications ?? []).map((q) => ({ ...q })),
  };
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** Only the fields that differ from what was loaded go into `changes`. */
function buildChanges(initial: FormState, form: FormState): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const k of ["title", "agencyName", "scopeOfWork", "workType"] as const) {
    if (form[k] !== initial[k]) changes[k] = form[k].trim();
  }
  for (const k of ["budget", "medianPrice", "warrantyMonths", "contractDurationDays"] as const) {
    if (form[k] !== initial[k]) changes[k] = numOrNull(form[k]);
  }
  if (JSON.stringify(form.qualifications) !== JSON.stringify(initial.qualifications)) {
    changes.qualifications = form.qualifications.map((q) => {
      const { confidence: _c, ...rest } = q;
      const raw = rest.minimumValue;
      const minimumValue =
        raw === "" || raw == null
          ? undefined
          : q.unit !== "text" && typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.replace(/,/g, ""))
            ? Number(raw.replace(/,/g, ""))
            : raw;
      return { ...rest, minimumValue };
    });
  }
  return changes;
}

/** "parsedData.qualifications.3" or "qualifications[3].minimumNumber" → 3 */
function qualificationIndex(field: string): number | null {
  const m = field.match(/qualifications(?:\.|\[)(\d+)/);
  return m ? Number(m[1]) : null;
}

const UNIT_LABELS: Record<string, string> = { THB: "บาท", years: "ปี", persons: "คน", text: "ข้อความ" };

export default function AdminTorReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "info" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<ReviewDetail>(`/admin/tor-review/${encodeURIComponent(id)}`);
      setDetail(res.data);
      const f = toForm(res.data.record);
      setInitial(f);
      setForm(f);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changes = useMemo(() => (initial && form ? buildChanges(initial, form) : {}), [initial, form]);
  const changedCount = Object.keys(changes).length;

  const flaggedQualifications = useMemo(() => {
    const set = new Set<number>();
    for (const u of detail?.uncertain ?? []) {
      const i = qualificationIndex(u.field);
      if (i != null) set.add(i);
    }
    return set;
  }, [detail]);

  async function submit(dryRun: boolean) {
    if (!form || !initial) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await api.put<{ changedFields: string[]; dryRun: boolean }>(
        `/admin/tor-review/${encodeURIComponent(id)}`,
        { changes, note: note.trim() || undefined, verify: true, dryRun },
      );
      const fields = res.data.changedFields ?? [];
      if (dryRun) {
        setResult({
          kind: "info",
          text: `ตรวจสอบผ่าน — ถ้าบันทึกจะแก้ ${fields.length} ช่อง${fields.length ? `: ${fields.join(", ")}` : " (ยืนยันว่าข้อมูลถูกต้อง)"}`,
        });
      } else {
        setResult({
          kind: "success",
          text: `บันทึกผลการตรวจแล้ว — แก้ไข ${fields.length} ช่อง และทำเครื่องหมายว่า "ตรวจแล้ว"`,
        });
        setNote("");
        await load();
      }
    } catch (e) {
      setResult({ kind: "error", text: `บันทึกไม่สำเร็จ: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const setQualification = (index: number, patch: Partial<Qualification>) =>
    setForm((f) =>
      f ? { ...f, qualifications: f.qualifications.map((q, i) => (i === index ? { ...q, ...patch } : q)) } : f,
    );

  if (loading && !detail) {
    return <p className="text-sm text-[var(--color-text-secondary)]">กำลังโหลด...</p>;
  }
  if (loadError || !detail || !form) {
    return (
      <div className="space-y-4">
        <BackButton />
        <Alert severity="error">โหลดข้อมูล TOR ไม่สำเร็จ: {loadError ?? "ไม่พบข้อมูล"}</Alert>
      </div>
    );
  }

  const r = detail.record;
  const status = r.review?.status ?? "pending";
  const chip = REVIEW_STATUS_CHIP[status];
  const checkConflicts = (r.dataChecks?.conflicts ?? []).filter((c) => c.severity === "check");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <BackButton />
          <h1 className="text-xl font-bold mt-3 leading-snug">{r.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-[var(--color-text-secondary)]">
            <span>{r.agencyName}</span>
            {r.metadata?.projectId && <span>· เลขโครงการ {r.metadata.projectId}</span>}
            <span>· AI อ่านเมื่อ {formatThaiDateTime(r.extraction?.extractedAt)}</span>
            <Chip label={chip.label} size="small" sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600, height: 24 }} />
          </div>
          {r.review?.reviewedAt && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              ตรวจล่าสุด {formatThaiDateTime(r.review.reviewedAt)}
              {r.review.editedFields?.length ? ` · แก้ไข ${r.review.editedFields.join(", ")}` : ""}
              {r.review.note ? ` · หมายเหตุ: ${r.review.note}` : ""}
            </p>
          )}
        </div>
        {r.officialPortalUrl && (
          <Button
            href={r.officialPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            sx={{ textTransform: "none", flexShrink: 0, borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
          >
            เปิดเอกสารบน e-GP
          </Button>
        )}
      </div>

      {/* What needs a look */}
      <Card sx={{ borderRadius: "var(--radius-card)", border: "1px solid #FCD34D", backgroundColor: "#FFFBEB" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center gap-2 mb-3">
            <WarningAmberOutlinedIcon sx={{ color: "#B45309" }} />
            <h2 className="text-base font-semibold">สิ่งที่ต้องตรวจ ({detail.uncertain.length + checkConflicts.length})</h2>
          </div>
          {detail.uncertain.length === 0 && checkConflicts.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">ไม่มีช่องที่ AI ไม่มั่นใจ</p>
          ) : (
            <ul className="space-y-2">
              {detail.uncertain.map((u, i) => (
                <li key={`u${i}`} className="text-sm bg-white rounded-lg px-4 py-3 border border-[#FDE68A]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.label}</span>
                    <code className="text-xs text-[var(--color-text-secondary)]">{u.field}</code>
                    {u.confidence != null && (
                      <Chip label={`ความมั่นใจ ${u.confidence}`} size="small" sx={{ height: 20, fontSize: "0.7rem" }} />
                    )}
                    {u.sourcePage != null && (
                      <Chip label={`TOR หน้า ${u.sourcePage}`} size="small" sx={{ height: 20, fontSize: "0.7rem" }} />
                    )}
                  </div>
                  <p className="text-[var(--color-text-secondary)] mt-1">{u.reason}</p>
                </li>
              ))}
              {checkConflicts.map((c, i) => (
                <li key={`c${i}`} className="text-sm bg-white rounded-lg px-4 py-3 border border-[#FDE68A]">
                  <span className="font-semibold">{CONFLICT_LABELS[c.code] ?? c.code}</span>
                  <p className="text-[var(--color-text-secondary)] mt-1">{c.message}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* General fields */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-base font-semibold mb-4">ข้อมูลโครงการ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="ชื่อโครงการ" value={form.title} onChange={(e) => set("title", e.target.value)} fullWidth size="small" multiline className="md:col-span-2" />
            <TextField label="หน่วยงาน" value={form.agencyName} onChange={(e) => set("agencyName", e.target.value)} fullWidth size="small" />
            <TextField select label="ประเภทงาน" value={form.workType} onChange={(e) => set("workType", e.target.value)} fullWidth size="small">
              {Object.entries(WORK_TYPE_LABELS).map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="วงเงินงบประมาณ (บาท)"
              type="number"
              value={form.budget}
              onChange={(e) => set("budget", e.target.value)}
              helperText={`เดิม ${formatBaht(r.budget)}`}
              fullWidth
              size="small"
            />
            <TextField
              label="ราคากลาง (บาท)"
              type="number"
              value={form.medianPrice}
              onChange={(e) => set("medianPrice", e.target.value)}
              helperText={`เดิม ${formatBaht(r.medianPrice)}`}
              fullWidth
              size="small"
            />
            <TextField label="รับประกัน (เดือน)" type="number" value={form.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} fullWidth size="small" />
            <TextField label="ระยะเวลาดำเนินงาน (วัน)" type="number" value={form.contractDurationDays} onChange={(e) => set("contractDurationDays", e.target.value)} fullWidth size="small" />
            <TextField
              label="ขอบเขตงาน"
              value={form.scopeOfWork}
              onChange={(e) => set("scopeOfWork", e.target.value)}
              fullWidth
              size="small"
              multiline
              minRows={3}
              maxRows={10}
              className="md:col-span-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Qualifications */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">คุณสมบัติผู้ยื่นข้อเสนอ ({form.qualifications.length} ข้อ)</h2>
            <Button
              size="small"
              startIcon={<AddIcon />}
              sx={{ textTransform: "none" }}
              onClick={() =>
                set("qualifications", [...form.qualifications, { criterion: "", type: "other", unit: "text", isMandatory: true }])
              }
            >
              เพิ่มข้อ
            </Button>
          </div>
          <div className="space-y-3">
            {form.qualifications.map((q, i) => {
              const flagged = flaggedQualifications.has(i);
              return (
                <div
                  key={q._id ?? `new-${i}`}
                  className={`rounded-lg border px-4 py-3 ${flagged ? "border-[#F59E0B] bg-[#FFFBEB]" : "border-[var(--color-border)]"}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <span className="font-semibold text-[var(--color-text-primary)]">ข้อ {q.clauseNumber ?? i + 1}</span>
                      {q.sourcePage != null && <span>· TOR หน้า {q.sourcePage}</span>}
                      {q.confidence != null && <span>· ความมั่นใจ {q.confidence}</span>}
                      {flagged && (
                        <Chip label="ต้องตรวจ" size="small" sx={{ height: 20, fontSize: "0.7rem", backgroundColor: "#FDE68A", color: "#92400E" }} />
                      )}
                    </div>
                    <Tooltip title="ลบข้อนี้">
                      <IconButton
                        size="small"
                        onClick={() => set("qualifications", form.qualifications.filter((_, j) => j !== i))}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <TextField
                      label="เงื่อนไข"
                      value={q.criterion}
                      onChange={(e) => setQualification(i, { criterion: e.target.value })}
                      size="small"
                      multiline
                      className="md:col-span-6"
                    />
                    <TextField
                      select
                      label="ประเภท"
                      value={q.type}
                      onChange={(e) => setQualification(i, { type: e.target.value })}
                      size="small"
                      className="md:col-span-2"
                    >
                      {Object.entries(QUALIFICATION_TYPE_LABELS).map(([v, l]) => (
                        <MenuItem key={v} value={v}>
                          {l}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="ค่าขั้นต่ำ"
                      value={q.minimumValue ?? ""}
                      onChange={(e) => setQualification(i, { minimumValue: e.target.value })}
                      size="small"
                      className="md:col-span-2"
                    />
                    <TextField
                      select
                      label="หน่วย"
                      value={q.unit ?? "text"}
                      onChange={(e) => setQualification(i, { unit: e.target.value as Qualification["unit"] })}
                      size="small"
                      className="md:col-span-2"
                    >
                      {Object.entries(UNIT_LABELS).map(([v, l]) => (
                        <MenuItem key={v} value={v}>
                          {l}
                        </MenuItem>
                      ))}
                    </TextField>
                  </div>
                  <FormControlLabel
                    sx={{ mt: 1, "& .MuiFormControlLabel-label": { fontSize: "0.8rem" } }}
                    control={
                      <Switch
                        size="small"
                        checked={q.isMandatory !== false}
                        onChange={(e) => setQualification(i, { isMandatory: e.target.checked })}
                      />
                    }
                    label="เป็นเงื่อนไขบังคับ"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Review decision */}
      <Card sx={{ borderRadius: "var(--radius-card)", position: "sticky", bottom: 16, zIndex: 5, boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-base font-semibold mb-3">บันทึกผลการตรวจ</h2>
          {result && (
            <Alert severity={result.kind} sx={{ mb: 2 }} onClose={() => setResult(null)}>
              {result.text}
            </Alert>
          )}
          <TextField
            label="หมายเหตุการตรวจ (ไม่บังคับ)"
            placeholder="เช่น ตรวจกับ TOR หน้า 12 แล้ว ทุนจดทะเบียนที่ถูกต้องคือ 2,000,000 บาท"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            fullWidth
            size="small"
            multiline
            minRows={2}
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {changedCount === 0
                ? "ยังไม่ได้แก้ไข — บันทึกได้เพื่อยืนยันว่าข้อมูลที่ AI อ่านถูกต้อง"
                : `แก้ไขแล้ว ${changedCount} ช่อง: ${Object.keys(changes).join(", ")}`}
            </p>
            <div className="flex gap-2">
              {changedCount > 0 && (
                <Button variant="text" disabled={saving} onClick={() => initial && setForm(initial)} sx={{ textTransform: "none" }}>
                  ยกเลิกการแก้ไข
                </Button>
              )}
              <Button
                variant="outlined"
                disabled={saving}
                startIcon={<RuleOutlinedIcon />}
                onClick={() => submit(true)}
                sx={{ textTransform: "none" }}
              >
                ตรวจสอบก่อนบันทึก
              </Button>
              <Button
                variant="contained"
                disableElevation
                disabled={saving}
                startIcon={<FactCheckOutlinedIcon />}
                onClick={() => submit(false)}
                sx={{ textTransform: "none", backgroundColor: "var(--color-primary)" }}
              >
                {saving ? "กำลังบันทึก..." : changedCount > 0 ? "บันทึกการแก้ไขและยืนยัน" : "ยืนยันว่าถูกต้อง"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BackButton() {
  return (
    <Button
      component={Link}
      href="/admin/tor-review"
      size="small"
      startIcon={<ArrowBackIcon />}
      sx={{ textTransform: "none", color: "var(--color-text-secondary)", px: 0 }}
    >
      กลับไปรายการตรวจทาน
    </Button>
  );
}
