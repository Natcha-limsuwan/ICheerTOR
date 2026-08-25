"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Pagination from "@mui/material/Pagination";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Link from "next/link";
import PillBadge from "@/components/shared/PillBadge";
import EmptyState from "@/components/shared/EmptyState";

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
};

interface TORItem {
  _id: string;
  title: string;
  agencyName: string;
  phase: string;
  medianPrice?: number;
  budget?: number;
  postingDate: string;
  submissionDeadline?: string;
  sourceUrl: string;
  officialPortalUrl?: string;
  tags: string[];
}

export default function ProcurementPage() {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("");
  const [sortBy, setSortBy] = useState("postingDate");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<TORItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (phase) params.set("phase", phase);
      params.set("sortBy", sortBy);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/tor?${params.toString()}`);
      const json = await res.json();

      if (json.data) {
        setRecords(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch TOR records:", err);
    } finally {
      setLoading(false);
    }
  }, [search, phase, sortBy, page]);

  useEffect(() => {
    const debounce = setTimeout(fetchRecords, 300);
    return () => clearTimeout(debounce);
  }, [fetchRecords]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">จัดซื้อจัดจ้าง</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          ค้นหาและติดตาม TOR ซอฟต์แวร์จากหน่วยงานกรุงเทพมหานคร
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <TextField
          placeholder="ค้นหา TOR..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />

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

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>เรียงตาม</InputLabel>
          <Select
            value={sortBy}
            label="เรียงตาม"
            onChange={(e) => setSortBy(e.target.value)}
          >
            <MenuItem value="postingDate">วันที่ประกาศ</MenuItem>
            <MenuItem value="medianPrice">ราคากลาง</MenuItem>
            <MenuItem value="submissionDeadline">กำหนดส่ง</MenuItem>
          </Select>
        </FormControl>
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        {loading ? "กำลังค้นหา..." : `พบ ${total} รายการ`}
      </p>

      {/* Listing */}
      {!loading && records.length === 0 && <EmptyState />}

      <div className="space-y-3">
        {records.map((tor) => (
          <Link
            key={tor._id}
            href={`/procurement/${tor._id}`}
            className="no-underline block"
          >
            <Card
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
                      {tor.submissionDeadline && (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          กำหนดส่ง:{" "}
                          {new Date(tor.submissionDeadline).toLocaleDateString("th-TH")}
                        </span>
                      )}
                    </div>
                    {tor.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tor.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <PillBadge
                      label={phaseLabels[tor.phase] ?? tor.phase}
                      value={tor.phase}
                    />
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
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
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
