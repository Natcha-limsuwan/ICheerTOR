"use client";

import Chip from "@mui/material/Chip";

interface PillBadgeProps {
  label: string;
  variant?: "phase" | "status" | "severity" | "confidence";
  value?: string;
}

const colorMap: Record<string, { bg: string; text: string }> = {
  // Phases
  public_hearing: { bg: "#FFF8EB", text: "#92400E" },
  bidding: { bg: "#EBF0FF", text: "#1E40AF" },
  awarded: { bg: "#E8F8ED", text: "#166534" },
  cancelled: { bg: "#FEF2F2", text: "#991B1B" },
  // Status
  eligible: { bg: "#E8F8ED", text: "#166534" },
  ineligible: { bg: "#FEF2F2", text: "#991B1B" },
  partial: { bg: "#FFF8EB", text: "#92400E" },
  // Severity
  critical: { bg: "#FEF2F2", text: "#991B1B" },
  warning: { bg: "#FFF8EB", text: "#92400E" },
  info: { bg: "#EBF0FF", text: "#1E40AF" },
  // Confidence
  high: { bg: "#E8F8ED", text: "#166534" },
  medium: { bg: "#FFF8EB", text: "#92400E" },
  low: { bg: "#FEF2F2", text: "#991B1B" },
  // Default
  default: { bg: "#F1F5F9", text: "#475569" },
};

export default function PillBadge({ label, value }: PillBadgeProps) {
  const key = value ?? "default";
  const colors = colorMap[key] ?? colorMap.default;

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: colors.bg,
        color: colors.text,
        fontWeight: 500,
        fontSize: "0.75rem",
        height: 24,
      }}
    />
  );
}
