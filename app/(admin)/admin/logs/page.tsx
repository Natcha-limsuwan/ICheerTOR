"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TablePagination from "@mui/material/TablePagination";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface LogItem {
  _id: string;
  action: string;
  reason?: string;
  previousStatus: string;
  newStatus: string;
  previousRole?: string;
  newRole?: string;
  adminUser?: { name: string; email: string };
  targetUser?: { name: string; email: string };
  createdAt: string;
}

const actionLabels: Record<string, string> = {
  approve: "อนุมัติ",
  verify: "ยืนยัน",
  suspend: "ระงับ",
  ban: "แบน",
  reinstate: "คืนสถานะ",
  change_role: "เปลี่ยน Role",
  delete_profile: "ลบโปรไฟล์",
};

const actionColors: Record<string, { bg: string; color: string }> = {
  approve: { bg: "#E8F8ED", color: "#166534" },
  verify: { bg: "#DBEAFE", color: "#1D4ED8" },
  suspend: { bg: "#FFF8EB", color: "#92400E" },
  ban: { bg: "#FEF2F2", color: "#7F1D1D" },
  reinstate: { bg: "#E8F8ED", color: "#166534" },
  change_role: { bg: "#F3E8FF", color: "#7C3AED" },
  delete_profile: { bg: "#FEF2F2", color: "#991B1B" },
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterAction, setFilterAction] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("limit", String(rowsPerPage));
      if (filterAction) params.set("action", filterAction);

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
      }
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ประวัติการดำเนินการ</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Audit trail ของการดำเนินการทั้งหมดโดย admin / developer
          </p>
        </div>
        <Button
          component={Link}
          href="/dashboard"
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          sx={{
            textTransform: "none",
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            alignSelf: { xs: "flex-start", sm: "center" },
            "&:hover": {
              borderColor: "var(--color-primary)",
              color: "var(--color-primary)",
              backgroundColor: "rgba(0, 71, 171, 0.04)",
            },
          }}
        >
          กลับหน้าหลัก
        </Button>
      </div>

      {/* Filter */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>ประเภท</InputLabel>
            <Select
              value={filterAction}
              label="ประเภท"
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">ทั้งหมด</MenuItem>
              <MenuItem value="approve">อนุมัติ</MenuItem>
              <MenuItem value="verify">ยืนยัน</MenuItem>
              <MenuItem value="suspend">ระงับ</MenuItem>
              <MenuItem value="ban">แบน</MenuItem>
              <MenuItem value="reinstate">คืนสถานะ</MenuItem>
              <MenuItem value="change_role">เปลี่ยน Role</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>วันที่</strong></TableCell>
                  <TableCell><strong>ผู้ดำเนินการ</strong></TableCell>
                  <TableCell><strong>การดำเนินการ</strong></TableCell>
                  <TableCell><strong>ผู้ใช้เป้าหมาย</strong></TableCell>
                  <TableCell><strong>รายละเอียด</strong></TableCell>
                  <TableCell><strong>เหตุผล</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      ไม่มีประวัติ
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const ac = actionColors[log.action] ?? actionColors.approve;
                    return (
                      <TableRow key={log._id}>
                        <TableCell>
                          <span className="text-sm">
                            {new Date(log.createdAt).toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {log.adminUser?.name ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={actionLabels[log.action] ?? log.action}
                            size="small"
                            sx={{
                              backgroundColor: ac.bg,
                              color: ac.color,
                              fontWeight: 600,
                              fontSize: "0.7rem",
                              height: 22,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm">{log.targetUser?.name ?? "—"}</span>
                            {log.targetUser?.email && (
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {log.targetUser.email}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.action === "change_role" ? (
                            <span className="text-xs">
                              {log.previousRole} → {log.newRole}
                            </span>
                          ) : (
                            <span className="text-xs">
                              {log.previousStatus} → {log.newStatus}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {log.reason || "—"}
                          </span>
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
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="แถวต่อหน้า:"
          />
        </CardContent>
      </Card>
    </div>
  );
}
