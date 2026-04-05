import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { NotificationBell } from "@/components/NotificationBell";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (isMobile) {
    return (
      <ProtectedRoute>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            background: isDark ? "hsl(188,35%,7%)" : "#dde8ea",
            position: "relative",
            transition: "background 0.3s ease",
          }}
        >
          {/* Floating notification bell — vlevo od dark mode toggleu */}
          <div
            style={{
              position: "fixed",
              top: "max(14px, calc(env(safe-area-inset-top, 0px) + 10px))",
              right: 62,
              zIndex: 30,
            }}
          >
            <NotificationBell />
          </div>

          {/* Floating dark mode toggle — pravý horní roh */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? "Světlý režim" : "Tmavý režim"}
            style={{
              position: "fixed",
              top: "max(14px, calc(env(safe-area-inset-top, 0px) + 10px))",
              right: 16,
              zIndex: 30,
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,85,95,0.15)",
              background: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.65)",
              backdropFilter: "blur(16px) saturate(1.8)",
              WebkitBackdropFilter: "blur(16px) saturate(1.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: isDark
                ? "0 2px 12px rgba(0,0,0,0.4)"
                : "0 2px 12px rgba(0,85,95,0.15)",
              transition: "all 0.25s ease",
            }}
          >
            {isDark ? (
              <Sun size={17} color="#f5c842" />
            ) : (
              <Moon size={17} color="#00555f" />
            )}
          </button>

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
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute top-4 right-6 lg:right-8 z-10">
              <NotificationBell />
            </div>
            <main className="flex-1 p-6 lg:p-8 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
