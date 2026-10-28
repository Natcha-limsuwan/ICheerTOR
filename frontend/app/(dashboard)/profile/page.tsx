"use client";

import { getToken } from "@/lib/api/client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
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
  expiresAt?: string;
}

interface PastContract {
  description: string;
  value: number;
  year: number;
  agencyName?: string;
  agencyType?: "government" | "private" | "unknown";
}

interface Personnel {
  role: string;
  count: number;
  certifications: string[];
}

interface ProfileData {
  companyName: string;
  companyAge: number;
  foundedYear: number | null;
  registeredCapital: number | null;
  pastContracts: PastContract[];
  techStacks: string[];
  interestedCategories: string[];
  credentials: Credential[];
  teamSize: number;
  personnel: Personnel[];
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

const PRESET_TECH_STACKS = [
  "React",
  "Next.js",
  "Vue.js",
  "Angular",
  "Node.js",
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Spring Boot",
  "Go",
  "C# / .NET",
  "PHP",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "Google Cloud (GCP)",
  "Microsoft Azure",
  "Flutter",
  "React Native",
  "iOS (Swift)",
  "Android (Kotlin)",
  "AI & Machine Learning",
  "Data Analytics / BI",
];

const PRESET_CREDENTIALS = [
  "ISO/IEC 29110",
  "ISO/IEC 27001",
  "ISO 9001",
  "ISO/IEC 20000-1",
  "CMMI Level 2",
  "CMMI Level 3",
  "CMMI Level 5",
  "ขึ้นทะเบียนผู้ประกอบการดิจิทัล (depa d-list)",
  "ขึ้นทะเบียนผู้ประกอบการ SME (THAI SME-GP)",
  "หนังสือแต่งตั้งตัวแทนจำหน่าย (Authorized Reseller/Partner)",
  "CSA STAR (Cloud Security)",
  "มาตรฐาน มรท. 8001",
  "PMP (Project Management Professional)",
  "CISSP",
];

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>({
    companyName: "",
    companyAge: 0,
    foundedYear: null,
    registeredCapital: null,
    pastContracts: [],
    techStacks: [],
    interestedCategories: [],
    credentials: [],
    teamSize: 1,
    personnel: [],
  });
  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newTech, setNewTech] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCertName, setNewCertName] = useState("");
  const [newCertIssuer, setNewCertIssuer] = useState("");

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
            foundedYear: data.foundedYear ?? null,
            registeredCapital: data.registeredCapital ?? null,
            pastContracts: data.pastContracts ?? [],
            techStacks: data.techStacks ?? [],
            interestedCategories: data.interestedCategories ?? [],
            credentials: data.credentials ?? [],
            teamSize: data.teamSize ?? 1,
            personnel: data.personnel ?? [],
          };
          setProfile(loadedData);
          setInitialProfile(loadedData);
          setIsNew(false);
        } else {
          setInitialProfile({
            companyName: "",
            companyAge: 0,
            foundedYear: null,
            registeredCapital: null,
            pastContracts: [],
            techStacks: [],
            interestedCategories: [],
            credentials: [],
            teamSize: 1,
            personnel: [],
          });
        }
      } catch {
        setInitialProfile({
          companyName: "",
          companyAge: 0,
          foundedYear: null,
          registeredCapital: null,
          pastContracts: [],
          techStacks: [],
          interestedCategories: [],
          credentials: [],
          teamSize: 1,
          personnel: [],
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

  const topRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    setMessage(null);
    if (!profile.companyName.trim()) {
      setMessage({ type: "error", text: "กรุณากรอกชื่อบริษัท" });
      return;
    }
    if (profile.pastContracts.some((contract) => !contract.description.trim() || contract.value <= 0 || contract.year <= 0)) {
      setMessage({ type: "error", text: "กรุณากรอกรายละเอียด มูลค่า และปีของผลงานให้ครบ" });
      return;
    }
    if (profile.personnel.some((person) => !person.role.trim() || person.count <= 0)) {
      setMessage({ type: "error", text: "กรุณากรอกตำแหน่งและจำนวนบุคลากรให้ครบ" });
      return;
    }
    if (profile.credentials.some((credential) => !credential.name.trim())) {
      setMessage({ type: "error", text: "กรุณากรอกชื่อใบรับรองให้ครบ" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/profile`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(profile),
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
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    }
  };

  const addTech = () => {
    if (newTech.trim() && !profile.techStacks.includes(newTech.trim())) {
      setProfile((p) => ({ ...p, techStacks: [...p.techStacks, newTech.trim()] }));
      setNewTech("");
    }
  };

  const toggleTech = (tech: string) => {
    setProfile((p) => {
      const exists = p.techStacks.includes(tech);
      return {
        ...p,
        techStacks: exists
          ? p.techStacks.filter((t) => t !== tech)
          : [...p.techStacks, tech],
      };
    });
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

  const addCredential = () => {
    const trimmedName = newCertName.trim();
    if (!trimmedName) return;
    if (profile.credentials.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) return;

    setProfile((p) => ({
      ...p,
      credentials: [
        ...p.credentials,
        {
          name: trimmedName,
          ...(newCertIssuer.trim() ? { issuedBy: newCertIssuer.trim() } : {}),
        },
      ],
    }));
    setNewCertName("");
    setNewCertIssuer("");
  };

  const removeCredential = (name: string) => {
    setProfile((p) => ({
      ...p,
      credentials: p.credentials.filter((c) => c.name.toLowerCase() !== name.toLowerCase()),
    }));
  };

  const toggleCredential = (certName: string) => {
    setProfile((p) => {
      const exists = p.credentials.some((c) => c.name.toLowerCase() === certName.toLowerCase());
      return {
        ...p,
        credentials: exists
          ? p.credentials.filter((c) => c.name.toLowerCase() !== certName.toLowerCase())
          : [...p.credentials, { name: certName }],
      };
    });
  };

  return (
    <div ref={topRef} className="space-y-6 max-w-4xl mx-auto w-full animate-fade-in">
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
              label="ปีที่ก่อตั้ง (ค.ศ.)"
              type="number"
              value={profile.foundedYear ?? ""}
              onChange={(e) => {
                const foundedYear = e.target.value ? Number(e.target.value) : null;
                setProfile({
                  ...profile,
                  foundedYear,
                  companyAge: foundedYear ? Math.max(0, new Date().getFullYear() - foundedYear) : profile.companyAge,
                });
              }}
              fullWidth
              size="small"
            />
            <TextField
              label="ทุนจดทะเบียน (บาท)"
              type="number"
              value={profile.registeredCapital ?? ""}
              onChange={(e) => setProfile({ ...profile, registeredCapital: e.target.value ? Number(e.target.value) : null })}
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

      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">ผลงานที่ผ่านมา</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                ใช้เทียบประเภทงาน มูลค่า และความใหม่ของประสบการณ์
              </p>
            </div>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setProfile((current) => ({
                ...current,
                pastContracts: [...current.pastContracts, { description: "", value: 0, year: new Date().getFullYear(), agencyName: "", agencyType: "unknown" }],
              }))}
            >
              เพิ่มผลงาน
            </Button>
          </div>
          <div className="space-y-4">
            {profile.pastContracts.map((contract, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField
                    label="รายละเอียดผลงาน"
                    value={contract.description}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      pastContracts: current.pastContracts.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item),
                    }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="หน่วยงาน/ลูกค้า"
                    value={contract.agencyName ?? ""}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      pastContracts: current.pastContracts.map((item, itemIndex) => itemIndex === index ? { ...item, agencyName: e.target.value } : item),
                    }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="มูลค่าสัญญา (บาท)"
                    type="number"
                    value={contract.value}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      pastContracts: current.pastContracts.map((item, itemIndex) => itemIndex === index ? { ...item, value: Number(e.target.value) } : item),
                    }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="ปีที่ส่งมอบ (ค.ศ.)"
                    type="number"
                    value={contract.year}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      pastContracts: current.pastContracts.map((item, itemIndex) => itemIndex === index ? { ...item, year: Number(e.target.value) } : item),
                    }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    label="ประเภทหน่วยงาน"
                    value={contract.agencyType ?? "unknown"}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      pastContracts: current.pastContracts.map((item, itemIndex) => itemIndex === index ? { ...item, agencyType: e.target.value as PastContract["agencyType"] } : item),
                    }))}
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="unknown">ยังไม่ระบุ</MenuItem>
                    <MenuItem value="government">หน่วยงานรัฐ/รัฐวิสาหกิจ</MenuItem>
                    <MenuItem value="private">เอกชน</MenuItem>
                  </TextField>
                </div>
                <Button
                  color="error"
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() => setProfile((current) => ({
                    ...current,
                    pastContracts: current.pastContracts.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                >
                  ลบผลงานนี้
                </Button>
              </div>
            ))}
            {!profile.pastContracts.length && <p className="text-sm text-slate-500">ยังไม่มีข้อมูลผลงาน คะแนนหมวดประสบการณ์จะแสดงว่าข้อมูลไม่ครบ</p>}
          </div>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">บุคลากรหลัก</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">กรอกชื่อตำแหน่งให้ใกล้กับคำที่ใช้ใน TOR เช่น Project Manager หรือ System Analyst</p>
            </div>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setProfile((current) => ({
                ...current,
                personnel: [...current.personnel, { role: "", count: 1, certifications: [] }],
              }))}
            >
              เพิ่มตำแหน่ง
            </Button>
          </div>
          <div className="space-y-4">
            {profile.personnel.map((person, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr]">
                  <TextField
                    label="ตำแหน่ง"
                    value={person.role}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      personnel: current.personnel.map((item, itemIndex) => itemIndex === index ? { ...item, role: e.target.value } : item),
                    }))}
                    size="small"
                  />
                  <TextField
                    label="จำนวนคน"
                    type="number"
                    value={person.count}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      personnel: current.personnel.map((item, itemIndex) => itemIndex === index ? { ...item, count: Number(e.target.value) } : item),
                    }))}
                    size="small"
                  />
                  <TextField
                    label="ใบรับรอง (คั่นด้วยจุลภาค)"
                    value={person.certifications.join(", ")}
                    onChange={(e) => setProfile((current) => ({
                      ...current,
                      personnel: current.personnel.map((item, itemIndex) => itemIndex === index ? {
                        ...item,
                        certifications: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                      } : item),
                    }))}
                    size="small"
                  />
                </div>
                <Button
                  color="error"
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() => setProfile((current) => ({
                    ...current,
                    personnel: current.personnel.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                >
                  ลบตำแหน่งนี้
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">ใบรับรองบริษัท</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">ใบรับรองที่หมดอายุจะไม่นับว่าผ่าน</p>
            </div>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setProfile((current) => ({
                ...current,
                credentials: [...current.credentials, { name: "", issuedBy: "", expiresAt: "" }],
              }))}
            >
              เพิ่มใบรับรอง
            </Button>
          </div>
          <div className="space-y-4">
            {profile.credentials.map((credential, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField label="ชื่อใบรับรอง" value={credential.name} onChange={(e) => setProfile((current) => ({ ...current, credentials: current.credentials.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item) }))} size="small" />
                  <TextField label="ออกโดย" value={credential.issuedBy ?? ""} onChange={(e) => setProfile((current) => ({ ...current, credentials: current.credentials.map((item, itemIndex) => itemIndex === index ? { ...item, issuedBy: e.target.value } : item) }))} size="small" />
                  <TextField label="วันหมดอายุ" type="date" value={credential.expiresAt?.slice(0, 10) ?? ""} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => setProfile((current) => ({ ...current, credentials: current.credentials.map((item, itemIndex) => itemIndex === index ? { ...item, expiresAt: e.target.value } : item) }))} size="small" />
                </div>
                <Button color="error" size="small" sx={{ mt: 1 }} onClick={() => setProfile((current) => ({ ...current, credentials: current.credentials.filter((_, itemIndex) => itemIndex !== index) }))}>ลบใบรับรองนี้</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tech Stacks */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">เทคโนโลยี</h2>
            <span className="text-xs text-[var(--color-text-secondary)]">
              เลือกแล้ว {profile.techStacks.length} รายการ
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            เลือกเทคโนโลยี ภาษาโปรแกรม เฟรมเวิร์ก หรือเครื่องมือที่ทีมของคุณเชี่ยวชาญเพื่อช่วยจับคู่กับ TOR
          </p>

          {/* Quick Select Presets */}
          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              เลือกจากเทคโนโลยียอดนิยม (คลิกเพื่อเลือก / ยกเลิก):
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TECH_STACKS.map((tech) => {
                const isSelected = profile.techStacks.includes(tech);
                return (
                  <Chip
                    key={tech}
                    label={tech}
                    clickable
                    color={isSelected ? "primary" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    icon={isSelected ? <CheckIcon fontSize="small" /> : undefined}
                    onClick={() => toggleTech(tech)}
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

          {/* Selected Techs */}
          {profile.techStacks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                รายการที่เลือกไว้:
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.techStacks.map((tech) => (
                  <Chip
                    key={tech}
                    label={tech}
                    color="primary"
                    variant="filled"
                    onDelete={() =>
                      setProfile((p) => ({
                        ...p,
                        techStacks: p.techStacks.filter((t) => t !== tech),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Input */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              หรือพิมพ์เพิ่มเทคโนโลยีอื่น ๆ:
            </p>
            <div className="flex gap-2">
              <TextField
                placeholder="พิมพ์เพิ่มเทคโนโลยี (เช่น Rust, GraphQL)..."
                value={newTech}
                onChange={(e) => setNewTech(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTech())}
                size="small"
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" onClick={addTech} startIcon={<AddIcon />}>
                เพิ่ม
              </Button>
            </div>
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

      {/* Certifications and Standards */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">มาตรฐานและใบรับรอง</h2>
            <span className="text-xs text-[var(--color-text-secondary)]">
              เลือกแล้ว {profile.credentials.length} รายการ
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            เลือกหรือระบุมาตรฐานและใบรับรองขององค์กร (เช่น ISO, CMMI หรือหนังสือรับรองต่าง ๆ) เพื่อใช้จับคู่คุณสมบัติกับ TOR
          </p>

          {/* Quick Select Presets */}
          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              เลือกจากมาตรฐานยอดนิยมใน TOR ภาครัฐ (คลิกเพื่อเลือก / ยกเลิก):
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_CREDENTIALS.map((cert) => {
                const isSelected = profile.credentials.some(
                  (c) => c.name.toLowerCase() === cert.toLowerCase()
                );
                return (
                  <Chip
                    key={cert}
                    label={cert}
                    clickable
                    color={isSelected ? "primary" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    icon={isSelected ? <CheckIcon fontSize="small" /> : undefined}
                    onClick={() => toggleCredential(cert)}
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

          {/* Selected Credentials */}
          {profile.credentials.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                รายการที่เลือกไว้:
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.credentials.map((cred, idx) => (
                  <Chip
                    key={`${cred.name}-${idx}`}
                    label={cred.issuedBy ? `${cred.name} (${cred.issuedBy})` : cred.name}
                    color="primary"
                    variant="filled"
                    onDelete={() => removeCredential(cred.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Input */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              หรือพิมพ์เพิ่มมาตรฐาน / ใบรับรองอื่น ๆ:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <TextField
                placeholder="ชื่อมาตรฐาน / ใบรับรอง (เช่น ISO 22301, CISSP)..."
                value={newCertName}
                onChange={(e) => setNewCertName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCredential())}
                size="small"
                sx={{ flex: 2 }}
              />
              <TextField
                placeholder="หน่วยงานที่ออก เช่น BSI, depa (ไม่บังคับ)..."
                value={newCertIssuer}
                onChange={(e) => setNewCertIssuer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCredential())}
                size="small"
                sx={{ flex: 1.5 }}
              />
              <Button variant="outlined" onClick={addCredential} startIcon={<AddIcon />} sx={{ whiteSpace: "nowrap" }}>
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
