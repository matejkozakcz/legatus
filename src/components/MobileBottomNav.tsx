import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, Briefcase, Users, GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useUnrecordedMeetings } from "@/hooks/useUnrecordedMeetings";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, godMode } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { unrecordedCount } = useUnrecordedMeetings();

  const initials = profile
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const isDashboardActive = location.pathname === "/dashboard";

  const avatarBorder = godMode ? "3px solid #fc7c71" : isDashboardActive ? "3px solid #00abbd" : "3px solid white";
  const avatarShadow = godMode
    ? "0 4px 20px rgba(252,124,113,0.5)"
    : isDashboardActive
      ? "0 4px 20px rgba(0,171,189,0.4)"
      : "0 4px 20px rgba(0,85,95,0.25)";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "0 20px 18px",
        paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 64,
          background: isDark ? "rgba(9,29,33,0.82)" : "rgba(255,255,255,0.55)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderRadius: 40,
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.7)",
          boxShadow: isDark
            ? "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)"
            : "0 8px 32px rgba(0,85,95,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          position: "relative",
          pointerEvents: "all",
        }}
      >
        {profile?.role === "vedouci" ||
        profile?.role === "budouci_vedouci" ||
        profile?.role === "garant" ||
        profile?.role === "ziskatel" ? (
          <NavButton icon={Users} label="Tým" active={location.pathname === "/tym"} onClick={() => navigate("/tym")} isDark={isDark} />
        ) : (
          <NavButton icon={Briefcase} label="Byznys" active={location.pathname === "/obchod"} onClick={() => navigate("/obchod")} isDark={isDark} badge={unrecordedCount > 0} />
        )}

        <div style={{ flex: 1 }} />

        {profile?.role === "vedouci" ||
        profile?.role === "budouci_vedouci" ||
        profile?.role === "garant" ||
        profile?.role === "ziskatel" ? (
          <NavButton icon={Briefcase} label="Byznys" active={location.pathname === "/obchod"} onClick={() => navigate("/obchod")} isDark={isDark} badge={unrecordedCount > 0} />
        ) : godMode ? (
          <NavButton icon={Calendar} label="Schůzky" active={location.pathname === "/kalendar"} onClick={() => navigate("/kalendar")} isDark={isDark} />
        ) : null}

        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: -22,
            pointerEvents: "all",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                border: avatarBorder,
                boxShadow: avatarShadow,
                overflow: "hidden",
                cursor: "pointer",
                background: godMode ? "#fc7c71" : "#00555f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.25s",
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
              }}
              aria-label="Dashboard"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: godMode ? 0.75 : 1, transition: "opacity 0.25s" }} />
              ) : (
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: "white", lineHeight: 1 }}>{initials}</span>
              )}
            </button>

            {godMode && (
              <div style={{ position: "absolute", bottom: 0, right: -2, width: 18, height: 18, borderRadius: "50%", background: "white", border: "1.5px solid #fc7c71", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, lineHeight: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>⚡</div>
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: 5, fontSize: 10, fontWeight: 600, color: godMode ? "#fc7c71" : isDark ? "#4a7a80" : "#8aadb3", letterSpacing: "0.02em", fontFamily: "Open Sans, sans-serif", transition: "color 0.25s" }}>
            {godMode ? "Admin ⚡" : "Dashboard"}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, isDark = false, badge = false }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void; isDark?: boolean; badge?: boolean }) {
  const activeColor = "#00abbd";
  const inactiveColor = isDark ? "#4a7a80" : "#8aadb3";
  const color = active ? activeColor : inactiveColor;

  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", padding: "8px 20px", borderRadius: 30, border: "none", background: "transparent", flex: 1, position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Icon size={22} color={color} style={{ transition: "color 0.2s" }} />
        {badge && <span style={{ position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: "50%", background: "#fc7c71", border: "2px solid transparent" }} />}
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: "0.02em", transition: "color 0.2s", fontFamily: "Open Sans, sans-serif", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
