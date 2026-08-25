"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Link from "next/link";
import EmptyState from "@/components/shared/EmptyState";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";

interface TORItem {
  _id: string;
  title: string;
  agencyName: string;
  phase: string;
  medianPrice?: number;
  budget?: number;
  submissionDeadline?: string;
  tags: string[];
}

const phaseLabels: Record<string, string> = {
  public_hearing: "รับฟังความเห็น",
  bidding: "เสนอราคา",
  awarded: "ประกาศผลแล้ว",
};

function CompareContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",") ?? [];
  const [items, setItems] = useState<TORItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchItems() {
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/tor/${id}`);
            const json = await res.json();
            return json.data as TORItem;
          }),
        );
        setItems(results.filter(Boolean));
      } catch {
        // handle
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <p className="text-[var(--color-text-secondary)]">กำลังโหลด...</p>;
  }

  if (items.length < 2) {
    return (
      <EmptyState
        title="เลือก TOR อย่างน้อย 2 รายการ"
        message='กลับไปหน้ารายการจัดซื้อจัดจ้าง แล้วเลือก TOR ที่ต้องการเปรียบเทียบ'
        icon={<CompareArrowsIcon sx={{ fontSize: 32, color: "var(--color-text-secondary)" }} />}
      />
    );
  }

  const rows = [
    { label: "หน่วยงาน", key: "agencyName" },
    { label: "ขั้นตอน", key: "phase" },
    { label: "ราคากลาง", key: "medianPrice" },
    { label: "งบประมาณ", key: "budget" },
    { label: "กำหนดส่ง", key: "submissionDeadline" },
    { label: "เทคโนโลยี", key: "tags" },
  ];

  return (
    <Card sx={{ borderRadius: "var(--radius-card)" }}>
      <CardContent sx={{ p: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>เกณฑ์</strong></TableCell>
                {items.map((item) => (
                  <TableCell key={item._id}>
                    <Link
                      href={`/procurement/${item._id}`}
                      className="text-[var(--color-primary)] hover:underline no-underline font-semibold text-sm"
                    >
                      {item.title.slice(0, 40)}...
                    </Link>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    {row.label}
                  </TableCell>
                  {items.map((item) => {
                    const val = (item as unknown as Record<string, unknown>)[row.key];
                    let display: string;

                    if (row.key === "medianPrice" || row.key === "budget") {
                      display = typeof val === "number" ? `฿${val.toLocaleString()}` : "—";
                    } else if (row.key === "submissionDeadline") {
                      display = val ? new Date(val as string).toLocaleDateString("th-TH") : "—";
                    } else if (row.key === "tags") {
                      display = Array.isArray(val) ? (val as string[]).join(", ") : "—";
                    } else if (row.key === "phase") {
                      display = phaseLabels[val as string] ?? (val as string);
                    } else {
                      display = (val as string) ?? "—";
                    }

                    return (
                      <TableCell key={item._id} sx={{ fontSize: "0.875rem" }}>
                        {display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">เปรียบเทียบ TOR</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          เปรียบเทียบ TOR หลายรายการแบบเทียบกัน
        </p>
      </div>
      <Suspense fallback={<p>กำลังโหลด...</p>}>
        <CompareContent />
      </Suspense>
    </div>
  );
}
