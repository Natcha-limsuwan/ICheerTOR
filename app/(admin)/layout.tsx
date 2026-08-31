import AuthProvider from "@/components/providers/AuthProvider";
import AdminGuard from "@/components/auth/AdminGuard";
import AdminSidebar from "@/components/layout/AdminSidebar";
import TopBar from "@/components/layout/TopBar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminGuard>
        <div className="min-h-screen bg-[var(--color-background)]">
          <TopBar />
          <div className="flex">
            <AdminSidebar />
            <main className="flex-1 p-6 max-w-[1440px] mx-auto w-full">
              {children}
            </main>
          </div>
        </div>
      </AdminGuard>
    </AuthProvider>
  );
}
