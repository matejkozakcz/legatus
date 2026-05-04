import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  LogOut,
  Briefcase,
  Moon,
  Sun,
  Settings,
  Calendar,
  Search,
  Shield,
  GraduationCap,
  Eye,
  PhoneCall,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUnrecordedMeetings } from "@/hooks/useUnrecordedMeetings";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import legatusLogoWhite from "@/assets/legatus-logo-white.png";
import legatusLogoLight from "@/assets/legatus-logo-light.png";

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  budouci_vedouci: { label: "Budoucí vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

export function AppSidebar() {
  const { profile, signOut, godMode, viewingAsUser, setViewingAsUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  // Pending promotion requests count for vedouci / budouci_vedouci
  const isVedouci = profile?.role === "vedouci" || profile?.role === "budouci_vedouci";
  const { data: pendingPromotionCount = 0 } = useQuery({
    queryKey: ["pending_promotions_count", profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("promotion_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count || 0;
    },
    enabled: !!profile?.id && isVedouci,
    refetchInterval: 30000,
  });

  const { unrecordedCount } = useUnrecordedMeetings();

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, badge: false },
    { title: "Můj byznys", url: "/obchodni-pripady", icon: Briefcase, badge: unrecordedCount > 0 },
  ];

  if (
    isVedouci ||
    profile?.role === "budouci_vedouci" ||
    profile?.role === "garant" ||
    profile?.role === "ziskatel"
  ) {
    navItems.push({ title: "Správa týmu", url: "/tym", icon: Users, badge: isVedouci && pendingPromotionCount > 0 });
  }

  navItems.push({ title: "Call party", url: "/call-party", icon: PhoneCall, badge: false });

  if (godMode && profile?.is_admin) {
    navItems.push({ title: "Admin", url: "/admin", icon: Shield, badge: false });
    // "Transakce" je nyní záložka uvnitř Admina
  }

  const displayProfile = viewingAsUser ?? profile;
  const initials =
    displayProfile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const isLight = theme !== "dark";

  const handleExitViewAs = () => {
    setViewingAsUser(null);
    navigate("/dashboard");
  };

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r-0 sidebar-glass"
        style={{ width: collapsed ? undefined : "220px" }}
      >
        <SidebarContent style={{ padding: "20px 12px" }}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <img src={isLight ? legatusLogoLight : legatusLogoWhite} alt="Legatus" className="h-12 w-12 object-contain flex-shrink-0" />
            {!collapsed && (
              <span
                className="font-heading font-semibold text-[22px] leading-tight tracking-[0.2em] truncate"
                style={{ color: isLight ? "#00555f" : "#ffffff" }}
              >
                LEGATUS
              </span>
            )}
          </div>

          {/* Search bar */}
          <div className="mb-3">
            {collapsed ? (
              <button onClick={() => navigate("/hledani")} className="nav-item w-full justify-center" title="Hledat">
                <Search className="h-[18px] w-[18px] flex-shrink-0" />
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim().length >= 2) {
                    navigate(`/hledani?q=${encodeURIComponent(searchQuery.trim())}`);
                    setSearchQuery("");
                  }
                }}
                className="relative"
              >
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: isLight ? "rgba(10,53,64,0.45)" : "rgba(255,255,255,0.4)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hledat…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl text-xs font-body focus:outline-none transition-colors"
                  style={
                    isLight
                      ? {
                          background: "rgba(255, 255, 255, 0.4)",
                          border: "0.5px solid rgba(255, 255, 255, 0.6)",
                          color: "#0a3540",
                        }
                      : {
                          background: "rgba(255,255,255,0.1)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#ffffff",
                        }
                  }
                />
              </form>
            )}
          </div>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className="nav-item"
                        activeClassName="active"
                      >
                        <div className="relative flex-shrink-0">
                          <item.icon className="h-[18px] w-[18px]" />
                          {item.badge && (
                            <span
                              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2"
                              style={{ borderColor: "var(--sidebar-bg, hsl(var(--sidebar)))" }}
                            />
                          )}
                        </div>
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Dark mode toggle + Settings + Sign out */}
          <div className="mt-auto pt-2 space-y-1">
            <button
              onClick={toggleTheme}
              className="nav-item w-full"
              title={theme === "dark" ? "Světlý režim" : "Tmavý režim"}
            >
              {theme === "dark" ? (
                <Sun className="h-[18px] w-[18px] flex-shrink-0" />
              ) : (
                <Moon className="h-[18px] w-[18px] flex-shrink-0" />
              )}
              {!collapsed && <span>{theme === "dark" ? "Světlý režim" : "Tmavý režim"}</span>}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="nav-item w-full" title="Nastavení">
              <Settings className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span>Nastavení</span>}
            </button>
            <button onClick={signOut} className="nav-item w-full" title="Odhlásit">
              <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span>Odhlásit</span>}
            </button>
          </div>
        </SidebarContent>

        {viewingAsUser && (
          <div
            className="mx-3 mb-2 rounded-xl p-3"
            style={{
              background: isLight ? "rgba(0,171,189,0.10)" : "rgba(0,171,189,0.18)",
              border: isLight ? "1px solid rgba(0,171,189,0.35)" : "1px solid rgba(0,171,189,0.4)",
            }}
          >
            {!collapsed ? (
              <>
                <div
                  className="flex items-center gap-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: isLight ? "#00555f" : "#4dd8e8" }}
                >
                  <Eye className="h-3 w-3" />
                  Prohlížíš jako
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {viewingAsUser.avatar_url ? (
                    <img src={viewingAsUser.avatar_url} alt={viewingAsUser.full_name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: isLight ? "rgba(0,85,95,0.15)" : "rgba(255,255,255,0.15)" }}
                    >
                      <span className="text-[11px] font-heading font-semibold" style={{ color: isLight ? "#00555f" : "#fff" }}>
                        {viewingAsUser.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-heading font-semibold truncate" style={{ color: isLight ? "#0a3540" : "#fff" }}>
                      {viewingAsUser.full_name}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: isLight ? "rgba(10,53,64,0.6)" : "rgba(255,255,255,0.6)" }}>
                      {roleBadgeConfig[viewingAsUser.role]?.label || viewingAsUser.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleExitViewAs}
                  className="w-full text-[11px] font-heading font-semibold py-1.5 rounded-lg transition-colors"
                  style={{
                    background: isLight ? "#00abbd" : "#00abbd",
                    color: "#fff",
                  }}
                >
                  Zpět na svůj účet
                </button>
              </>
            ) : (
              <button
                onClick={handleExitViewAs}
                className="w-full flex items-center justify-center"
                title={`Prohlížíš jako ${viewingAsUser.full_name} — zpět na svůj účet`}
              >
                <Eye className="h-4 w-4" style={{ color: isLight ? "#00555f" : "#4dd8e8" }} />
              </button>
            )}
          </div>
        )}

        <SidebarFooter
          className="p-4"
          style={{
            borderTop: isLight
              ? "0.5px solid rgba(0, 85, 95, 0.1)"
              : "0.5px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`relative flex-shrink-0 ${godMode && !viewingAsUser ? "god-mode-avatar" : ""}`}>
                {displayProfile?.avatar_url ? (
                  <img src={displayProfile.avatar_url} alt={displayProfile.full_name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: isLight ? "rgba(0,85,95,0.1)" : "rgba(255, 255, 255, 0.1)" }}
                  >
                    <span
                      className="text-[13px] font-heading font-semibold"
                      style={{ color: isLight ? "#00555f" : "rgba(255, 255, 255, 0.85)" }}
                    >
                      {initials}
                    </span>
                  </div>
                )}
                {godMode && !viewingAsUser && <span className="absolute -top-1 -right-1 text-[10px] leading-none">⚡</span>}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-heading font-semibold truncate"
                    style={{ color: isLight ? "#0a3540" : "rgba(255, 255, 255, 0.85)" }}
                  >
                    {displayProfile?.full_name}
                  </p>
                  {displayProfile?.role && (
                    <span
                      className={`mt-1 ${roleBadgeConfig[displayProfile.role]?.className || ""}`}
                      style={{ color: isLight ? "rgba(10, 53, 64, 0.45)" : "rgba(255, 255, 255, 0.35)" }}
                    >
                      {roleBadgeConfig[displayProfile.role]?.label}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
