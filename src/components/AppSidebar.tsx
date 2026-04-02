import { LayoutDashboard, BarChart3, Users, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
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

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Moje aktivity", url: "/aktivity", icon: BarChart3 },
  ];

  if (profile?.role === "vedouci" || profile?.role === "garant") {
    navItems.push({ title: "Správa týmu", url: "/tym", icon: Users });
  }

  const roleBadgeLabel = {
    vedouci: "Vedoucí",
    garant: "Garant",
    novacek: "Nováček",
  };

  const roleBadgeColor = {
    vedouci: "bg-legatus-deep-teal",
    garant: "bg-legatus-teal",
    novacek: "bg-muted text-foreground",
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        {/* Logo */}
        <div className="px-4 py-6 flex items-center gap-3">
          <img src={legatusLogoWhite} alt="Legatus" className="h-8 w-8 object-contain flex-shrink-0" />
          {!collapsed && (
            <span className="font-heading font-bold text-sm tracking-[0.2em] text-sidebar-foreground">
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
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="ml-3 font-body text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-heading font-semibold text-sidebar-foreground">{initials}</span>
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-medium text-sidebar-foreground truncate">
                {profile?.full_name}
              </p>
              {profile?.role && (
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-heading font-semibold rounded-pill text-white ${roleBadgeColor[profile.role]}`}
                >
                  {roleBadgeLabel[profile.role]}
                </span>
              )}
            </div>
          )}
          {!collapsed && (
            <button
              onClick={signOut}
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              title="Odhlásit"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
