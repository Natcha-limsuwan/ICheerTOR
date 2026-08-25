"use client";

import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";

interface ConfidenceBadgeProps {
  confidence: number;
  showLabel?: boolean;
}

export default function ConfidenceBadge({
  confidence,
  showLabel = true,
}: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);

  let level: "high" | "medium" | "low";
  let color: string;
  let bgColor: string;
  let label: string;
  let Icon: typeof CheckCircleOutlinedIcon;

  if (confidence >= 0.8) {
    level = "high";
    color = "#166534";
    bgColor = "#E8F8ED";
    label = "ความเชื่อมั่นสูง";
    Icon = CheckCircleOutlinedIcon;
  } else if (confidence >= 0.6) {
    level = "medium";
    color = "#92400E";
    bgColor = "#FFF8EB";
    label = "ความเชื่อมั่นปานกลาง";
    Icon = WarningAmberIcon;
  } else {
    level = "low";
    color = "#991B1B";
    bgColor = "#FEF2F2";
    label = "ความเชื่อมั่นต่ำ — กรุณาตรวจสอบ";
    Icon = ErrorOutlinedIcon;
  }

  return (
    <Tooltip title={`${label} (${pct}%)`} arrow>
      <Chip
        icon={<Icon sx={{ fontSize: 14, color: `${color} !important` }} />}
        label={showLabel ? `${pct}%` : undefined}
        size="small"
        sx={{
          backgroundColor: bgColor,
          color,
          fontWeight: 600,
          fontSize: "0.7rem",
          height: 22,
          "& .MuiChip-icon": { marginLeft: showLabel ? "4px" : "0" },
        }}
        className={`confidence-${level}`}
      />
    </Tooltip>
  );
}
