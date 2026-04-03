import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodForMonth, getProductionPeriodMonth } from "@/lib/productionPeriod";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

interface ProductionMonthPickerProps {
  selectedYear: number;
  selectedMonth: number; // 0-indexed
  onChange: (year: number, month: number) => void;
}

export function ProductionMonthPicker({ selectedYear, selectedMonth, onChange }: ProductionMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(selectedYear);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync display year when selection changes
  useEffect(() => {
    setDisplayYear(selectedYear);
  }, [selectedYear]);

  const currentPeriod = getProductionPeriodMonth();
  const { start, end } = getProductionPeriodForMonth(selectedYear, selectedMonth);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 legatus-card"
        style={{
          padding: "8px 14px",
          cursor: "pointer",
          border: "1px solid #e1e9eb",
          borderRadius: 12,
          background: "#fff",
          fontFamily: "Poppins, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          color: "#0c2226",
        }}
      >
        <span>{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
        <ChevronDown size={14} color="#8aadb3" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e1e9eb",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            width: 260,
            overflow: "hidden",
          }}
        >
          {/* Year header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid #eef3f4",
            }}
          >
            <button
              onClick={() => setDisplayYear((y) => y - 1)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: "#eef3f4",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronLeft size={14} color="#00555f" />
            </button>
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "#0c2226",
              }}
            >
              {displayYear}
            </span>
            <button
              onClick={() => setDisplayYear((y) => y + 1)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: "#eef3f4",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronRight size={14} color="#00555f" />
            </button>
          </div>

          {/* Month grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
              padding: 8,
            }}
          >
            {MONTH_NAMES.map((name, idx) => {
              const isSelected = displayYear === selectedYear && idx === selectedMonth;
              const isCurrent = displayYear === currentPeriod.year && idx === currentPeriod.month;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    onChange(displayYear, idx);
                    setOpen(false);
                  }}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "Open Sans, sans-serif",
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? "#00abbd" : "transparent",
                    color: isSelected ? "#fff" : isCurrent ? "#00abbd" : "#0c2226",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "#eef3f4";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}