"use client";

import { getToken } from "@/lib/api/client";
import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Link from "next/link";
import EmptyState from "@/components/shared/EmptyState";
import NotificationsIcon from "@mui/icons-material/Notifications";
import DoneAllIcon from "@mui/icons-material/DoneAll";

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  channels: {
    inApp: { sent: boolean; readAt?: string };
    email?: { sent: boolean; sentAt?: string };
  };
  createdAt: string;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  new_match: { label: "ตรงกับคุณ", color: "#166534" },
  public_hearing: { label: "รับฟังความเห็น", color: "#92400E" },
  deadline: { label: "ใกล้หมดเขต", color: "#991B1B" },
  award: { label: "ประกาศผล", color: "#1E40AF" },
  system: { label: "ระบบ", color: "#475569" },
};

export default function AlertsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefs, setPrefs] = useState({ inApp: true, email: false });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "info" | "warning" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  useEffect(() => {
    async function loadData() {
      const headers = { Authorization: `Bearer ${getToken()}` };
      try {
        const [notifRes, prefsRes] = await Promise.all([
          fetch(`${apiUrl}/notifications`, { headers }),
          fetch(`${apiUrl}/notifications/prefs`, { headers }),
        ]);

        if (notifRes.ok) {
          const json = await notifRes.json();
          if (json.data) setNotifications(json.data);
        }

        if (prefsRes.ok) {
          const json = await prefsRes.json();
          if (json.data) setPrefs(json.data);
        }
      } catch {
        // handle
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [apiUrl]);

  const handleUpdatePrefs = async (updated: { inApp: boolean; email: boolean }) => {
    setPrefsLoading(true);
    setPrefs(updated);
    try {
      const res = await fetch(`${apiUrl}/notifications`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(updated),
      });

      if (!res.ok) throw new Error("ไม่สามารถบันทึกการตั้งค่าได้");
      setSnackbar({
        open: true,
        message: "บันทึกช่องทางการแจ้งเตือนเรียบร้อยแล้ว",
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า",
        severity: "error",
      });
    } finally {
      setPrefsLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`${apiUrl}/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setNotifications((prev) =>
        prev.map((item) =>
          item._id === id
            ? {
                ...item,
                channels: {
                  ...item.channels,
                  inApp: { ...item.channels.inApp, readAt: new Date().toISOString() },
                },
              }
            : item,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch(`${apiUrl}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((item) => ({
            ...item,
            channels: {
              ...item.channels,
              inApp: { ...item.channels.inApp, readAt: new Date().toISOString() },
            },
          })),
        );
        setSnackbar({
          open: true,
          message: "ทำเครื่องหมายว่าอ่านแล้วทั้งหมดเรียบร้อย",
          severity: "info",
        });
      }
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.channels.inApp.readAt).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">การแจ้งเตือน</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            แจ้งเตือนเมื่อมี TOR ใหม่ที่ตรงกับคุณ หรือมีความคืบหน้าโครงการ
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<DoneAllIcon />}
            onClick={handleMarkAllAsRead}
            sx={{
              textTransform: "none",
              borderRadius: "var(--radius-button)",
              color: "var(--color-primary)",
              borderColor: "var(--color-primary)",
            }}
          >
            อ่านแล้วทั้งหมด ({unreadCount})
          </Button>
        )}
      </div>

      {/* Preferences */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold">ตั้งค่าช่องทางการรับแจ้งเตือน</h2>
            {prefsLoading && (
              <span className="text-xs text-[var(--color-text-secondary)]">กำลังบันทึก...</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">
            เลือกช่องทางที่คุณต้องการรับข่าวสารเมื่อตรวจพบ TOR ที่ตรงกับคุณสมบัติของบริษัท
          </p>
          <div className="flex flex-wrap gap-6">
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.inApp}
                  disabled={prefsLoading}
                  onChange={(e) =>
                    handleUpdatePrefs({ ...prefs, inApp: e.target.checked })
                  }
                />
              }
              label={
                <div>
                  <span className="text-sm font-medium">ในระบบเว็บ</span>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    แสดงรายการแจ้งเตือนในหน้านี้และไอคอนกระดิ่ง
                  </p>
                </div>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.email}
                  disabled={prefsLoading}
                  onChange={(e) =>
                    handleUpdatePrefs({ ...prefs, email: e.target.checked })
                  }
                />
              }
              label={
                <div>
                  <span className="text-sm font-medium">อีเมล (Email Alert)</span>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    ส่งอีเมลสรุปข้อมูลโครงการทันทีเมื่อพบ TOR ที่แมตช์
                  </p>
                </div>
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification list */}
      {loading && <p className="text-[var(--color-text-secondary)]">กำลังโหลด...</p>}

      {!loading && notifications.length === 0 && (
        <EmptyState
          title="ไม่มีการแจ้งเตือน"
          message="เมื่อมี TOR ใหม่ที่ตรงกับโปรไฟล์ของคุณ จะแสดงที่นี่"
          icon={<NotificationsIcon sx={{ fontSize: 32, color: "var(--color-text-secondary)" }} />}
        />
      )}

      <div className="space-y-3">
        {notifications.map((n) => {
          const isUnread = !n.channels.inApp.readAt;
          const typeInfo = typeLabels[n.type] ?? typeLabels.system;

          return (
            <Card
              key={n._id}
              onClick={() => {
                if (isUnread) handleMarkAsRead(n._id);
              }}
              sx={{
                borderRadius: "var(--radius-card)",
                borderLeft: isUnread ? "4px solid var(--color-primary)" : "4px solid transparent",
                backgroundColor: isUnread ? "rgba(0, 71, 171, 0.02)" : "white",
                transition: "all 0.2s",
                "&:hover": {
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip
                        label={typeInfo.label}
                        size="small"
                        sx={{
                          backgroundColor: `${typeInfo.color}15`,
                          color: typeInfo.color,
                          fontWeight: 600,
                          fontSize: "0.7rem",
                          height: 22,
                        }}
                      />
                      {isUnread && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-600" />
                      )}
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {new Date(n.createdAt).toLocaleDateString("th-TH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h3 className={`text-sm ${isUnread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                      {n.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 whitespace-pre-wrap leading-relaxed">
                      {n.body}
                    </p>
                  </div>
                  {n.linkUrl && (
                    <Link
                      href={n.linkUrl}
                      onClick={() => handleMarkAsRead(n._id)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-primary)] hover:bg-slate-50 no-underline shrink-0 font-medium"
                    >
                      ดูรายละเอียด →
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
          sx={{ width: "100%", borderRadius: "8px", fontWeight: 500 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
