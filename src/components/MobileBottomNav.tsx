import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Přehled" },
  { path: "/tym", icon: Users, label: "Tým" },
] as const;

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  const isAktivityActive = location.pathname === "/aktivity";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "0 20px 28px",
        paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          height: 64,
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderRadius: 40,
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 8px 32px rgba(0,85,95,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          position: "relative",
          pointerEvents: "all",
        }}
      >
        {/* Left: Dashboard */}
        <NavButton
          icon={LayoutDashboard}
          label="Přehled"
          active={location.pathname === "/dashboard"}
          onClick={() => navigate("/dashboard")}
        />

        {/* Center spacer (for the elevated button) */}
        <div style={{ flex: 1 }} />

        {/* Right: Tým */}
        <NavButton
          icon={Users}
          label="Tým"
          active={location.pathname === "/tym"}
          onClick={() => navigate("/tym")}
        />

        {/* Center elevated Aktivity button */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: -22,
            pointerEvents: "all",
          }}
        >
          <button
            onClick={() => navigate("/aktivity")}
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              border: isAktivityActive
                ? "3px solid #fc7c71"
                : "3px solid white",
              boxShadow: isAktivityActive
                ? "0 4px 20px rgba(252,124,113,0.45)"
                : "0 4px 20px rgba(0,85,95,0.25)",
              overflow: "hidden",
              cursor: "pointer",
              background: isAktivityActive ? "#fc7c71" : "#00555f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexDirection: "column",
              gap: 2,
            }}
            aria-label="Aktivity"
          >
            {isAktivityActive ? (
              <BarChart3 size={26} color="white" />
            ) : profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={initials}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {initials}
              </span>
            )}
          </button>
          <div
            style={{
              textAlign: "center",
              marginTop: 6,
              fontSize: 10,
              fontWeight: 600,
              color: isAktivityActive ? "#00abbd" : "#8aadb3",
              letterSpacing: "0.02em",
            }}
          >
            Aktivity
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        padding: "8px 20px",
        borderRadius: 30,
        border: "none",
        background: "transparent",
        flex: 1,
      }}
    >
      <Icon
        size={22}
        color={active ? "#00abbd" : "#8aadb3"}
        style={{ transition: "color 0.2s" }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: active ? "#00abbd" : "#8aadb3",
          letterSpacing: "0.02em",
          transition: "color 0.2s",
          fontFamily: "Open Sans, sans-serif",
        }}
      >
        {label}
      </span>
    </button>
  );
}
