"use client";


import { getToken } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Pagination from "@mui/material/Pagination";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useRouter } from "next/navigation";
import PillBadge from "@/components/shared/PillBadge";
import EmptyState from "@/components/shared/EmptyState";
import ProcurementTour from "@/components/shared/ProcurementTour";

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
};

const displayPhase = (tor: TORItem) =>
  tor.displayPhase ?? (tor.phase === "bidding" && tor.bidWindow?.state === "closed" ? "closed" : tor.phase);

const displayPhaseLabel = (tor: TORItem) => {
  const phase = displayPhase(tor);
  return phase === "closed" ? "ปิดรับข้อเสนอแล้ว" : phaseLabels[phase] ?? phase;
};

interface TORItem {
  _id: string;
  title: string;
  agencyName: string;
  phase: string;
  displayPhase?: string;
  medianPrice?: number;
  budget?: number;
  postingDate: string;
  submissionDeadline?: string;
  sourceUrl: string;
  officialPortalUrl?: string;
  tags: string[];
  bidWindow?: { state: "closed" | "upcoming" | "today" | "unknown" };
  match?: {
    matchScore: number | null;
    fitScore: number | null;
    dataCoverage: number;
    eligibilityStatus: "eligible" | "ineligible" | "incomplete" | "unknown";
    counts: { pass: number; fail: number; unknown: number };
  } | null;
  parsedData?: {
    keyDates?: {
      submissionDate?: { date?: string | null };
      documentFeePeriod?: { from: string; to: string } | null;
    };
  };
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));

const eligibilityLabel = {
  eligible: "ผ่านเงื่อนไขบังคับ",
  ineligible: "มีข้อที่ไม่ผ่าน",
  incomplete: "ต้องตรวจเพิ่ม",
  unknown: "ยังตรวจคุณสมบัติไม่ได้",
} as const;

export default function ProcurementPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("");
  const [status, setStatus] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [sortBy, setSortBy] = useState("announcedDate");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<TORItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;
  const priceError = [budgetMin, budgetMax].some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))
    ? "ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป"
    : budgetMin !== "" && budgetMax !== "" && Number(budgetMin) > Number(budgetMax)
      ? "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" : "";

  useEffect(() => {
    const controller = new AbortController();
    const fetchRecords = async () => {
      setLoading(true);
      setError(null);
      if (priceError) {
        setRecords([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (phase) params.set("phase", phase);
        if (status) params.set("status", status);
        if (budgetMin !== "") params.set("budgetMin", budgetMin);
        if (budgetMax !== "") params.set("budgetMax", budgetMax);
        params.set("sortBy", sortBy);
        params.set("sortOrder", "desc");
        params.set("includeMatch", "true");
        params.set("page", String(page));
        params.set("limit", String(limit));

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/tor?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "ค้นหา TOR ไม่สำเร็จ กรุณาลองอีกครั้ง");
        if (controller.signal.aborted) return;
        setRecords(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setRecords([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "ค้นหา TOR ไม่สำเร็จ กรุณาลองอีกครั้ง");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const debounce = setTimeout(fetchRecords, 300);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [search, phase, status, sortBy, page, budgetMin, budgetMax, priceError]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">สวัสดี, {user?.name ?? "ผู้ใช้"}</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            ค้นหาและติดตาม TOR ซอฟต์แวร์จากหน่วยงานกรุงเทพมหานคร
          </p>
        </div>
        <ProcurementTour />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <TextField
          data-tour="tor-search"
          label="Smart Search TOR"
          placeholder="เช่น เว็บไซต์ บำรุงรักษา หรือชื่อหน่วยงาน"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ flex: 1, minWidth: { sm: 220 } }}
          slotProps={{
            htmlInput: { maxLength: 200 },
            input: {
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="ล้างคำค้นหา" onClick={() => { setSearch(""); setPage(1); }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />

        <div data-tour="tor-filters" className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>ขั้นตอน</InputLabel>
            <Select
              value={phase}
              label="ขั้นตอน"
              onChange={(e) => {
                setPhase(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">ทั้งหมด</MenuItem>
              <MenuItem value="public_hearing">รับฟังความเห็น</MenuItem>
              <MenuItem value="bidding">เสนอราคา</MenuItem>
              <MenuItem value="awarded">ประกาศผลแล้ว</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>สถานะ</InputLabel>
            <Select
              value={status}
              label="สถานะ"
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">ทั้งหมด</MenuItem>
              <MenuItem value="open">เปิด</MenuItem>
              <MenuItem value="closed">ปิด</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>เรียงตาม</InputLabel>
            <Select
              value={sortBy}
              label="เรียงตาม"
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            >
              <MenuItem value="announcedDate">วันที่ประกาศ</MenuItem>
              <MenuItem value="medianPrice">ราคากลาง</MenuItem>
              <MenuItem value="submissionDeadline">กำหนดส่ง</MenuItem>
            </Select>
          </FormControl>
        </div>
      </div>

      <div data-tour="tor-price" className="space-y-2">
        <p id="price-range-label" className="text-sm font-medium">ช่วงราคากลาง (บาท)</p>
        <div role="group" aria-labelledby="price-range-label" className="flex flex-col sm:flex-row sm:items-start gap-3">
          <TextField
            label="ราคาต่ำสุด"
            placeholder="ไม่จำกัด"
            type="number"
            size="small"
            value={budgetMin}
            error={Boolean(priceError)}
            onChange={(e) => { setBudgetMin(e.target.value); setPage(1); }}
            slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal", "aria-describedby": priceError ? "price-range-error" : undefined } }}
            sx={{ width: { xs: "100%", sm: 200 } }}
          />
          <TextField
            label="ราคาสูงสุด"
            placeholder="ไม่จำกัด"
            type="number"
            size="small"
            value={budgetMax}
            error={Boolean(priceError)}
            onChange={(e) => { setBudgetMax(e.target.value); setPage(1); }}
            slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal", "aria-describedby": priceError ? "price-range-error" : undefined } }}
            sx={{ width: { xs: "100%", sm: 200 } }}
          />
          {(budgetMin !== "" || budgetMax !== "") && (
            <Button size="small" onClick={() => { setBudgetMin(""); setBudgetMax(""); setPage(1); }}>
              ล้างช่วงราคา
            </Button>
          )}
        </div>
        {priceError && <p id="price-range-error" role="alert" className="text-xs text-red-600">{priceError}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-secondary)]">
          ค้นชื่อโครงการ หน่วยงาน เลขโครงการ และรายละเอียด TOR พร้อมคำใกล้เคียงไทย–อังกฤษ
          · เว้นวรรคเพื่อค้นทุกคำ
        </p>
        <div data-tour="tor-examples" className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">ลองค้นหา:</span>
          {["เว็บไซต์", "บำรุงรักษา", "ฐานข้อมูล", "คลาวด์"].map((term) => (
            <Chip key={term} label={term} size="small" variant="outlined"
              onClick={() => { setSearch(term); setPage(1); }} />
          ))}
        </div>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Results count */}
      <p data-tour="tor-results" role="status" aria-live="polite" className="text-xs text-[var(--color-text-secondary)]">
        {priceError ? "กรุณาตรวจสอบช่วงราคา" : loading ? "กำลังค้นหา..." : `พบ ${total} รายการ`}
      </p>

      {/* Listing */}
      {!loading && !error && !priceError && records.length === 0 && <EmptyState />}

      <div className="space-y-3">
        {!loading && !error && !priceError && records.map((tor) => (
            <Card
              key={tor._id}
              role="link"
              tabIndex={0}
              aria-label={`ดูรายละเอียด ${tor.title}`}
              onClick={() => router.push(`/procurement/${tor._id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/procurement/${tor._id}`);
                }
              }}
              sx={{
                borderRadius: "var(--radius-card)",
                cursor: "pointer",
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate text-[var(--color-text-primary)]">
                      {tor.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      {tor.agencyName}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {tor.medianPrice && (
                        <span className="text-xs font-medium">
                          ฿{tor.medianPrice.toLocaleString()}
                        </span>
                      )}
                      {tor.parsedData?.keyDates?.documentFeePeriod && (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          ช่วงซื้อเอกสาร: {formatDate(tor.parsedData.keyDates.documentFeePeriod.from)} – {formatDate(tor.parsedData.keyDates.documentFeePeriod.to)}
                        </span>
                      )}
                      {(tor.parsedData?.keyDates?.submissionDate?.date ?? tor.submissionDeadline) && (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          กำหนดส่ง:{" "}
                          {formatDate(tor.parsedData?.keyDates?.submissionDate?.date ?? tor.submissionDeadline!)}
                        </span>
                      )}
                    </div>
                    {tor.tags.some((tag) => tag !== "open") && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tor.tags.filter((tag) => tag !== "open").slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {tag === "bidding" && displayPhase(tor) === "closed" ? "ปิดรับแล้ว" : tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <PillBadge
                      label={displayPhaseLabel(tor)}
                      value={displayPhase(tor)}
                    />
                    <span className={`text-xs font-bold ${tor.match?.matchScore != null ? "text-green-600" : "text-[var(--color-text-secondary)]"}`}>
                      {tor.match?.matchScore != null
                        ? `เหมาะสม ${Math.round(tor.match.matchScore * 100)}%`
                        : "ยังประเมินไม่ได้"}
                    </span>
                    {tor.match && (
                      <span className={`text-[11px] ${tor.match.eligibilityStatus === "ineligible" ? "text-red-600" : tor.match.eligibilityStatus === "eligible" ? "text-emerald-700" : "text-amber-700"}`}>
                        {eligibilityLabel[tor.match.eligibilityStatus]} · ข้อมูล {Math.round(tor.match.dataCoverage * 100)}%
                      </span>
                    )}
                    {tor.officialPortalUrl && (
                      <a
                        href={tor.officialPortalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[var(--color-primary)] flex items-center gap-1 hover:underline"
                      >
                        ดูประกาศ
                        <OpenInNewIcon sx={{ fontSize: 12 }} />
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
        ))}
      </div>

      {/* Pagination */}
      {!loading && !error && !priceError && totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, v) => setPage(v)}
            color="primary"
          />
        </div>
      )}
    </div>
  );
}
