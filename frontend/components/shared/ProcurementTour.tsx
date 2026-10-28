"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import CloseIcon from "@mui/icons-material/Close";

const steps = [
  { target: "account-menu", title: "กรอกโปรไฟล์เพื่อประเมินความเหมาะสม", description: "แนะนำให้กรอกข้อมูลบริษัท ผลงาน และเทคโนโลยีที่เมนูรูปผู้ใช้ > โปรไฟล์ เพื่อให้ระบบช่วยประเมินความเหมาะสมกับ TOR ส่วนการค้นหาโครงการสามารถใช้ได้ทันที แม้ยังไม่ได้กรอกโปรไฟล์" },
  { target: "tor-search", title: "ค้นหาด้วยคำที่สนใจ", description: "พิมพ์ชื่อโครงการ หน่วยงาน เลขโครงการ หรือเทคโนโลยี ก็เริ่มค้นหาได้เลย โดยไม่ต้องเลือกตัวกรองเพิ่มเติม รองรับคำใกล้เคียงไทย–อังกฤษ เช่น เว็บไซต์ กับ website และเว้นวรรคเพื่อค้นหลายคำพร้อมกัน" },
  { target: "tor-filters", title: "ตัวเลือกเสริม: ขั้นตอนและสถานะ", description: "หากอยากจำกัดผลลัพธ์ เลือกเฉพาะขั้นตอนหรือสถานะที่สนใจได้ เช่น โครงการที่กำลังเสนอราคา จะใช้ตัวกรองอย่างเดียวหรือใช้ร่วมกับคำค้นก็ได้ และเลือกเรียงผลลัพธ์ได้ตามต้องการ" },
  { target: "tor-price", title: "ตัวเลือกเสริม: ช่วงราคา", description: "หากมีช่วงราคาที่สนใจ กรอกราคากลางต่ำสุดหรือสูงสุดอย่างใดอย่างหนึ่ง หรือทั้งสองช่องได้ ใช้กรองราคาอย่างเดียวก็ได้ และปล่อยว่างเพื่อดูทุกช่วงราคา" },
  { target: "tor-examples", title: "ทางลัด: กดคำตัวอย่างแทนการพิมพ์", description: "กดคำตัวอย่าง เช่น เว็บไซต์ บำรุงรักษา หรือคลาวด์ เพื่อค้นหาได้ทันที เป็นอีกวิธีหนึ่งสำหรับเริ่มค้นหา และเลือกเพิ่มตัวกรองได้ตามต้องการ" },
  { target: "tor-results", title: "เปิดดูรายละเอียดโครงการ", description: "ผลค้นหาจะแสดงด้านล่าง กดการ์ดโครงการเพื่ออ่านรายละเอียด TOR คุณสมบัติ และกำหนดส่ง หากไม่พบรายการ ลองลดคำค้นหรือปรับตัวกรองให้กว้างขึ้น" },
];

type TargetRect = { top: number; left: number; width: number; height: number; viewportWidth: number; viewportHeight: number };

export default function ProcurementTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [panelHeight, setPanelHeight] = useState(280);
  const panelRef = useRef<HTMLDivElement>(null);
  const current = steps[step];
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = target?.getBoundingClientRect();
        setRect(bounds ? {
          top: Math.max(8, bounds.top - 6), left: Math.max(8, bounds.left - 6),
          width: Math.min(bounds.width + 12, window.innerWidth - 16),
          height: Math.max(0, Math.min(bounds.bottom + 6, window.innerHeight - 8) - Math.max(8, bounds.top - 6)),
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        } : null);
        if (panelRef.current) setPanelHeight(panelRef.current.getBoundingClientRect().height);
      });
    };
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, current]);

  const panelWidth = rect ? Math.min(420, rect.viewportWidth - 32) : 420;
  const panelTop = rect ? Math.max(16, Math.min(
    rect.top + rect.height + panelHeight + 16 < rect.viewportHeight
      ? rect.top + rect.height + 16 : rect.top - panelHeight - 16,
    rect.viewportHeight - panelHeight - 16,
  )) : undefined;

  return (
    <>
      <Button variant="outlined" size="small" startIcon={<HelpOutlineIcon />}
        onClick={() => { setStep(0); setRect(null); setOpen(true); }}>
        สอนการใช้งาน
      </Button>
      <Modal open={open} onClose={close}
        slotProps={{ backdrop: { sx: { backgroundColor: "transparent" } } }}>
        <div role="dialog" aria-modal="true" aria-labelledby="tor-tour-title" aria-describedby="tor-tour-description"
          tabIndex={-1} className="fixed inset-0 outline-none">
          {rect ? (
            <div aria-hidden="true" style={{
              position: "fixed", top: rect.top, left: rect.left, width: rect.width, height: rect.height,
              border: "2px solid #60a5fa", borderRadius: 12, pointerEvents: "none",
              boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
            }} />
          ) : <div aria-hidden="true" className="absolute inset-0 bg-slate-900/65" />}
          <Paper ref={panelRef}
            elevation={12} sx={{
              position: "fixed", p: 3, borderRadius: 3, width: panelWidth, maxWidth: "calc(100vw - 32px)",
              maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
              top: panelTop ?? "50%", left: rect ? Math.max(16, Math.min(rect.left, rect.viewportWidth - panelWidth - 16)) : "50%",
              transform: rect ? undefined : "translate(-50%, -50%)",
            }}>
            <div className="flex items-center justify-between gap-2">
              <p aria-live="polite" className="text-sm text-[var(--color-text-secondary)]">รู้จักส่วนต่าง ๆ · {step + 1}/{steps.length}</p>
              <IconButton size="small" aria-label="ปิดการสอนใช้งาน" onClick={close}><CloseIcon fontSize="small" /></IconButton>
            </div>
            <LinearProgress variant="determinate" value={(step + 1) / steps.length * 100} sx={{ my: 1.5, borderRadius: 2 }} />
            <p className="mb-3 text-sm text-[var(--color-primary)]">เลือกใช้เฉพาะส่วนที่ต้องการ ไม่จำเป็นต้องทำครบทุกส่วน</p>
            <h2 id="tor-tour-title" aria-live="polite" className="text-lg font-bold">{current.title}</h2>
            <p id="tor-tour-description" aria-live="polite" className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{current.description}</p>
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <Button size="small" onClick={close}>ข้ามการสอน</Button>
              <div className="flex gap-2">
                <Button size="small" disabled={step === 0} onClick={() => setStep(step - 1)}>ย้อนกลับ</Button>
                <Button size="small" variant="contained" onClick={() => step === steps.length - 1 ? close() : setStep(step + 1)}>
                  {step === steps.length - 1 ? "เริ่มใช้งาน" : "ดูส่วนถัดไป"}
                </Button>
              </div>
            </div>
          </Paper>
        </div>
      </Modal>
    </>
  );
}
