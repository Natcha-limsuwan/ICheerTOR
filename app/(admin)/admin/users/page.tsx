"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import TablePagination from "@mui/material/TablePagination";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import VerifiedIcon from "@mui/icons-material/Verified";
import SearchIcon from "@mui/icons-material/Search";
import GavelIcon from "@mui/icons-material/Gavel";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface UserItem {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: "#E8F8ED", color: "#166534" },
  pending: { bg: "#FFF8EB", color: "#92400E" },
  suspended: { bg: "#FEF2F2", color: "#991B1B" },
  banned: { bg: "#FEF2F2", color: "#7F1D1D" },
};

const roleColors: Record<string, { bg: string; color: string }> = {
  developer: { bg: "#F3E8FF", color: "#7C3AED" },
  admin: { bg: "#DBEAFE", color: "#1D4ED8" },
  user: { bg: "#F1F5F9", color: "#64748B" },
};

const roleLabels: Record<string, string> = {
  developer: "Developer",
  admin: "Admin",
  user: "User",
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentRole = ((session?.user as any)?.role as string) ?? "user";

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Action dialog
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    user?: UserItem;
    action?: string;
    reason: string;
  }>({ open: false, reason: "" });

  // Role dialog
  const [roleDialog, setRoleDialog] = useState<{
    open: boolean;
    user?: UserItem;
    newRole: string;
    reason: string;
  }>({ open: false, newRole: "", reason: "" });

  // Snackbar feedback
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("limit", String(rowsPerPage));
      if (searchQuery) params.set("q", searchQuery);
      if (filterRole) params.set("role", filterRole);
      if (filterStatus) params.set("status", filterStatus);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
      }
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchQuery, filterRole, filterStatus]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleAction = async () => {
    if (!actionDialog.user || !actionDialog.action) return;
    try {
      const res = await fetch(`/api/admin/users/${actionDialog.user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionDialog.action,
          reason: actionDialog.reason,
        }),
      });
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `ดำเนินการ ${actionDialog.action === "suspend" ? "ระงับ" : "คืนสถานะ"} ผู้ใช้เรียบร้อยแล้ว`,
          severity: "success",
        });
        fetchUsers();
      } else {
        const err = await res.json();
        setSnackbar({
          open: true,
          message: err.error?.message || "เกิดข้อผิดพลาดในการดำเนินการ",
          severity: "error",
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
        severity: "error",
      });
    }
    setActionDialog({ open: false, reason: "" });
  };

  const handleRoleChange = async () => {
    if (!roleDialog.user || !roleDialog.newRole) return;
    try {
      const res = await fetch(`/api/admin/users/${roleDialog.user._id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: roleDialog.newRole,
          reason: roleDialog.reason,
        }),
      });
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `เปลี่ยน Role ของ ${roleDialog.user.name} เป็น ${roleLabels[roleDialog.newRole] ?? roleDialog.newRole} เรียบร้อยแล้ว (บันทึก Log แล้ว)`,
          severity: "success",
        });
        fetchUsers();
      } else {
        const err = await res.json();
        setSnackbar({
          open: true,
          message: err.error?.message || "เกิดข้อผิดพลาดในการเปลี่ยน Role",
          severity: "error",
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
        severity: "error",
      });
    }
    setRoleDialog({ open: false, newRole: "", reason: "" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">จัดการผู้ใช้</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            ค้นหา, กรอง, เปลี่ยน role และจัดการสถานะผู้ใช้
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

      {/* Filters */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex flex-wrap gap-3 items-end">
            <TextField
              label="ค้นหา"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              size="small"
              sx={{ minWidth: 240 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: "var(--color-text-secondary)" }} />
                    </InputAdornment>
                  ),
                },
              }}
              placeholder="ชื่อหรืออีเมล..."
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Role</InputLabel>
              <Select
                value={filterRole}
                label="Role"
                onChange={(e) => {
                  setFilterRole(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">ทั้งหมด</MenuItem>
                <MenuItem value="developer">Developer</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="user">User</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>สถานะ</InputLabel>
              <Select
                value={filterStatus}
                label="สถานะ"
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">ทั้งหมด</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
                <MenuItem value="banned">Banned</MenuItem>
              </Select>
            </FormControl>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>ชื่อ</strong></TableCell>
                  <TableCell><strong>อีเมล</strong></TableCell>
                  <TableCell><strong>บทบาท</strong></TableCell>
                  <TableCell><strong>สถานะ</strong></TableCell>
                  <TableCell><strong>ยืนยัน</strong></TableCell>
                  <TableCell><strong>เข้าใช้ล่าสุด</strong></TableCell>
                  <TableCell><strong>จัดการ</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      ไม่พบผู้ใช้
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const sc = statusColors[user.status] ?? statusColors.pending;
                    const rc = roleColors[user.role] ?? roleColors.user;
                    return (
                      <TableRow key={user._id}>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>
                          <span className="text-sm">{user.email}</span>
                        </TableCell>
                        <TableCell>
                          {user.email !== session?.user?.email ? (
                            <Tooltip title="คลิกเพื่อเปลี่ยน Role">
                              <Chip
                                label={roleLabels[user.role] ?? user.role}
                                size="small"
                                onClick={() =>
                                  setRoleDialog({
                                    open: true,
                                    user,
                                    newRole: user.role === "admin" ? "user" : "admin",
                                    reason: "",
                                  })
                                }
                                sx={{
                                  backgroundColor: rc.bg,
                                  color: rc.color,
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                  height: 22,
                                  cursor: "pointer",
                                  "&:hover": {
                                    opacity: 0.8,
                                    boxShadow: "0 0 0 2px " + rc.color,
                                  },
                                }}
                              />
                            </Tooltip>
                          ) : (
                            <Chip
                              label={roleLabels[user.role] ?? user.role}
                              size="small"
                              sx={{
                                backgroundColor: rc.bg,
                                color: rc.color,
                                fontWeight: 600,
                                fontSize: "0.7rem",
                                height: 22,
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={user.status}
                            size="small"
                            sx={{
                              backgroundColor: sc.bg,
                              color: sc.color,
                              fontWeight: 500,
                              fontSize: "0.7rem",
                              height: 22,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {user.isVerified ? (
                            <VerifiedIcon sx={{ color: "var(--color-success)", fontSize: 18 }} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString("th-TH", {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            {/* Role change button */}
                            {user.email !== session?.user?.email && (
                              <Tooltip title="เปลี่ยน Role ผู้ใช้">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setRoleDialog({
                                      open: true,
                                      user,
                                      newRole: user.role === "admin" ? "user" : "admin",
                                      reason: "",
                                    })
                                  }
                                >
                                  <ManageAccountsIcon sx={{ fontSize: 18, color: "#7C3AED" }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {/* Suspend */}
                            {user.status === "active" && user.email !== session?.user?.email && (
                              <Tooltip title="ระงับการใช้งาน">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setActionDialog({
                                      open: true,
                                      user,
                                      action: "suspend",
                                      reason: "",
                                    })
                                  }
                                >
                                  <BlockIcon sx={{ fontSize: 16, color: "var(--color-warning)" }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {/* Reinstate */}
                            {user.status === "suspended" && user.email !== session?.user?.email && (
                              <Tooltip title="คืนสถานะการใช้งาน">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setActionDialog({
                                      open: true,
                                      user,
                                      action: "reinstate",
                                      reason: "",
                                    })
                                  }
                                >
                                  <CheckCircleIcon sx={{ fontSize: 16, color: "var(--color-success)" }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </div>
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

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ open: false, reason: "" })}>
        <DialogTitle>
          ยืนยันการ{actionDialog.action === "suspend" ? "ระงับ" : "คืนสถานะ"}ผู้ใช้
        </DialogTitle>
        <DialogContent>
          <p className="text-sm mb-3">
            {actionDialog.user?.name} ({actionDialog.user?.email})
          </p>
          <TextField
            label="เหตุผล"
            value={actionDialog.reason}
            onChange={(e) => setActionDialog((prev) => ({ ...prev, reason: e.target.value }))}
            fullWidth
            multiline
            rows={3}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ open: false, reason: "" })}>ยกเลิก</Button>
          <Button
            variant="contained"
            onClick={handleAction}
            color={actionDialog.action === "suspend" ? "warning" : "success"}
          >
            ยืนยัน
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={roleDialog.open} onClose={() => setRoleDialog({ open: false, newRole: "", reason: "" })}>
        <DialogTitle>เปลี่ยน Role ผู้ใช้</DialogTitle>
        <DialogContent>
          <p className="text-sm font-medium mb-1">
            {roleDialog.user?.name} ({roleDialog.user?.email})
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">
            Role ปัจจุบัน:{" "}
            <strong>{roleLabels[roleDialog.user?.role ?? "user"] ?? roleDialog.user?.role}</strong>
          </p>
          <div className="space-y-4">
            <FormControl fullWidth size="small">
              <InputLabel>Role ใหม่</InputLabel>
              <Select
                value={roleDialog.newRole}
                label="Role ใหม่"
                onChange={(e) => setRoleDialog((prev) => ({ ...prev, newRole: e.target.value }))}
              >
                {currentRole === "developer" && (
                  <MenuItem value="developer">Developer (นักพัฒนา)</MenuItem>
                )}
                <MenuItem value="admin">Admin (ผู้ดูแลระบบ)</MenuItem>
                <MenuItem value="user">User (ผู้ใช้ทั่วไป)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="เหตุผลในการเปลี่ยน Role (บันทึกลง Audit Log)"
              value={roleDialog.reason}
              onChange={(e) => setRoleDialog((prev) => ({ ...prev, reason: e.target.value }))}
              fullWidth
              size="small"
              placeholder="เช่น มอบหมายเป็นผู้ดูแลระบบ..."
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog({ open: false, newRole: "", reason: "" })}>ยกเลิก</Button>
          <Button
            variant="contained"
            onClick={handleRoleChange}
            disabled={!roleDialog.newRole || roleDialog.newRole === roleDialog.user?.role}
            sx={{
              backgroundColor: "#7C3AED",
              "&:hover": { backgroundColor: "#6D28D9" },
            }}
          >
            ยืนยันเปลี่ยน Role
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
