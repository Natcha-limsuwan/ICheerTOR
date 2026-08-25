"use client";

import { createTheme } from "@mui/material/styles";

/**
 * MUI theme aligned with the DESIGN.md design system.
 *
 * Primary palette: Cobalt Blue #0047AB
 * Typography:      Inter (Google Font)
 * Border radius:   10px cards / 8px inputs
 * Spacing rhythm:  8px grid
 */
const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0047AB",
      light: "#3369BB",
      dark: "#003380",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#F5A623",
      light: "#FFD380",
      dark: "#C17D00",
      contrastText: "#1A1A1A",
    },
    error: {
      main: "#DC3545",
    },
    warning: {
      main: "#F5A623",
    },
    success: {
      main: "#28A745",
    },
    info: {
      main: "#17A2B8",
    },
    background: {
      default: "#F8F9FC",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#64748B",
    },
    divider: "#E2E8F0",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontWeight: 700, fontSize: "2.25rem", lineHeight: 1.2 },
    h2: { fontWeight: 700, fontSize: "1.875rem", lineHeight: 1.25 },
    h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.3 },
    h4: { fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.35 },
    h5: { fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.4 },
    h6: { fontWeight: 600, fontSize: "1rem", lineHeight: 1.5 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.6 },
    body2: { fontSize: "0.875rem", lineHeight: 1.55 },
    button: { fontWeight: 600, textTransform: "none" },
  },
  shape: {
    borderRadius: 10,
  },
  spacing: 8,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "8px 20px",
          boxShadow: "none",
          "&:hover": { boxShadow: "0 2px 8px rgba(0,71,171,0.15)" },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
  },
});

export default muiTheme;
