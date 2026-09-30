"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { getToken } from "@/lib/api/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import SearchIcon from "@mui/icons-material/Search";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import NotificationsIcon from "@mui/icons-material/Notifications";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

const summaryCards = [
  {
    title: "TOR ทั้งหมด",
    value: "342",
    subtitle: "+12 ใหม่วันนี้",
    icon: <SearchIcon />,
    color: "var(--color-primary)",
    bg: "#EBF0FF",
  },
  {
    title: "บันทึกไว้",
    value: "8",
    subtitle: "2 ใกล้หมดเขต",
    icon: <BookmarkIcon />,
    color: "var(--color-secondary)",
    bg: "#FFF8EB",
  },
  {
    title: "แจ้งเตือนใหม่",
    value: "5",
    subtitle: "3 ยังไม่ได้อ่าน",
    icon: <NotificationsIcon />,
    color: "var(--color-info)",
    bg: "#E8F7FA",
  },
  {
    title: "อัตราจับคู่",
    value: "73%",
    subtitle: "เทียบกับเดือนก่อน +5%",
    icon: <TrendingUpIcon />,
    color: "var(--color-success)",
    bg: "#E8F8ED",
  },
];

interface TOROpportunity {
  _id: string;
  title: string;
  agencyName: string;
  medianPrice?: number;
  budget?: number;
  submissionDeadline?: string;
  phase: string;
}

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<TOROpportunity[]>([]);
  const [loadingOpportunities, setLoadingOpportunities] = useState(true);

  useEffect(() => {
    async function fetchOpportunities() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/tor?sortBy=postingDate&limit=3`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        const json = await response.json();
        if (json.data) setOpportunities(json.data);
      } catch (error) {
        console.error("Failed to fetch dashboard opportunities:", error);
      } finally {
        setLoadingOpportunities(false);
      }
    }

    fetchOpportunities();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          สวัสดี, {user?.name ?? "ผู้ใช้"}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          ภาพรวมโอกาสจัดซื้อจัดจ้างซอฟต์แวร์ กทม.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <Card key={i} sx={{ borderRadius: "var(--radius-card)" }}>
            <CardContent sx={{ p: 3 }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)] font-medium">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {card.subtitle}
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: card.bg, color: card.color }}
                >
                  {card.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent opportunities */}
      <div>
        <h2 className="text-lg font-semibold mb-4">โอกาสล่าสุดที่ตรงกับคุณ</h2>
        {loadingOpportunities && (
          <p className="text-sm text-[var(--color-text-secondary)]">กำลังโหลดรายการ TOR...</p>
        )}
        {!loadingOpportunities && opportunities.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white px-5 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            ยังไม่มีรายการ TOR ที่แสดงได้ในขณะนี้
          </div>
        )}
        <div className="space-y-3">
          {opportunities.map((item, i) => (
            <Link key={item._id} href={`/procurement/${item._id}`} className="block no-underline">
              <Card
              sx={{
                borderRadius: "var(--radius-card)",
                cursor: "pointer",
                "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      {item.agency}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs font-medium">
                        {`฿${(item.budget ?? item.medianPrice ?? 0).toLocaleString("th-TH")}`}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        กำหนดส่ง: {item.submissionDeadline ? new Date(item.submissionDeadline).toLocaleDateString("th-TH") : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        item.phase === "public_hearing"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {phaseLabels[item.phase] ?? item.phase}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "var(--color-success)" }}>
                      ตรงกัน {95 - i * 7}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
