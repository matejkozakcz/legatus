import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <ProtectedRoute>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            background: "#dde8ea",
            position: "relative",
          }}
        >
          <main
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              paddingBottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center border-b border-border bg-card px-4 lg:hidden">
              <SidebarTrigger />
            </header>
            <main className="flex-1 p-6 lg:p-8 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
