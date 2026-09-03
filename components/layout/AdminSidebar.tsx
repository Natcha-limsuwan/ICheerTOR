"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import HistoryIcon from "@mui/icons-material/History";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RadarIcon from "@mui/icons-material/Radar";
import Chip from "@mui/material/Chip";
import { useSession } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const adminNavItems: NavItem[] = [
  { href: "/admin", label: "แดชบอร์ด", icon: <DashboardIcon /> },
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: <PeopleIcon /> },
  { href: "/admin/logs", label: "ประวัติการดำเนินการ", icon: <HistoryIcon /> },
];

const roleLabels: Record<string, { label: string; color: string }> = {
  developer: { label: "Developer", color: "#7C3AED" },
  admin: { label: "Admin", color: "#0047AB" },
  user: { label: "User", color: "#64748B" },
};

export default function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = ((session?.user as any)?.role as string) ?? "user";
  const roleInfo = roleLabels[role] ?? roleLabels.user;

  return (
    <aside className="hidden md:flex flex-col w-[var(--sidebar-width)] min-h-[calc(100vh-var(--topbar-height))] bg-white border-r border-[var(--color-border)] py-4">
      {/* Brand */}
      <Link
        href="/admin"
        className="flex items-center gap-2 px-6 py-3 mb-2 no-underline"
      >
        <RadarIcon sx={{ color: "var(--color-primary)", fontSize: 28 }} />
        <span
          className="text-lg font-bold"
          style={{ color: "var(--color-primary)" }}
        >
          Admin Panel
        </span>
      </Link>

      {/* Role badge */}
      <div className="px-6 mb-4">
        <Chip
          label={roleInfo.label}
          size="small"
          sx={{
            backgroundColor: `${roleInfo.color}15`,
            color: roleInfo.color,
            fontWeight: 600,
            fontSize: "0.7rem",
            height: 24,
          }}
        />
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {adminNavItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
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

      {/* Bottom — Back to app */}
      <div className="px-3 py-3 border-t border-[var(--color-border)] mt-auto">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-gray-50 hover:text-[var(--color-text-primary)] transition-colors no-underline"
        >
          <ArrowBackIcon sx={{ fontSize: 20 }} />
          กลับหน้าหลัก
        </Link>
      </div>
    </aside>
  );
}
