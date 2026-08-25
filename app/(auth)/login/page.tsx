"use client";

import { signIn } from "next-auth/react";
import RadarIcon from "@mui/icons-material/Radar";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
      <div className="card p-10 max-w-md w-full mx-4 text-center animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <RadarIcon sx={{ color: "var(--color-primary)", fontSize: 36 }} />
          <span
            className="text-2xl font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            iCheerTOR
          </span>
        </div>

        <h1 className="text-xl font-semibold mb-2">
          เข้าสู่ระบบ
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-8">
          ลงชื่อเข้าใช้เพื่อค้นพบโอกาสจัดซื้อจัดจ้างซอฟต์แวร์
        </p>

        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full bg-white border border-[var(--color-border)] rounded-lg py-3 px-6 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors font-medium"
        >
          <img
            alt="Google Logo"
            className="w-5 h-5"
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          />
          ดำเนินการต่อด้วย Google
        </button>

        <p className="text-xs text-[var(--color-text-secondary)] mt-4">
          เข้าร่วมฟรี · ไม่ต้องใช้บัตรเครดิต
        </p>

        <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-secondary)]">
            การเข้าสู่ระบบแสดงว่าคุณยอมรับ{" "}
            <a href="#" className="text-[var(--color-primary)] hover:underline">
              เงื่อนไขการใช้งาน
            </a>{" "}
            และ{" "}
            <a href="#" className="text-[var(--color-primary)] hover:underline">
              นโยบายความเป็นส่วนตัว
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
