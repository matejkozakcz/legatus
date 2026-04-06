import { useState, useRef, useCallback } from "react";
import { Briefcase, Calendar } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

import Kalendar from "./Kalendar";
import ObchodniPripady from "./ObchodniPripady";

const TABS = [
  { key: "schuzky" as const, label: "Schůzky", icon: Calendar },
  { key: "pripady" as const, label: "Byznys případy", icon: Briefcase },
];

type TabKey = "schuzky" | "pripady";

export default function MobileObchod() {
  const [activeTab, setActiveTab] = useState<TabKey>("schuzky");
  const { theme } = useTheme();
  const isDark = theme === "dark";

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
    [activeTab]
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
      {/* Tab header */}
      <div
        style={{
          display: "flex",
          padding: "4px 16px 0",
          gap: 4,
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
                padding: "10px 0",
                border: "none",
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                color: isActive ? activeColor : inactiveColor,
                background: "transparent",
                borderBottom: isActive
                  ? `2.5px solid ${activeColor}`
                  : `2.5px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                transition: "all 0.2s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content — swipe area */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ flex: 1, overflow: "hidden" }}
      >
        <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
          {activeTab === "schuzky" ? (
            <Kalendar mobileEmbedded />
          ) : (
            <ObchodniPripady mobileEmbedded />
          )}
        </div>
      </div>
    </div>
  );
}
