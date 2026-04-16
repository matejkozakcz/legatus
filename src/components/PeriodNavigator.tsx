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
  pickerMode = "day",
  widthScale = 1,
}: PeriodNavigatorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Year shown when in "month" picker mode
  const [pickerYear, setPickerYear] = useState<number>(
    (calendarMonth ?? selectedDate ?? new Date()).getFullYear(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep picker year in sync when calendar opens
  useEffect(() => {
    if (calendarOpen && pickerMode === "month") {
      setPickerYear((calendarMonth ?? selectedDate ?? new Date()).getFullYear());
    }
  }, [calendarOpen, pickerMode, calendarMonth, selectedDate]);

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
  const selectedYear = (selectedDate ?? new Date()).getFullYear();
  const selectedMonth = (selectedDate ?? new Date()).getMonth();

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
          maxWidth: Math.round(520 * widthScale),
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
          {pickerMode === "month" ? (
            <div style={{ padding: 12, width: 260 }}>
              {/* Year header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button
                  onClick={() => setPickerYear((y) => y - 1)}
                  style={btnStyle}
                  aria-label="Předchozí rok"
                >
                  <ChevronLeft size={15} color={chevronColor} />
                </button>
                <div style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--text-primary)",
                }}>
                  {pickerYear}
                </div>
                <button
                  onClick={() => setPickerYear((y) => y + 1)}
                  style={btnStyle}
                  aria-label="Další rok"
                >
                  <ChevronRight size={15} color={chevronColor} />
                </button>
              </div>
              {/* Month grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {MONTH_NAMES_SHORT.map((mName, idx) => {
                  const isSelected = pickerYear === selectedYear && idx === selectedMonth;
                  return (
                    <button
                      key={mName}
                      onClick={() => {
                        onSelectDate(new Date(pickerYear, idx, 1));
                        setCalendarOpen(false);
                      }}
                      style={{
                        padding: "10px 0",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 600,
                        fontSize: 13,
                        background: isSelected
                          ? "#00abbd"
                          : isDark ? "rgba(255,255,255,0.06)" : "#f1f5f6",
                        color: isSelected
                          ? "#fff"
                          : isDark ? "#e6f7f9" : "#00555f",
                      }}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}