import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPermissionBanner } from "@/components/NotificationPermissionBanner";
import { SettingsModal } from "@/components/SettingsModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun, Settings } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          {/* Top-right floating buttons: Settings, Bell, Dark mode */}
          <div
            style={{
              position: "fixed",
              top: "max(14px, calc(env(safe-area-inset-top, 0px) + 10px))",
              right: 16,
              zIndex: 30,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <NotificationBell />

            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Nastavení"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,85,95,0.15)",
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
                backdropFilter: "blur(16px) saturate(1.8)",
                WebkitBackdropFilter: "blur(16px) saturate(1.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,85,95,0.15)",
                transition: "all 0.25s ease",
              }}
            >
              <Settings size={17} color={isDark ? "#4dd8e8" : "#00555f"} />
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? "Světlý režim" : "Tmavý režim"}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,85,95,0.15)",
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
                backdropFilter: "blur(16px) saturate(1.8)",
                WebkitBackdropFilter: "blur(16px) saturate(1.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,85,95,0.15)",
                transition: "all 0.25s ease",
              }}
            >
              {isDark ? (
                <Sun size={17} color="#f5c842" />
              ) : (
                <Moon size={17} color="#00555f" />
              )}
            </button>
          </div>

          <main
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              paddingBottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <NotificationPermissionBanner />
            {children}
          </main>
          <MobileBottomNav />
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
            <div className="absolute top-4 right-6 lg:right-8 z-10 flex items-center gap-2">
              <NotificationBell />
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
                aria-label="Nastavení"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <NotificationPermissionBanner />
            <main className="flex-1 p-6 lg:p-8 overflow-auto">
              {children}
            </main>
          </div>
        </div>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </SidebarProvider>
    </ProtectedRoute>
  );
}
