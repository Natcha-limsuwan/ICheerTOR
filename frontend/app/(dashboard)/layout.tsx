import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import AuthGuard from "@/components/auth/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
    <div className="min-h-screen bg-[var(--color-background)]">
      <TopBar />
      <div className="flex min-w-0">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
    </AuthGuard>
  );
}
