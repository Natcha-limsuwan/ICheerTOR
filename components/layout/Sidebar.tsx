"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import RadarIcon from "@mui/icons-material/Radar";
import { useSession } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  labelEn: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "แดชบอร์ด", labelEn: "Dashboard", icon: <DashboardIcon /> },
  { href: "/procurement", label: "จัดซื้อจัดจ้าง", labelEn: "Procurement", icon: <SearchIcon /> },
  { href: "/alerts", label: "การแจ้งเตือน", labelEn: "Alerts", icon: <NotificationsIcon /> },
  { href: "/profile", label: "โปรไฟล์", labelEn: "Profile", icon: <PersonIcon /> },
  { href: "/bookmarks", label: "บันทึกไว้", labelEn: "Bookmarks", icon: <BookmarkIcon /> },
  { href: "/compare", label: "เปรียบเทียบ", labelEn: "Compare", icon: <CompareArrowsIcon /> },
  { href: "/admin", label: "ผู้ดูแลระบบ", labelEn: "Admin", icon: <AdminPanelSettingsIcon />, adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = (session?.user as Record<string, unknown>)?.role;

  return (
    <aside className="hidden md:flex flex-col w-[var(--sidebar-width)] min-h-[calc(100vh-var(--topbar-height))] bg-white border-r border-[var(--color-border)] py-4">
      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-6 py-3 mb-4 no-underline"
      >
        <RadarIcon sx={{ color: "var(--color-primary)", fontSize: 28 }} />
        <span
          className="text-lg font-bold"
          style={{ color: "var(--color-primary)" }}
        >
          iCheerTOR
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {navItems
          .filter((item) => !item.adminOnly || userRole === "admin")
          .map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium
                  transition-colors no-underline
                  ${
                    isActive
                      ? "bg-blue-50 text-[var(--color-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-gray-50 hover:text-[var(--color-text-primary)]"
                  }
                `}
              >
                <span
                  className={`${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]"}`}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* Bottom */}
      <div className="px-6 py-3 border-t border-[var(--color-border)] mt-auto">
        <p className="text-xs text-[var(--color-text-secondary)]">
          I Cheer TOR v1.0
        </p>
      </div>
    </aside>
  );
}
