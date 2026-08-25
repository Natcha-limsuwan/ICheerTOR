import AuthProvider from "@/components/providers/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[var(--color-background)]">
        <TopBar />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 max-w-[1440px] mx-auto w-full">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
