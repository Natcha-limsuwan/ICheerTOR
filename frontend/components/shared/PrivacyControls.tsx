"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { getToken } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";

const NOTICE_VERSION = "2026-11-07";
export default function PrivacyControls({ onConsentChange }: { onConsentChange: (allowed: boolean) => void }) {
  const { user, signOut } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
  const headers = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}/pdpa/consent`, { headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("โหลดสถานะความยินยอมไม่สำเร็จ");
        const json = await response.json();
        if (controller.signal.aborted) return;
        const consent = json.data?.find((item: { _id: string }) => item._id === "data_processing");
        const value = consent?.granted === true && consent.noticeVersion === NOTICE_VERSION;
        setAllowed(value); onConsentChange(value);
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base, onConsentChange]);

  async function consent(granted: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/pdpa/consent`, { method: "POST", headers: headers(),
        body: JSON.stringify({ purpose: "data_processing", granted, noticeVersion: NOTICE_VERSION }) });
      if (!response.ok) throw new Error("บันทึกความยินยอมไม่สำเร็จ กรุณาลองอีกครั้ง");
      setAllowed(granted); setChecked(false); onConsentChange(granted);
    } catch (err) { setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/pdpa/export`, { headers: headers() });
      if (!response.ok) throw new Error("ส่งออกข้อมูลไม่สำเร็จ");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "icheertor-personal-data.json";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }
  async function deleteAccount() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/pdpa/delete`, { method: "POST", headers: headers(), body: JSON.stringify({ confirmEmail }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "ลบบัญชีไม่สำเร็จ");
      setDeleteResult(response.status === 202 ? "ปิดบัญชีแล้ว ระบบกำลังลบข้อมูลที่เหลือต่อโดยอัตโนมัติ" : "ลบบัญชีและข้อมูลที่เกี่ยวข้องแล้ว");
      setAllowed(false); onConsentChange(false);
    } catch (err) { setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="ความเป็นส่วนตัวและข้อมูลของคุณ" className="space-y-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h2 className="text-lg font-semibold">ความเป็นส่วนตัวและข้อมูลของคุณ</h2>
      <p className="text-sm">ระบบสาธิตเพื่อการศึกษา กรุณาใช้ข้อมูลสมมติ · <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">อ่านนโยบายความเป็นส่วนตัว</Link></p>
      {error && <Alert severity="error">{error}</Alert>}
      <p role="status" className="text-sm">{loading ? "กำลังตรวจสอบความยินยอม..." : allowed ? "อนุญาตให้ใช้โปรไฟล์เพื่อประเมิน TOR แล้ว" : "ยังไม่อนุญาตให้ใช้โปรไฟล์เพื่อประเมิน TOR คุณยังค้นหาโครงการ ส่งออกข้อมูล และลบบัญชีได้"}</p>
      {!allowed && <FormControlLabel control={<Checkbox checked={checked} disabled={busy || loading} onChange={event => setChecked(event.target.checked)} />}
        label="ฉันยินยอมให้บันทึกและใช้ข้อมูลโปรไฟล์เพื่อประเมินความเหมาะสมกับ TOR ตามนโยบายฉบับนี้" />}
      <div className="flex flex-wrap gap-2">
        {allowed ? <Button disabled={busy || loading} onClick={() => consent(false)}>ถอนความยินยอม</Button>
          : <Button variant="outlined" disabled={!checked || busy || loading || Boolean(deleteResult)} onClick={() => consent(true)}>ให้ความยินยอม</Button>}
        <Button disabled={busy || Boolean(deleteResult)} onClick={exportData}>ส่งออกข้อมูลของฉัน</Button>
        <Button color="error" disabled={busy || !user || Boolean(deleteResult)} onClick={() => { setConfirmEmail(""); setDeleteOpen(true); }}>ลบบัญชีและข้อมูล</Button>
      </div>
      <Dialog open={deleteOpen} onClose={() => { if (!busy && !deleteResult) setDeleteOpen(false); }} fullWidth maxWidth="sm" aria-labelledby="delete-account-title">
        <DialogTitle id="delete-account-title">ยืนยันลบบัญชีและข้อมูล</DialogTitle>
        <DialogContent>
          {deleteResult ? <Alert severity="success">{deleteResult}</Alert> : <>
            <p className="mb-4 text-sm">บัญชี โปรไฟล์ รายการบันทึก การแจ้งเตือน และข้อมูลส่วนบุคคลที่เกี่ยวข้องจะถูกลบและกู้คืนไม่ได้ กรุณาพิมพ์อีเมลบัญชีของคุณเพื่อยืนยัน</p>
            <TextField label="อีเมลยืนยันการลบบัญชี" value={confirmEmail} onChange={event => setConfirmEmail(event.target.value)} fullWidth autoComplete="off" />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </>}
        </DialogContent>
        <DialogActions>
          {deleteResult ? <Button onClick={signOut}>กลับหน้าแรก</Button> : <>
            <Button disabled={busy} onClick={() => setDeleteOpen(false)}>ยกเลิก</Button>
            <Button color="error" variant="contained" disabled={busy || !confirmEmail || confirmEmail !== user?.email} onClick={deleteAccount}>ยืนยันลบบัญชี</Button>
          </>}
        </DialogActions>
      </Dialog>
    </section>
  );
}
