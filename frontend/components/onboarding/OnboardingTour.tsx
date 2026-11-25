"use client";

/**
 * Guided tour for people opening I Cheer TOR for the first time.
 *
 * Why a tour at all: the useful parts of this product are not on the page
 * someone lands on. Matching only works once a vendor profile exists, and
 * alerts only fire once a search is saved — so a new user who is shown only
 * the procurement list sees a table of government notices and no reason to
 * come back. The tour's job is to make those two steps visible once.
 *
 * It runs by itself, on the first visit, rather than hiding behind a button
 * nobody presses.
 *
 * Design notes:
 * - Steps whose target is missing are skipped rather than pointing at
 *   nothing. The sidebar is `hidden md:flex`, so on a phone most targets do
 *   not exist and the tour becomes a short intro instead of breaking.
 * - The highlight is drawn with four dimmed panels around the target, so the
 *   target keeps its own styling and stays readable. A single overlay with a
 *   cut-out would need the target re-stacked above it.
 * - Completion is stored per user on the server (see /api/auth/onboarding),
 *   with localStorage only as an offline fallback — if the save fails the
 *   tour must not reappear on every page load.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { api } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { TOUR_ID, TOUR_STEPS, type TourStep } from "@/lib/onboarding/tour-steps";
import { TOUR_RESTART_EVENT } from "@/lib/onboarding/restart";

/** Mirrors the tour id in localStorage when the server call fails. */
const LOCAL_KEY = `icheertor_tour_${TOUR_ID}`;
/** Gap between the highlighted element and the tooltip. */
const GAP = 12;
/** Keeps the tooltip clear of the viewport edge. */
const MARGIN = 16;
const TOOLTIP_W = 340;

/** No external store to watch — the snapshot alone distinguishes server from client. */
function subscribeNoop(): () => void {
  return () => {};
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Placement = "top" | "bottom" | "left" | "right" | "center";

function readLocalDone(): boolean {
  try {
    return localStorage.getItem(LOCAL_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw here; treat as not done.
    return false;
  }
}

function writeLocalDone(): void {
  try {
    localStorage.setItem(LOCAL_KEY, "1");
  } catch {
    /* Nothing to do — the server copy is the real record. */
  }
}

/** Where the tooltip sits for a step, given the room actually available. */
function resolvePlacement(step: TourStep, rect: Rect | null): Placement {
  if (!rect) return "center";
  const preferred = step.placement ?? "bottom";
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const fits: Record<Exclude<Placement, "center">, boolean> = {
    bottom: vh - (rect.top + rect.height) > 220,
    top: rect.top > 220,
    right: vw - (rect.left + rect.width) > TOOLTIP_W + GAP * 2,
    left: rect.left > TOOLTIP_W + GAP * 2,
  };

  if (preferred !== "center" && fits[preferred]) return preferred;
  // Fall back in a fixed order so the tooltip never lands off-screen.
  return (["bottom", "top", "right", "left"] as const).find((p) => fits[p]) ?? "center";
}

export default function OnboardingTour() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  /** Guards against starting the tour twice in React's dev double-render. */
  const startedRef = useRef(false);
  /** False while server-rendering, where document does not exist. */
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  /* ─── Decide whether to run ──────────────────────────────────────── */

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      if (readLocalDone()) return;
      try {
        const res = await api.get<{ completedTours: string[] }>("/auth/onboarding");
        if (cancelled) return;
        if (res.data.completedTours?.includes(TOUR_ID)) {
          // Finished on another device — remember locally too.
          writeLocalDone();
          return;
        }
      } catch {
        // The endpoint may be unreachable or predate this feature. Showing
        // the tour once is a smaller cost than never showing it at all,
        // and localStorage still stops it repeating in this browser.
      }
      if (!cancelled) setActive(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* ─── Replay on request ──────────────────────────────────────────── */

  useEffect(() => {
    const onRestart = () => {
      setIndex(0);
      setActive(true);
    };
    window.addEventListener(TOUR_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, onRestart);
  }, []);

  /* ─── Track the current target ───────────────────────────────────── */

  const steps = TOUR_STEPS;
  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // An element can exist but be collapsed (a hidden sidebar); treat that
    // as absent so the step centres instead of highlighting nothing.
    if (r.width === 0 && r.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    // Reading the target's geometry is exactly the "synchronise with an
    // external system" case the rule allows: the DOM owns the position, and
    // the overlay has to be placed before paint or it flashes in the wrong
    // spot. The same measure() is the subscription callback below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  /* ─── Finish ─────────────────────────────────────────────────────── */

  const finish = useCallback(async () => {
    setActive(false);
    writeLocalDone();
    try {
      await api.post("/auth/onboarding/complete", { tourId: TOUR_ID });
    } catch {
      // The local flag already stops it reappearing in this browser.
    }
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= steps.length - 1) {
        void finish();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /* ─── Keyboard ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, next, back]);

  if (!mounted || !active || !step) return null;

  const placement = resolvePlacement(step, rect);
  const isLast = index === steps.length - 1;

  /* ─── Tooltip position ───────────────────────────────────────────── */

  const tip: React.CSSProperties = { width: TOOLTIP_W, maxWidth: `calc(100vw - ${MARGIN * 2}px)` };
  if (!rect || placement === "center") {
    Object.assign(tip, {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    });
  } else {
    const clampL = (l: number) =>
      Math.min(Math.max(MARGIN, l), Math.max(MARGIN, window.innerWidth - TOOLTIP_W - MARGIN));
    if (placement === "bottom") {
      Object.assign(tip, {
        top: rect.top + rect.height + GAP,
        left: clampL(rect.left + rect.width / 2 - TOOLTIP_W / 2),
      });
    } else if (placement === "top") {
      Object.assign(tip, {
        top: rect.top - GAP,
        left: clampL(rect.left + rect.width / 2 - TOOLTIP_W / 2),
        transform: "translateY(-100%)",
      });
    } else if (placement === "right") {
      Object.assign(tip, { top: Math.max(MARGIN, rect.top), left: rect.left + rect.width + GAP });
    } else {
      Object.assign(tip, { top: Math.max(MARGIN, rect.top), left: rect.left - GAP, transform: "translateX(-100%)" });
    }
  }

  /* ─── Dim panels around the target ───────────────────────────────── */

  const dim = "fixed bg-black/55 transition-all duration-200";
  const panels = rect ? (
    <>
      <div className={dim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - 4) }} />
      <div className={dim} style={{ top: rect.top + rect.height + 4, left: 0, right: 0, bottom: 0 }} />
      <div
        className={dim}
        style={{ top: rect.top - 4, left: 0, width: Math.max(0, rect.left - 4), height: rect.height + 8 }}
      />
      <div
        className={dim}
        style={{ top: rect.top - 4, left: rect.left + rect.width + 4, right: 0, height: rect.height + 8 }}
      />
      <div
        className="fixed rounded-lg ring-2 ring-[var(--color-primary)] pointer-events-none transition-all duration-200"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
    </>
  ) : (
    <div className={`${dim} inset-0`} />
  );

  return createPortal(
    // Above the sticky TopBar (z-40) and MUI's modal layer baseline.
    <div className="fixed inset-0 z-[1300]" role="dialog" aria-modal="true" aria-label={step.title}>
      {panels}

      <div
        className="fixed rounded-xl bg-white shadow-2xl p-5"
        style={tip}
        // Clicks inside must not reach the dimmed backdrop behind it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] m-0">{step.title}</h2>
          <IconButton size="small" onClick={() => void finish()} aria-label="ปิดคำแนะนำ" sx={{ mt: "-4px", mr: "-6px" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] m-0">{step.body}</p>

        {step.hint ? (
          <p className="mt-2 mb-0 text-xs text-[var(--color-text-secondary)] bg-blue-50 rounded-md px-3 py-2">
            {step.hint}
          </p>
        ) : null}

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-[var(--color-primary)]" : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            {index > 0 ? (
              <Button size="small" onClick={back} startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
                ย้อนกลับ
              </Button>
            ) : (
              <Button size="small" onClick={() => void finish()} sx={{ color: "var(--color-text-secondary)" }}>
                ข้าม
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              onClick={next}
              endIcon={isLast ? undefined : <ArrowForwardIcon sx={{ fontSize: 16 }} />}
            >
              {isLast ? "เริ่มใช้งาน" : "ถัดไป"}
            </Button>
          </div>
        </div>

        <p className="mt-3 mb-0 text-[11px] text-[var(--color-text-secondary)] text-center">
          {index + 1} จาก {steps.length} · กด Esc เพื่อปิด
        </p>
      </div>
    </div>,
    document.body,
  );
}
