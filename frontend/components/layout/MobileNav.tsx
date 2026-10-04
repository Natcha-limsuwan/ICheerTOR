"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonIcon from "@mui/icons-material/Person";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import RadarIcon from "@mui/icons-material/Radar";

const navItems = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: <DashboardIcon /> },
  { href: "/procurement", label: "จัดซื้อจัดจ้าง", icon: <SearchIcon /> },
  { href: "/alerts", label: "การแจ้งเตือน", icon: <NotificationsIcon /> },
  { href: "/profile", label: "โปรไฟล์", icon: <PersonIcon /> },
  { href: "/bookmarks", label: "บันทึกไว้", icon: <BookmarkIcon /> },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <IconButton onClick={() => setOpen(true)} sx={{ color: "var(--color-text-primary)" }}>
        <MenuIcon />
      </IconButton>

      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <div className="w-64 flex flex-col h-full bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <RadarIcon sx={{ color: "var(--color-primary)" }} />
              <span className="font-bold" style={{ color: "var(--color-primary)" }}>
                iCheerTOR
              </span>
            </div>
            <IconButton onClick={() => setOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </div>

          {/* Links */}
          <nav className="flex flex-col gap-1 p-3 flex-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium
                    transition-colors no-underline
                    ${
                      isActive
                        ? "bg-blue-50 text-[var(--color-primary)]"
                        : "text-[var(--color-text-secondary)] hover:bg-gray-50"
                    }
                  `}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </Drawer>
    </div>
  );
}
