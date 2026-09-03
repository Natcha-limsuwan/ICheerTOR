"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import PeopleIcon from "@mui/icons-material/People";
import StorageIcon from "@mui/icons-material/Storage";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import CodeIcon from "@mui/icons-material/Code";
import BlockIcon from "@mui/icons-material/Block";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  bannedUsers: number;
  adminCount: number;
  developerCount: number;
}

interface RecentAction {
  _id: string;
  action: string;
  adminUser?: { name: string };
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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    bannedUsers: 0,
    adminCount: 0,
    developerCount: 0,
  });
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch users for stats
        const usersRes = await fetch("/api/admin/users?limit=1000");
        if (usersRes.ok) {
          const json = await usersRes.json();
          const users = json.data ?? [];
          setStats({
            totalUsers: users.length,
            activeUsers: users.filter((u: { status: string }) => u.status === "active").length,
            suspendedUsers: users.filter((u: { status: string }) => u.status === "suspended").length,
            bannedUsers: users.filter((u: { status: string }) => u.status === "banned").length,
            adminCount: users.filter((u: { role: string }) => u.role === "admin").length,
            developerCount: users.filter((u: { role: string }) => u.role === "developer").length,
          });
        }

        // Fetch recent actions
        const logsRes = await fetch("/api/admin/logs?limit=5");
        if (logsRes.ok) {
          const json = await logsRes.json();
          setRecentActions(json.data ?? []);
        }
      } catch {
        // handle silently
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const statCards = [
    { label: "ผู้ใช้ทั้งหมด", value: stats.totalUsers, icon: <PeopleIcon />, color: "var(--color-primary)" },
    { label: "Active", value: stats.activeUsers, icon: <StorageIcon />, color: "var(--color-success)" },
    { label: "Suspended", value: stats.suspendedUsers, icon: <BlockIcon />, color: "var(--color-warning)" },
    { label: "Developers", value: stats.developerCount, icon: <CodeIcon />, color: "#7C3AED" },
    { label: "Admins", value: stats.adminCount, icon: <AdminPanelSettingsIcon />, color: "var(--color-info)" },
    { label: "AI Engine", value: "Healthy", icon: <SmartToyIcon />, color: "var(--color-success)" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            ภาพรวมระบบและการจัดการ
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
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
                  <p className="text-lg font-bold">{loading ? "—" : stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/users" className="no-underline">
          <Card
            sx={{
              borderRadius: "var(--radius-card)",
              cursor: "pointer",
              transition: "box-shadow 0.2s",
              "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PeopleIcon sx={{ color: "var(--color-primary)" }} />
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">จัดการผู้ใช้</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      ค้นหา, กรอง, เปลี่ยน role และสถานะผู้ใช้
                    </p>
                  </div>
                </div>
                <ArrowForwardIcon sx={{ color: "var(--color-text-secondary)" }} />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/logs" className="no-underline">
          <Card
            sx={{
              borderRadius: "var(--radius-card)",
              cursor: "pointer",
              transition: "box-shadow 0.2s",
              "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AdminPanelSettingsIcon sx={{ color: "var(--color-info)" }} />
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">ประวัติการดำเนินการ</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      ดู audit trail ของ admin actions ทั้งหมด
                    </p>
                  </div>
                </div>
                <ArrowForwardIcon sx={{ color: "var(--color-text-secondary)" }} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Actions */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">การดำเนินการล่าสุด</h2>
            <Link
              href="/admin/logs"
              className="text-xs text-[var(--color-primary)] no-underline hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">กำลังโหลด...</p>
          ) : recentActions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">ยังไม่มีการดำเนินการ</p>
          ) : (
            <div className="space-y-3">
              {recentActions.map((action) => (
                <div
                  key={action._id}
                  className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Chip
                      label={actionLabels[action.action] ?? action.action}
                      size="small"
                      sx={{ fontSize: "0.7rem", height: 22 }}
                    />
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{action.adminUser?.name ?? "—"}</span>
                        {" → "}
                        <span>{action.targetUser?.name ?? action.targetUser?.email ?? "—"}</span>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {new Date(action.createdAt).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
