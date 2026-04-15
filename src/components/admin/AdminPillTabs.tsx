import { useTheme } from "@/contexts/ThemeContext";
import { LucideIcon } from "lucide-react";

interface Tab {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface AdminPillTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function AdminPillTabs({ tabs, activeTab, onTabChange }: AdminPillTabsProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const activeColor = "#00abbd";
  const inactiveColor = isDark ? "#4a7a80" : "#8aadb3";

  return (
    <div
      style={{
        display: "flex",
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,85,95,0.06)",
        padding: 3,
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              flex: "1 1 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              border: "none",
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
              fontWeight: isActive ? 600 : 500,
              fontSize: 12.5,
              color: isActive ? (isDark ? "#fff" : "#00555f") : inactiveColor,
              background: isActive ? (isDark ? "rgba(0,171,189,0.2)" : "#fff") : "transparent",
              borderRadius: 10,
              boxShadow: isActive
                ? isDark
                  ? "0 1px 4px rgba(0,0,0,0.3)"
                  : "0 1px 4px rgba(0,85,95,0.1)"
                : "none",
              transition: "all 0.2s ease",
              WebkitTapHighlightColor: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={14} color={isActive ? activeColor : inactiveColor} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
