"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

export type ToastSeverity = "success" | "info" | "warning" | "error";

export interface ToastOptions {
  title?: string;
  duration?: number;
}

interface ToastItem {
  id: string;
  message: string;
  severity: ToastSeverity;
  title?: string;
}

interface ToastContextType {
  showToast: (message: string, severity?: ToastSeverity, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

const severityConfig: Record<
  ToastSeverity,
  {
    title: string;
    borderColor: string;
    iconColor: string;
    iconBg: string;
    icon: React.ReactNode;
  }
> = {
  success: {
    title: "บันทึกข้อมูลเรียบร้อย",
    borderColor: "#16a34a",
    iconColor: "#16a34a",
    iconBg: "#dcfce7",
    icon: <CheckCircleRoundedIcon sx={{ fontSize: 22 }} />,
  },
  info: {
    title: "การแจ้งเตือน",
    borderColor: "#0284c7",
    iconColor: "#0284c7",
    iconBg: "#e0f2fe",
    icon: <InfoRoundedIcon sx={{ fontSize: 22 }} />,
  },
  warning: {
    title: "ข้อควรระวัง",
    borderColor: "#d97706",
    iconColor: "#d97706",
    iconBg: "#fef3c7",
    icon: <WarningAmberRoundedIcon sx={{ fontSize: 22 }} />,
  },
  error: {
    title: "เกิดข้อผิดพลาด",
    borderColor: "#dc2626",
    iconColor: "#dc2626",
    iconBg: "#fee2e2",
    icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 22 }} />,
  },
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = "success", options?: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const duration = options?.duration ?? 4200;

      const newToast: ToastItem = {
        id,
        message,
        severity,
        title: options?.title,
      };

      setToasts((prev) => [...prev.slice(-2), newToast]); // keep max 3 visible

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Window Pop-Up Portal: Mounted directly on document.body at screen bottom-right */}
      {mounted &&
        createPortal(
          <>
            <style>{`
              @keyframes toastSlideInRight {
                0% {
                  opacity: 0;
                  transform: translateY(24px) scale(0.96);
                }
                100% {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }
              .toast-window-popup {
                animation: toastSlideInRight 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
            <div
              id="global-toast-container"
              aria-live="polite"
              style={{
                position: "fixed",
                bottom: "24px",
                right: "24px",
                zIndex: 999999,
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                pointerEvents: "none",
                maxWidth: "400px",
                width: "calc(100vw - 32px)",
                margin: 0,
                padding: 0,
              }}
            >
              {toasts.map((toast) => {
                const conf = severityConfig[toast.severity];
                return (
                  <div
                    key={toast.id}
                    role="alert"
                    className="toast-window-popup"
                    style={{
                      pointerEvents: "auto",
                      backgroundColor: "#ffffff",
                      borderRadius: "14px",
                      border: "1px solid rgba(226, 232, 240, 0.95)",
                      borderLeft: `5px solid ${conf.borderColor}`,
                      boxShadow: "0 18px 40px -6px rgba(15, 23, 42, 0.22), 0 8px 16px -4px rgba(15, 23, 42, 0.12)",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* Icon */}
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        backgroundColor: conf.iconBg,
                        color: conf.iconColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: "1px",
                      }}
                    >
                      {conf.icon}
                    </div>

                    {/* Text Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          margin: "0 0 2px 0",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#0f172a",
                          lineHeight: "1.3",
                        }}
                      >
                        {toast.title ?? conf.title}
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          color: "#475569",
                          lineHeight: "1.45",
                          whiteSpace: "pre-line",
                          wordBreak: "break-word",
                        }}
                      >
                        {toast.message}
                      </p>
                    </div>

                    {/* Close Action */}
                    <button
                      type="button"
                      onClick={() => removeToast(toast.id)}
                      aria-label="ปิดการแจ้งเตือน"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        margin: "-4px -4px 0 0",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#334155";
                        e.currentTarget.style.backgroundColor = "#f1f5f9";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#94a3b8";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 18 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
