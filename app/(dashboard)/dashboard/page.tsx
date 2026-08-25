"use client";

import { useSession } from "next-auth/react";
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

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          สวัสดี, {session?.user?.name ?? "ผู้ใช้"}
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
        <div className="space-y-3">
          {[
            {
              title: "จ้างพัฒนาระบบจัดการข้อมูลเมืองอัจฉริยะ",
              agency: "สำนักยุทธศาสตร์และประเมินผล",
              budget: "฿12,500,000",
              match: "95%",
              deadline: "15 ก.ย. 2569",
              phase: "bidding" as const,
            },
            {
              title: "จ้างพัฒนาเว็บไซต์บริการประชาชนออนไลน์",
              agency: "สำนักงานคณะกรรมการข้อมูลข่าวสาร",
              budget: "฿3,200,000",
              match: "88%",
              deadline: "30 ส.ค. 2569",
              phase: "bidding" as const,
            },
            {
              title: "จ้างพัฒนาระบบ AI สำหรับวิเคราะห์การจราจร",
              agency: "สำนักการจราจรและขนส่ง",
              budget: "฿8,500,000",
              match: "72%",
              deadline: "1 ต.ค. 2569",
              phase: "public_hearing" as const,
            },
          ].map((item, i) => (
            <Card
              key={i}
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
                        {item.budget}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        กำหนดส่ง: {item.deadline}
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
                      {item.phase === "public_hearing" ? "รับฟังความเห็น" : "เสนอราคา"}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "var(--color-success)" }}>
                      ตรงกัน {item.match}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
