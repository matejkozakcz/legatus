import { useLocation, useNavigate } from "react-router-dom";
import { TrendingUp, CheckSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  const isDashboardActive = location.pathname === "/dashboard";

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
        {/* Left: Moje aktivity */}
        <NavButton
          icon={TrendingUp}
          label="Moje aktivity"
          active={location.pathname === "/aktivity"}
          onClick={() => navigate("/aktivity")}
        />

        {/* Center spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: Úkoly */}
        <NavButton
          icon={CheckSquare}
          label="Úkoly"
          active={location.pathname === "/ukoly"}
          onClick={() => navigate("/ukoly")}
        />

        {/* Center elevated Dashboard/Avatar button */}
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
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              border: isDashboardActive ? "3px solid #00abbd" : "3px solid white",
              boxShadow: isDashboardActive
                ? "0 4px 20px rgba(0,171,189,0.4)"
                : "0 4px 20px rgba(0,85,95,0.25)",
              overflow: "hidden",
              cursor: "pointer",
              background: "#00555f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            aria-label="Dashboard"
          >
            {profile?.avatar_url ? (
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
              marginTop: 5,
              fontSize: 10,
              fontWeight: 600,
              color: isDashboardActive ? "#00abbd" : "#8aadb3",
              letterSpacing: "0.02em",
              fontFamily: "Open Sans, sans-serif",
            }}
          >
            Dashboard
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
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
}
