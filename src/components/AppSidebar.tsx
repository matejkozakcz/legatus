import { useState } from "react";
import { LayoutDashboard, BarChart3, Users, LogOut, Briefcase, Moon, Sun, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
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
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Přehled aktivit", url: "/aktivity", icon: BarChart3 },
    { title: "Obchodní případy", url: "/obchodni-pripady", icon: Briefcase },
  ];

  if (profile?.role === "vedouci" || profile?.role === "garant" || profile?.role === "ziskatel") {
    navItems.push({ title: "Správa týmu", url: "/tym", icon: Users });
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

          {/* Dark mode toggle — nad čárou nad avatarem */}
          <div className="mt-auto pt-2">
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
              {!collapsed && (
                <span>{theme === "dark" ? "Světlý režim" : "Tmavý režim"}</span>
              )}
            </button>
          </div>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setProfileModalOpen(true)}
            >
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
            {!collapsed && (
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-[12px] font-body"
                title="Odhlásit"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                <span>Odhlásit</span>
              </button>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <ProfileSettingsModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </>
  );
}
