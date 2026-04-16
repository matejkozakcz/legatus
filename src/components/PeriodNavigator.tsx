import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useTheme } from "@/contexts/ThemeContext";
import { cs } from "date-fns/locale";

interface PeriodNavigatorProps {
  label: string;
  title: string;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  /** When the user picks a date from the calendar */
  onSelectDate: (date: Date) => void;
  /** The currently selected date (used to highlight in the calendar) */
  selectedDate?: Date;
  /** The month to display in the calendar */
  calendarMonth?: Date;
  /** Picker mode — "day" (default) or "month" (year nav + month grid) */
  pickerMode?: "day" | "month";
  /** Optional widening factor — e.g. 1.5 to make the bar 50 % wider */
  widthScale?: number;
}

const MONTH_NAMES_SHORT = [
  "Led", "Úno", "Bře", "Dub", "Kvě", "Čer",
  "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
];

export function PeriodNavigator({
  label,
  title,
  subtitle,
  onPrev,
  onNext,
  onSelectDate,
  selectedDate,
  calendarMonth,
}: PeriodNavigatorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [calendarOpen, setCalendarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  const btnStyle = {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: isDark ? "rgba(255,255,255,0.1)" : "#dde8ea",
    border: "none" as const,
    cursor: "pointer" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const chevronColor = isDark ? "#4dd8e8" : "#00555f";

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
          borderRadius: 16,
          padding: "10px 16px",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <button onClick={onPrev} style={btnStyle}>
          <ChevronLeft size={15} color={chevronColor} />
        </button>
        <button
          onClick={() => setCalendarOpen((o) => !o)}
          style={{
            textAlign: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>{label}</div>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </div>
        </button>
        <button onClick={onNext} style={btnStyle}>
          <ChevronRight size={15} color={chevronColor} />
        </button>
      </div>

      {subtitle && (
        <div
          className="text-center font-body text-xs text-muted-foreground"
          style={{ marginTop: 8 }}
        >
          {subtitle}
        </div>
      )}

      {calendarOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: isDark ? "#0a1f23" : "#fff",
            borderRadius: 14,
            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #e1e9eb",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            month={calendarMonth}
            onMonthChange={() => {}}
            onSelect={(date) => {
              if (date) {
                onSelectDate(date);
                setCalendarOpen(false);
              }
            }}
            locale={cs}
            weekStartsOn={1}
            className="p-3 pointer-events-auto"
          />
        </div>
      )}
    </div>
  );
}
