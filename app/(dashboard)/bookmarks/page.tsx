"use client";

import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import BookmarkRemoveIcon from "@mui/icons-material/BookmarkRemove";
import Link from "next/link";
import PillBadge from "@/components/shared/PillBadge";
import EmptyState from "@/components/shared/EmptyState";
import BookmarkIcon from "@mui/icons-material/Bookmark";

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
};

interface BookmarkItem {
  _id: string;
  torRecordId: {
    _id: string;
    title: string;
    agencyName: string;
    phase: string;
    medianPrice?: number;
    submissionDeadline?: string;
    tags: string[];
  };
  createdAt: string;
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBookmarks() {
      try {
        const res = await fetch("/api/bookmarks");
        const json = await res.json();
        if (json.data) setBookmarks(json.data);
      } catch {
        // handle
      } finally {
        setLoading(false);
      }
    }
    fetchBookmarks();
  }, []);

  const handleRemove = async (id: string) => {
    try {
      await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
      setBookmarks((prev) => prev.filter((b) => b._id !== id));
    } catch {
      // handle error
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">บันทึกไว้</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          TOR ที่คุณบันทึกไว้เพื่อติดตาม
        </p>
      </div>

      {loading && <p className="text-[var(--color-text-secondary)]">กำลังโหลด...</p>}

      {!loading && bookmarks.length === 0 && (
        <EmptyState
          title="ยังไม่มีรายการบันทึก"
          message="คลิกไอคอนบันทึกบน TOR ที่สนใจ เพื่อติดตามกำหนดส่ง"
          icon={<BookmarkIcon sx={{ fontSize: 32, color: "var(--color-text-secondary)" }} />}
        />
      )}

      <div className="space-y-3">
        {bookmarks.map((bm) => {
          const tor = bm.torRecordId;
          return (
            <Card
              key={bm._id}
              sx={{
                borderRadius: "var(--radius-card)",
                "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/procurement/${tor._id}`}
                    className="flex-1 min-w-0 no-underline"
                  >
                    <h3 className="font-semibold text-sm truncate text-[var(--color-text-primary)]">
                      {tor.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      {tor.agencyName}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      {tor.medianPrice && (
                        <span className="text-xs font-medium">
                          ฿{tor.medianPrice.toLocaleString()}
                        </span>
                      )}
                      {tor.submissionDeadline && (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          กำหนดส่ง: {new Date(tor.submissionDeadline).toLocaleDateString("th-TH")}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <PillBadge
                      label={phaseLabels[tor.phase] ?? tor.phase}
                      value={tor.phase}
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleRemove(bm._id)}
                      title="ยกเลิกบันทึก"
                    >
                      <BookmarkRemoveIcon sx={{ color: "var(--color-error)" }} />
                    </IconButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
