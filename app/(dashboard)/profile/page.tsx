"use client";

import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import Alert from "@mui/material/Alert";

interface PastContract {
  description: string;
  value: number;
  year: number;
  agencyName?: string;
}

interface Credential {
  name: string;
  issuedBy?: string;
}

interface ProfileData {
  companyName: string;
  companyAge: number;
  pastContracts: PastContract[];
  techStacks: string[];
  credentials: Credential[];
  teamSize: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    companyName: "",
    companyAge: 0,
    pastContracts: [],
    techStacks: [],
    credentials: [],
    teamSize: 1,
  });
  const [isNew, setIsNew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newTech, setNewTech] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const json = await res.json();
          setProfile(json.data);
          setIsNew(false);
        }
      } catch {
        // No profile yet
      }
    }
    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "บันทึกโปรไฟล์สำเร็จ" });
        setIsNew(false);
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

  const addContract = () => {
    setProfile((p) => ({
      ...p,
      pastContracts: [...p.pastContracts, { description: "", value: 0, year: new Date().getFullYear(), agencyName: "" }],
    }));
  };

  const addTech = () => {
    if (newTech.trim() && !profile.techStacks.includes(newTech.trim())) {
      setProfile((p) => ({ ...p, techStacks: [...p.techStacks, newTech.trim()] }));
      setNewTech("");
    }
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

      {/* Past Contracts */}
      <Card sx={{ borderRadius: "var(--radius-card)" }}>
        <CardContent sx={{ p: 3 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">ผลงานที่ผ่านมา</h2>
            <Button variant="text" onClick={addContract} startIcon={<AddIcon />}>
              เพิ่มผลงาน
            </Button>
          </div>
          <div className="space-y-4">
            {profile.pastContracts.map((contract, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    ผลงาน #{i + 1}
                  </span>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setProfile((p) => ({
                        ...p,
                        pastContracts: p.pastContracts.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TextField
                    label="รายละเอียด"
                    value={contract.description}
                    onChange={(e) => {
                      const updated = [...profile.pastContracts];
                      updated[i] = { ...updated[i], description: e.target.value };
                      setProfile({ ...profile, pastContracts: updated });
                    }}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="มูลค่า (บาท)"
                    type="number"
                    value={contract.value}
                    onChange={(e) => {
                      const updated = [...profile.pastContracts];
                      updated[i] = { ...updated[i], value: Number(e.target.value) };
                      setProfile({ ...profile, pastContracts: updated });
                    }}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="ปี"
                    type="number"
                    value={contract.year}
                    onChange={(e) => {
                      const updated = [...profile.pastContracts];
                      updated[i] = { ...updated[i], year: Number(e.target.value) };
                      setProfile({ ...profile, pastContracts: updated });
                    }}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="หน่วยงาน"
                    value={contract.agencyName ?? ""}
                    onChange={(e) => {
                      const updated = [...profile.pastContracts];
                      updated[i] = { ...updated[i], agencyName: e.target.value };
                      setProfile({ ...profile, pastContracts: updated });
                    }}
                    fullWidth
                    size="small"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
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
            ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล คุณมีสิทธิ์ดูข้อมูล ส่งออก
            และลบบัญชีของคุณ
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              href="/api/pdpa/export"
              size="small"
            >
              ส่งออกข้อมูล
            </Button>
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
    </div>
  );
}
