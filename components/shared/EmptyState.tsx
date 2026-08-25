"use client";

import SearchOffIcon from "@mui/icons-material/SearchOff";

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
}

export default function EmptyState({
  title = "ไม่พบผลลัพธ์",
  message = "ลองเปลี่ยนคำค้นหาหรือตัวกรอง",
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        {icon ?? (
          <SearchOffIcon sx={{ fontSize: 32, color: "var(--color-text-secondary)" }} />
        )}
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
        {message}
      </p>
    </div>
  );
}
