"use client";

import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "next/link";
import EmptyState from "@/components/shared/EmptyState";
import NotificationsIcon from "@mui/icons-material/Notifications";

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  channels: {
    inApp: { sent: boolean; readAt?: string };
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
  const [prefs, setPrefs] = useState({ inApp: true, email: false, line: false });

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const json = await res.json();
          if (json.data) setNotifications(json.data);
        }
      } catch {
        // handle
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">การแจ้งเตือน</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          แจ้งเตือนเมื่อมี TOR ใหม่ที่ตรงกับคุณ
        </p>
      </div>

      {/* Preferences */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-lg font-semibold mb-3">ตั้งค่าช่องทาง</h2>
          <div className="flex flex-wrap gap-4">
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.inApp}
                  onChange={(e) => setPrefs({ ...prefs, inApp: e.target.checked })}
                />
              }
              label="ในแอป"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.email}
                  onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
                />
              }
              label="อีเมล"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.line}
                  onChange={(e) => setPrefs({ ...prefs, line: e.target.checked })}
                />
              }
              label="LINE"
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
              sx={{
                borderRadius: "var(--radius-card)",
                borderLeft: isUnread ? "3px solid var(--color-primary)" : undefined,
                opacity: isUnread ? 1 : 0.7,
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip
                        label={typeInfo.label}
                        size="small"
                        sx={{ backgroundColor: `${typeInfo.color}15`, color: typeInfo.color, fontWeight: 500, fontSize: "0.7rem", height: 20 }}
                      />
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {new Date(n.createdAt).toLocaleDateString("th-TH")}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium">{n.title}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      {n.body}
                    </p>
                  </div>
                  {n.linkUrl && (
                    <Link
                      href={n.linkUrl}
                      className="text-xs text-[var(--color-primary)] hover:underline no-underline shrink-0"
                    >
                      ดูรายละเอียด
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
