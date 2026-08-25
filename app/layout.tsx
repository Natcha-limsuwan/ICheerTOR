import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import muiTheme from "@/lib/theme/mui-theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "I Cheer TOR — Bangkok Software Procurement Tracker",
  description:
    "AI-powered civic-technology platform for monitoring BMA software procurement. Discover, parse, and analyze Terms of Reference documents.",
  keywords: [
    "procurement",
    "TOR",
    "Bangkok",
    "BMA",
    "software",
    "civic-tech",
    "จัดซื้อจัดจ้าง",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={inter.variable}>
      <body className="antialiased bg-background text-foreground">
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={muiTheme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
