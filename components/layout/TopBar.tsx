"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import RadarIcon from "@mui/icons-material/Radar";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useState } from "react";

export default function TopBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isAdminSection = pathname.startsWith("/admin");

  return (
    <header className="bg-white sticky top-0 z-40 border-b border-[var(--color-border)] shadow-sm h-16 flex items-center px-6">
      <div className="flex justify-between items-center w-full">
        {/* Left: Logo & Back to Main if in Admin */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <RadarIcon sx={{ color: "var(--color-primary)" }} />
            <span
              className="text-xl font-bold hidden sm:inline"
              style={{ color: "var(--color-primary)" }}
            >
              iCheerTOR
            </span>
          </Link>

          {isAdminSection && (
            <Button
              component={Link}
              href="/dashboard"
              variant="outlined"
              size="small"
              startIcon={<ArrowBackIcon sx={{ fontSize: 18 }} />}
              sx={{
                textTransform: "none",
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
                "&:hover": {
                  borderColor: "var(--color-primary)",
                  color: "var(--color-primary)",
                  backgroundColor: "rgba(0, 71, 171, 0.04)",
                },
                borderRadius: "var(--radius-button)",
                fontSize: "0.85rem",
                px: 1.5,
              }}
            >
              กลับหน้าหลัก
            </Button>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {session?.user && (
            <>
              {/* Notification bell */}
              <IconButton
                component={Link}
                href="/alerts"
                size="small"
                sx={{ color: "var(--color-text-secondary)" }}
              >
                <NotificationsNoneIcon />
              </IconButton>

              {/* User avatar + menu */}
              <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                size="small"
              >
                <Avatar
                  src={session.user.image ?? undefined}
                  alt={session.user.name ?? "User"}
                  sx={{ width: 32, height: 32 }}
                />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
              >
                <MenuItem disabled>
                  <span className="text-sm font-medium">
                    {session.user.name}
                  </span>
                </MenuItem>
                <MenuItem
                  component={Link}
                  href="/profile"
                  onClick={() => setAnchorEl(null)}
                >
                  โปรไฟล์
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setAnchorEl(null);
                    signOut({ callbackUrl: "/" });
                  }}
                >
                  ออกจากระบบ
                </MenuItem>
              </Menu>
            </>
          )}

          {!session?.user && (
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg text-white text-sm font-medium no-underline"
              style={{ background: "var(--color-primary)" }}
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
