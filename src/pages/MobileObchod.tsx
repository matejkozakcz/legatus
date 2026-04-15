import { useState, useRef, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { Briefcase, Calendar } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnrecordedMeetings } from "@/hooks/useUnrecordedMeetings";

import Kalendar from "./Kalendar";
import ObchodniPripady from "./ObchodniPripady";

const TABS = [
  { key: "schuzky" as const, label: "Schůzky", icon: Calendar },
  { key: "pripady" as const, label: "Byznys případy", icon: Briefcase },
];

type TabKey = "schuzky" | "pripady";

export default function MobileObchod() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabKey>("schuzky");
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { unrecordedCount } = useUnrecordedMeetings();

  // On tablet/desktop, redirect to the full desktop page
  if (!isMobile) return <Navigate to="/obchodni-pripady" replace />;

  // Swipe handling
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
        if (dx < 0 && activeTab === "schuzky") setActiveTab("pripady");
        else if (dx > 0 && activeTab === "pripady") setActiveTab("schuzky");
      }
    },
    [activeTab],
  );

  const activeColor = "#00abbd";
  const inactiveColor = isDark ? "#4a7a80" : "#8aadb3";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))",
      }}
    >
      {/* Page header */}
      <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold text-foreground" style={{ fontSize: 22 }}>
            Byznys
          </h1>
        </div>
      </div>

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          margin: "14px 16px 0",
          borderRadius: 12,
          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,85,95,0.06)",
          padding: 3,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 0",
                border: "none",
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                fontWeight: isActive ? 600 : 500,
                fontSize: 12.5,
                color: isActive ? (isDark ? "#fff" : "#00555f") : inactiveColor,
                background: isActive ? (isDark ? "rgba(0,171,189,0.2)" : "#fff") : "transparent",
                borderRadius: 10,
                boxShadow: isActive ? (isDark ? "0 1px 4px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,85,95,0.1)") : "none",
                transition: "all 0.2s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon size={14} color={isActive ? activeColor : inactiveColor} />
              <span style={{ position: "relative" }}>
                {tab.label}
                {tab.key === "schuzky" && unrecordedCount > 0 && (
                  <span style={{ position: "absolute", top: -2, right: -8, width: 6, height: 6, borderRadius: "50%", background: "#fc7c71" }} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content — swipe area */}
      <div style={{ flex: 1, overflow: "hidden", marginTop: 8 }}>
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ height: "100%", overflowY: "auto", overflowX: "hidden", minHeight: "100%" }}
        >
          <div style={{ minHeight: "100%" }}>
            {activeTab === "schuzky" ? <Kalendar mobileEmbedded /> : <ObchodniPripady mobileEmbedded />}
          </div>
        </div>
      </div>
    </div>
  );
}
