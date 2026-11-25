"use client";

import { api } from "@/lib/api/client";
import {
  formatThaiDateTime,
  REVIEW_STATUS_CHIP,
  type TorReviewState,
  type UncertainItem,
} from "@/lib/admin/review";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/* Shape returned by GET /api/admin/tor-review */
interface ReviewListItem {
  _id: string;
  title: string;
  agencyName: string;
  phase?: string;
  submissionDeadline?: string | null;
  officialPortalUrl?: string;
  metadata?: { projectId?: string };
  extractedAt: string | null;
  review?: TorReviewState;
  uncertain: UncertainItem[];
}

type StatusFilter = "pending" | "verified" | "outdated" | "all";

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "รอตรวจทาน" },
  { value: "verified", label: "ตรวจแล้ว" },
  { value: "outdated", label: "ข้อมูลเปลี่ยนหลังตรวจ" },
  { value: "all", label: "ทั้งหมด" },
];

export default function AdminTorReviewPage() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<ReviewListItem[]>("/admin/tor-review", {
          status,
          page: page + 1,
          limit: rowsPerPage,
        });
        if (cancelled) return;
        setItems(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [status, page, rowsPerPage]);

  const rowStatus = (item: ReviewListItem) => item.review?.status ?? "pending";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">ตรวจทานข้อมูล TOR</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          TOR ที่ AI อ่านแล้วไม่มั่นใจ หรือตัวตรวจสอบพบค่าที่ควรให้คนตรวจ — เปิดดู แก้ไข และบันทึกผลการตรวจ
        </p>
      </div>

      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 0 }}>
          <Tabs
            value={status}
            onChange={(_, v: StatusFilter) => {
              setStatus(v);
              setPage(0);
            }}
            sx={{ px: 2, borderBottom: "1px solid var(--color-border)" }}
          >
            {STATUS_TABS.map((t) => (
              <Tab key={t.value} value={t.value} label={t.label} sx={{ textTransform: "none", fontWeight: 600 }} />
            ))}
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              โหลดรายการไม่สำเร็จ: {error}
            </Alert>
          )}

          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>โครงการ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>สิ่งที่ต้องตรวจ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>AI อ่านเมื่อ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>สถานะ</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    การดำเนินการ
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: "var(--color-text-secondary)" }}>
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: "var(--color-text-secondary)" }}>
                      ไม่มี TOR ในหมวดนี้
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const chip = REVIEW_STATUS_CHIP[rowStatus(item)];
                    return (
                      <TableRow key={item._id} hover>
                        <TableCell sx={{ maxWidth: 420 }}>
                          <p className="font-medium text-sm line-clamp-2">{item.title}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                            {item.agencyName}
                            {item.metadata?.projectId ? ` · เลขโครงการ ${item.metadata.projectId}` : ""}
                          </p>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 360 }}>
                          {item.uncertain.length === 0 ? (
                            <span className="text-xs text-[var(--color-text-secondary)]">—</span>
                          ) : (
                            <div className="space-y-1">
                              <Chip
                                label={`${item.uncertain.length} จุด`}
                                size="small"
                                sx={{ backgroundColor: "#FFF8EB", color: "#92400E", fontWeight: 600, height: 22 }}
                              />
                              {item.uncertain.slice(0, 2).map((u, i) => (
                                <p key={i} className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                                  • {u.label}: {u.reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                          {formatThaiDateTime(item.extractedAt)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={chip.label}
                            size="small"
                            sx={{ backgroundColor: chip.bg, color: chip.color, fontWeight: 600, height: 24 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          {item.officialPortalUrl && (
                            <Button
                              href={item.officialPortalUrl}
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
                            href={`/admin/tor-review/${item._id}`}
                            variant="contained"
                            size="small"
                            disableElevation
                            startIcon={<FactCheckOutlinedIcon fontSize="small" />}
                            sx={{ textTransform: "none", backgroundColor: "var(--color-primary)" }}
                          >
                            ตรวจทาน
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[10, 20, 50]}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            labelRowsPerPage="แถวต่อหน้า"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
