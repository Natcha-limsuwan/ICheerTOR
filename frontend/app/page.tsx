"use client";

import Link from "next/link";
import RadarIcon from "@mui/icons-material/Radar";
import LanguageIcon from "@mui/icons-material/Language";
import PsychologyIcon from "@mui/icons-material/Psychology";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RuleIcon from "@mui/icons-material/Rule";
import FlagIcon from "@mui/icons-material/Flag";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)]">
      {/* ── Top Navigation Bar ── */}
      <nav className="bg-white sticky top-0 z-50 border-b border-[var(--color-border)] shadow-sm">
        <div className="flex justify-between items-center h-16 px-6 max-w-[1440px] mx-auto">
          <div className="flex items-center gap-2">
            <RadarIcon sx={{ color: "var(--color-primary)" }} />
            <span className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
              iCheerTOR
            </span>
          </div>
          <div>
            <Link
              href="/login"
              className="inline-block px-6 py-2 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90"
              style={{ background: "var(--color-primary)" }}
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-24 px-6 max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-6 animate-fade-in">
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-[var(--color-text-primary)]">
              ไม่พลาดโครงการซอฟต์แวร์ของรัฐบาลกรุงเทพฯ อีกต่อไป
            </h1>
            <p className="text-lg text-[var(--color-text-secondary)] max-w-xl">
              เรารวบรวมข้อมูลจากพอร์ทัล กทม. วิเคราะห์ TOR ที่ซับซ้อนด้วย AI
              และจับคู่โอกาสให้ตรงกับโปรไฟล์ทีมของคุณ
            </p>
            <div className="flex flex-col gap-3 mt-4">
              <Link
                href="/login"
                className="bg-white border border-[var(--color-border)] rounded-lg py-3 px-6 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors w-fit text-[var(--color-text-primary)] font-medium"
              >
                <img
                  alt="Google Logo"
                  className="w-5 h-5"
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                />
                ดำเนินการต่อด้วย Google
              </Link>
              <span className="text-xs text-[var(--color-text-secondary)]">
                เข้าร่วมฟรี · ไม่ต้องใช้บัตรเครดิต
              </span>
            </div>
          </div>

          {/* Hero Visual Card */}
          <div className="relative w-full aspect-video rounded-xl bg-[#e8eeff] shadow-md border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 to-blue-900/10" />
            <div className="relative z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-5 w-full max-w-sm flex flex-col gap-4 transform rotate-1 hover:rotate-0 transition-transform duration-300">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-[var(--color-text-primary)]">
                  แพลตฟอร์มข้อมูลเมืองอัจฉริยะ
                </h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                  <CheckCircleIcon sx={{ fontSize: 14 }} />
                  ตรงกัน 95%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    งบประมาณ
                  </span>
                  <span className="text-sm font-semibold">฿5,000,000</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    กำหนดการ
                  </span>
                  <span className="text-sm font-semibold">15 พ.ย. 2569</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                <div
                  className="h-2 rounded-full"
                  style={{ width: "95%", background: "var(--color-primary)" }}
                />
              </div>
            </div>
            {/* Decorative flag */}
            <div className="absolute top-4 right-4 bg-red-50 text-red-600 p-2 rounded-full shadow-sm animate-pulse">
              <FlagIcon />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-[#f1f3ff] px-6 border-y border-[var(--color-border)]">
          <div className="max-w-[1440px] mx-auto text-center">
            <h2 className="text-3xl font-bold mb-12">วิธีการทำงาน</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: <LanguageIcon sx={{ fontSize: 32 }} />,
                  title: "1. รวบรวมข้อมูล",
                  desc: "เรารวบรวม TOR จากพอร์ทัล กทม. ทุกวัน เพื่อให้คุณไม่พลาดประกาศใหม่ๆ",
                },
                {
                  icon: <PsychologyIcon sx={{ fontSize: 32 }} />,
                  title: "2. วิเคราะห์",
                  desc: "AI วิเคราะห์เอกสารที่ซับซ้อนและจับคู่โอกาสให้ตรงกับความสามารถในโปรไฟล์ของคุณ",
                },
                {
                  icon: <NotificationsActiveIcon sx={{ fontSize: 32 }} />,
                  title: "3. แจ้งเตือน",
                  desc: "รับการแจ้งเตือนเมื่อมีโอกาสที่ตรงกับคุณมากก่อนถึงกำหนดเวลา",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="card p-8 flex flex-col items-center gap-4 text-center"
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
                    style={{
                      backgroundColor: "rgba(0, 71, 171, 0.1)",
                      color: "var(--color-primary)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Strip */}
        <section className="py-12 gradient-primary text-white">
          <div className="max-w-[1440px] mx-auto px-6 flex flex-wrap justify-center md:justify-between items-center gap-6">
            {[
              { icon: <AutoAwesomeIcon />, label: "การรวบรวมข้อมูลอัตโนมัติ" },
              { icon: <PsychologyIcon />, label: "การวิเคราะห์ด้วย AI" },
              { icon: <RuleIcon />, label: "การจับคู่คุณสมบัติ" },
              { icon: <FlagIcon />, label: "การตรวจจับความผิดปกติ" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.icon}
                <span className="text-xs uppercase tracking-wider font-medium">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 text-[var(--color-text-secondary)] text-sm py-12 border-t border-[var(--color-border)]">
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2" style={{ color: "var(--color-primary)" }}>
            <RadarIcon />
            <span className="font-bold">iCheerTOR</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-[var(--color-primary)] hover:underline transition-all">
              เกี่ยวกับ
            </a>
            <a href="#" className="hover:text-[var(--color-primary)] hover:underline transition-all">
              ติดต่อ
            </a>
            <a href="#" className="hover:text-[var(--color-primary)] hover:underline transition-all">
              นโยบายความเป็นส่วนตัว
            </a>
          </div>
          <div>© 2026 ระบบติดตามการจัดซื้อซอฟต์แวร์กรุงเทพมหานคร ส่งเสริมความโปร่งใส</div>
        </div>
      </footer>
    </div>
  );
}
