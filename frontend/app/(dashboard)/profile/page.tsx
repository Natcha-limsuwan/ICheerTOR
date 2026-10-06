"use client";

import { getToken } from "@/lib/api/client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import SaveIcon from "@mui/icons-material/Save";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Alert from "@mui/material/Alert";

interface Credential {
  name: string;
  issuedBy?: string;
}

interface ProfileData {
  companyName: string;
  companyAge: number;
  techStacks: string[];
  interestedCategories: string[];
  credentials: Credential[];
  teamSize: number;
}

const PRESET_PROJECT_TYPES = [
  "ระบบเว็บแอปพลิเคชัน (Web Application)",
  "แอปพลิเคชันมือถือ (Mobile Application)",
  "ระบบสารสนเทศ / พอร์ทัลข้อมูล (Data Portal & MIS)",
  "แดชบอร์ดและวิเคราะห์ข้อมูล (Dashboard & Analytics)",
  "ปัญญาประดิษฐ์ (AI & Machine Learning)",
  "ระบบคลาวด์และโครงสร้างพื้นฐาน (Cloud & Infrastructure)",
  "ความมั่นคงปลอดภัยไซเบอร์ (Cybersecurity)",
  "ระบบเชื่อมโยงข้อมูล (System Integration & API)",
  "ระบบบริหารจัดการองค์กร (ERP / CRM)",
  "อินเทอร์เน็ตของสรรพสิ่ง / สมาร์ทซิตี้ (IoT & Smart City)",
  "พัฒนาระบบและบำรุงรักษา (Maintenance & Support)",
  "จัดหาและติดตั้งระบบสารสนเทศ (IT Procurement & Setup)",
];

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>({
    companyName: "",
    companyAge: 0,
    techStacks: [],
    interestedCategories: [],
    credentials: [],
    teamSize: 1,
  });
  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newTech, setNewTech] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // Navigation warning dialog
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/profile`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (res.ok) {
          const json = await res.json();
          const data = json.data ?? {};
          const loadedData: ProfileData = {
            companyName: data.companyName ?? "",
            companyAge: data.companyAge ?? 0,
            techStacks: data.techStacks ?? [],
            interestedCategories: data.interestedCategories ?? [],
            credentials: data.credentials ?? [],
            teamSize: data.teamSize ?? 1,
          };
          setProfile(loadedData);
          setInitialProfile(loadedData);
          setIsNew(false);
        } else {
          setInitialProfile({
            companyName: "",
            companyAge: 0,
            techStacks: [],
            interestedCategories: [],
            credentials: [],
            teamSize: 1,
          });
        }
      } catch {
        setInitialProfile({
          companyName: "",
          companyAge: 0,
          techStacks: [],
          interestedCategories: [],
          credentials: [],
          teamSize: 1,
        });
      }
    }
    loadProfile();
  }, []);

  // Check if user has modified profile without saving
  const isDirty = useMemo(() => {
    if (!initialProfile) return false;
    return JSON.stringify(profile) !== JSON.stringify(initialProfile);
  }, [profile, initialProfile]);

  // Intercept browser reload / tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Intercept in-app link clicks when changes are unsaved
  useEffect(() => {
    if (!isDirty) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (href === window.location.pathname || href === "/profile") return;

      e.preventDefault();
      e.stopPropagation();
      setPendingUrl(href);
      setShowLeaveDialog(true);
    };

    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
    };
  }, [isDirty]);

  const handleConfirmLeave = () => {
    setShowLeaveDialog(false);
    setInitialProfile(profile); // Reset dirty check
    if (pendingUrl) {
      router.push(pendingUrl);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveDialog(false);
    setPendingUrl(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/profile`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          ...profile,
          pastContracts: [],
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "บันทึกโปรไฟล์สำเร็จ" });
        setIsNew(false);
        setInitialProfile(profile);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error?.message ?? "บันทึกไม่สำเร็จ" });
      }
    } catch {
      setMessage({ type: "error", text: "เกิดข้อผิดพลาด" });
    } finally {
      setSaving(false);
    }
  };

  const addTech = () => {
    if (newTech.trim() && !profile.techStacks.includes(newTech.trim())) {
      setProfile((p) => ({ ...p, techStacks: [...p.techStacks, newTech.trim()] }));
      setNewTech("");
    }
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !profile.interestedCategories.includes(trimmed)) {
      setProfile((p) => ({ ...p, interestedCategories: [...p.interestedCategories, trimmed] }));
      setNewCategory("");
    }
  };

  const toggleCategory = (cat: string) => {
    setProfile((p) => {
      const exists = p.interestedCategories.includes(cat);
      return {
        ...p,
        interestedCategories: exists
          ? p.interestedCategories.filter((c) => c !== cat)
          : [...p.interestedCategories, cat],
      };
    });
  };

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">โปรไฟล์บริษัท</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          กรอกข้อมูลบริษัทของคุณเพื่อจับคู่กับ TOR
        </p>
      </div>

      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Company Info */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-lg font-semibold mb-4">ข้อมูลบริษัท</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              label="ชื่อบริษัท"
              value={profile.companyName}
              onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="อายุบริษัท (ปี)"
              type="number"
              value={profile.companyAge}
              onChange={(e) => setProfile({ ...profile, companyAge: Number(e.target.value) })}
              fullWidth
              size="small"
            />
            <TextField
              label="จำนวนทีมงาน (คน)"
              type="number"
              value={profile.teamSize}
              onChange={(e) => setProfile({ ...profile, teamSize: Number(e.target.value) })}
              fullWidth
              size="small"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tech Stacks */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-lg font-semibold mb-4">เทคโนโลยี</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {profile.techStacks.map((tech) => (
              <Chip
                key={tech}
                label={tech}
                onDelete={() =>
                  setProfile((p) => ({ ...p, techStacks: p.techStacks.filter((t) => t !== tech) }))
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <TextField
              placeholder="เพิ่มเทคโนโลยี..."
              value={newTech}
              onChange={(e) => setNewTech(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTech()}
              size="small"
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" onClick={addTech} startIcon={<AddIcon />}>
              เพิ่ม
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Interested Project Types */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">ประเภทงานที่สนใจ</h2>
            <span className="text-xs text-[var(--color-text-secondary)]">
              เลือกแล้ว {profile.interestedCategories.length} รายการ
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            เลือกประเภทงานหรือโครงการจัดซื้อจัดจ้างที่คุณสนใจเพื่อช่วยค้นหาและจับคู่กับ TOR
          </p>

          {/* Quick Select Presets */}
          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              เลือกจากหมวดหมู่งานยอดนิยม (คลิกเพื่อเลือก / ยกเลิก):
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROJECT_TYPES.map((type) => {
                const isSelected = profile.interestedCategories.includes(type);
                return (
                  <Chip
                    key={type}
                    label={type}
                    clickable
                    color={isSelected ? "primary" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    icon={isSelected ? <CheckIcon fontSize="small" /> : undefined}
                    onClick={() => toggleCategory(type)}
                    sx={{
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      py: 0.5,
                      transition: "all 0.15s ease",
                      ...(isSelected && {
                        fontWeight: 600,
                      }),
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Selected Categories */}
          {profile.interestedCategories.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                รายการที่เลือกไว้:
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.interestedCategories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    color="primary"
                    variant="filled"
                    onDelete={() =>
                      setProfile((p) => ({
                        ...p,
                        interestedCategories: p.interestedCategories.filter((c) => c !== cat),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Input (similar to techstack) */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              หรือพิมพ์เพิ่มประเภทงานอื่น ๆ:
            </p>
            <div className="flex gap-2">
              <TextField
                placeholder="พิมพ์ประเภทงานที่สนใจ..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                size="small"
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" onClick={addCategory} startIcon={<AddIcon />}>
                เพิ่ม
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PDPA Section */}
      <Card
        sx={{
          borderRadius: "var(--radius-card)",
          borderTop: "3px solid var(--color-info)",
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <h2 className="text-lg font-semibold mb-3">ข้อมูลส่วนบุคคล (PDPA)</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล คุณมีสิทธิ์ดูข้อมูล และลบบัญชีของคุณ
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverIcon />}
              size="small"
            >
              ลบบัญชี
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button at the Bottom */}
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving}
        startIcon={<SaveIcon />}
        fullWidth
        size="large"
      >
        {saving ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
      </Button>

      {/* Unsaved Changes Confirmation Dialog */}
      <Dialog
        open={showLeaveDialog}
        onClose={handleCancelLeave}
        slotProps={{
          paper: {
            sx: { borderRadius: "var(--radius-card)", p: 1, maxWidth: 440 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon color="warning" />
          ยังไม่ได้บันทึกข้อมูล
        </DialogTitle>
        <DialogContent>
          <p className="text-sm text-[var(--color-text-secondary)]">
            คุณมีการเปลี่ยนแปลงข้อมูลโปรไฟล์ที่ยังไม่ได้บันทึก หากออกจากหน้านี้ ข้อมูลที่แก้ไขจะไม่ได้รับการบันทึก คุณแน่ใจหรือไม่ว่าต้องการออกจากหน้านี้?
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelLeave} variant="outlined" sx={{ textTransform: "none" }}>
            อยู่หน้านี้ต่อ
          </Button>
          <Button
            onClick={handleConfirmLeave}
            variant="contained"
            color="error"
            sx={{ textTransform: "none" }}
          >
            ออกจากหน้านี้
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
