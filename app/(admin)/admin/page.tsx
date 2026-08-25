"use client";

import { useState, useEffect } from "react";
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
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import VerifiedIcon from "@mui/icons-material/Verified";
import PeopleIcon from "@mui/icons-material/People";
import StorageIcon from "@mui/icons-material/Storage";
import SmartToyIcon from "@mui/icons-material/SmartToy";

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

export default function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    user?: UserItem;
    action?: string;
    reason: string;
  }>({ open: false, reason: "" });

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const json = await res.json();
          if (json.data) setUsers(json.data);
        }
      } catch {
        // handle
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

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
        const json = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u._id === json.data._id ? json.data : u)),
        );
      }
    } catch {
      // handle
    }
    setActionDialog({ open: false, reason: "" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">ผู้ดูแลระบบ</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          จัดการผู้ใช้และดูสถานะระบบ
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "ผู้ใช้ทั้งหมด", value: users.length, icon: <PeopleIcon />, color: "var(--color-primary)" },
          { label: "สถานะ Scraper", value: "Active", icon: <StorageIcon />, color: "var(--color-success)" },
          { label: "AI Engine", value: "Healthy", icon: <SmartToyIcon />, color: "var(--color-info)" },
        ].map((stat, i) => (
          <Card key={i} sx={{ borderRadius: "var(--radius-card)" }}>
            <CardContent sx={{ p: 3 }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}15`, color: stat.color }}
                >
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
                  <TableCell><strong>จัดการ</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const sc = statusColors[user.status] ?? statusColors.pending;
                    return (
                      <TableRow key={user._id}>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={user.role === "admin" ? "Admin" : "User"}
                            size="small"
                            sx={{ fontSize: "0.7rem", height: 22 }}
                          />
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
                          <div className="flex gap-1">
                            {user.status === "active" && (
                              <IconButton
                                size="small"
                                title="ระงับ"
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
                            )}
                            {user.status === "suspended" && (
                              <IconButton
                                size="small"
                                title="คืนสถานะ"
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
          <Button variant="contained" onClick={handleAction} color={actionDialog.action === "suspend" ? "warning" : "success"}>
            ยืนยัน
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
