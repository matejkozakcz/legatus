import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, BarChart3, Users, LogOut, Briefcase, Moon, Sun, Settings, Calendar, Search } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  budouci_vedouci: { label: "Budoucí vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

export function AppSidebar() {
  const { profile, signOut, godMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  // Pending promotion requests count for vedouci
  const isVedouci = profile?.role === "vedouci";
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

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, badge: false },
    ...(godMode ? [{ title: "Přehled aktivit", url: "/aktivity", icon: BarChart3, badge: false }] : []),
    { title: "Kalendář", url: "/kalendar", icon: Calendar, badge: false },
    { title: "Byznys případy", url: "/obchodni-pripady", icon: Briefcase, badge: false },
  ];

  if (isVedouci || profile?.role === "budouci_vedouci") {
    navItems.push({ title: "Správa týmu", url: "/tym", icon: Users, badge: isVedouci && pendingPromotionCount > 0 });
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0" style={{ width: collapsed ? undefined : "220px" }}>
        <SidebarContent className="bg-sidebar" style={{ padding: "20px 12px" }}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <img src={legatusLogoWhite} alt="Legatus" className="h-12 w-12 object-contain flex-shrink-0" />
            {!collapsed && (
              <span className="font-heading font-semibold text-[22px] leading-tight tracking-[0.2em] text-white truncate">
                LEGATUS
              </span>
            )}
          </div>

          {/* Search bar */}
          <div className="mb-3">
            {collapsed ? (
              <button
                onClick={() => navigate("/hledani")}
                className="nav-item w-full justify-center"
                title="Hledat"
              >
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hledat…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl text-xs font-body text-white placeholder:text-white/40 bg-white/10 border border-white/10 focus:outline-none focus:border-white/25 transition-colors"
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
                        <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
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
            <button
              onClick={signOut}
              className="nav-item w-full"
              title="Odhlásit"
            >
              <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && <span>Odhlásit</span>}
            </button>
          </div>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  <span className="text-[13px] font-heading font-semibold text-white">{initials}</span>
                </div>
              )}
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-heading font-semibold text-white truncate">{profile?.full_name}</p>
                  {profile?.role && (
                    <span className={`mt-1 ${roleBadgeConfig[profile.role]?.className || ""}`}>
                      {roleBadgeConfig[profile.role]?.label}
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
