import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CronMode = "daily" | "weekly" | "monthly" | "interval" | "custom";

interface ParsedCron {
  mode: CronMode;
  hour: number;
  minute: number;
  daysOfWeek: number[]; // 0=Sun..6=Sat
  dayOfMonth: number;
  intervalMinutes: number;
}

const DEFAULT_PARSED: ParsedCron = {
  mode: "daily",
  hour: 9,
  minute: 0,
  daysOfWeek: [1], // Monday
  dayOfMonth: 1,
  intervalMinutes: 15,
};

const DAY_LABELS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function tryParse(cron: string): ParsedCron | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;

  // Interval: */N * * * * (only minute uses step)
  const intervalMatch = m.match(/^\*\/(\d+)$/);
  if (intervalMatch && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { ...DEFAULT_PARSED, mode: "interval", intervalMinutes: parseInt(intervalMatch[1], 10) };
  }

  const minute = /^\d+$/.test(m) ? parseInt(m, 10) : NaN;
  const hour = /^\d+$/.test(h) ? parseInt(h, 10) : NaN;
  if (isNaN(minute) || isNaN(hour)) return null;

  // Monthly: minute hour dayOfMonth * *
  if (/^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return { ...DEFAULT_PARSED, mode: "monthly", hour, minute, dayOfMonth: parseInt(dom, 10) };
  }

  // Daily: minute hour * * *
  if (dom === "*" && mon === "*" && dow === "*") {
    return { ...DEFAULT_PARSED, mode: "daily", hour, minute };
  }

  // Weekly: minute hour * * dow (single or csv)
  if (dom === "*" && mon === "*" && dow !== "*") {
    const days = dow.split(",").map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    if (days.length > 0) {
      return { ...DEFAULT_PARSED, mode: "weekly", hour, minute, daysOfWeek: days };
    }
  }

  return null;
}

function build(parsed: ParsedCron): string {
  const { mode, hour, minute, daysOfWeek, dayOfMonth, intervalMinutes } = parsed;
  switch (mode) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly": {
      const dow = daysOfWeek.length > 0 ? [...daysOfWeek].sort((a, b) => a - b).join(",") : "*";
      return `${minute} ${hour} * * ${dow}`;
    }
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "interval":
      return `*/${Math.max(1, Math.min(59, intervalMinutes))} * * * *`;
    case "custom":
      return ""; // caller uses raw value
  }
}

function describe(parsed: ParsedCron): string {
  const t = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
  switch (parsed.mode) {
    case "daily":
      return `Každý den v ${t}`;
    case "weekly":
      return parsed.daysOfWeek.length === 0
        ? "Vyber alespoň jeden den"
        : `Každý ${parsed.daysOfWeek.sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ")} v ${t}`;
    case "monthly":
      return `${parsed.dayOfMonth}. den v měsíci v ${t}`;
    case "interval":
      return `Každých ${parsed.intervalMinutes} minut`;
    case "custom":
      return "Vlastní cron výraz";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CronPickerProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronPicker({ value, onChange }: CronPickerProps) {
  // Determine initial mode: try to parse, else "custom"
  const initial = useMemo<{ parsed: ParsedCron; isCustom: boolean }>(() => {
    const p = tryParse(value);
    if (p) return { parsed: p, isCustom: false };
    return { parsed: { ...DEFAULT_PARSED, mode: "custom" }, isCustom: true };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [parsed, setParsed] = useState<ParsedCron>(initial.parsed);
  const [customValue, setCustomValue] = useState<string>(initial.isCustom ? value : "");

  // Sync upward when parsed changes (non-custom modes)
  useEffect(() => {
    if (parsed.mode === "custom") {
      onChange(customValue);
    } else {
      onChange(build(parsed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, customValue]);

  const setMode = (m: CronMode) => {
    if (m === "custom" && parsed.mode !== "custom") {
      setCustomValue(build(parsed));
    }
    setParsed((p) => ({ ...p, mode: m }));
  };

  const toggleDay = (d: number) => {
    setParsed((p) => ({
      ...p,
      daysOfWeek: p.daysOfWeek.includes(d) ? p.daysOfWeek.filter((x) => x !== d) : [...p.daysOfWeek, d],
    }));
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Frekvence</Label>
        <Select value={parsed.mode} onValueChange={(v) => setMode(v as CronMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[120]">
            <SelectItem value="daily">Každý den</SelectItem>
            <SelectItem value="weekly">Každý týden ve vybrané dny</SelectItem>
            <SelectItem value="monthly">Každý měsíc</SelectItem>
            <SelectItem value="interval">Každých N minut</SelectItem>
            <SelectItem value="custom">Vlastní cron výraz</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(parsed.mode === "daily" || parsed.mode === "weekly" || parsed.mode === "monthly") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Hodina</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={parsed.hour}
              onChange={(e) => setParsed({ ...parsed, hour: Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10))) })}
            />
          </div>
          <div>
            <Label>Minuta</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={parsed.minute}
              onChange={(e) => setParsed({ ...parsed, minute: Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10))) })}
            />
          </div>
        </div>
      )}

      {parsed.mode === "weekly" && (
        <div>
          <Label>Dny v týdnu</Label>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {DAY_LABELS.map((label, idx) => {
              const active = parsed.daysOfWeek.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`min-w-10 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {parsed.mode === "monthly" && (
        <div>
          <Label>Den v měsíci</Label>
          <Input
            type="number"
            min={1}
            max={28}
            value={parsed.dayOfMonth}
            onChange={(e) => setParsed({ ...parsed, dayOfMonth: Math.max(1, Math.min(28, parseInt(e.target.value || "1", 10))) })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Maximálně 28 (kvůli únoru).</p>
        </div>
      )}

      {parsed.mode === "interval" && (
        <div>
          <Label>Interval (minuty)</Label>
          <Input
            type="number"
            min={1}
            max={59}
            value={parsed.intervalMinutes}
            onChange={(e) => setParsed({ ...parsed, intervalMinutes: Math.max(1, Math.min(59, parseInt(e.target.value || "1", 10))) })}
          />
        </div>
      )}

      {parsed.mode === "custom" && (
        <div>
          <Label>Cron výraz</Label>
          <Input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="0 9 * * *"
            className="font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Formát: <code>min hod den-měsíce měsíc den-týdne</code>
          </p>
        </div>
      )}

      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Náhled: </span>
        <span className="font-medium text-foreground">{describe(parsed)}</span>
        <span className="ml-2 text-muted-foreground font-mono">
          ({parsed.mode === "custom" ? customValue || "(prázdné)" : build(parsed)})
        </span>
      </div>
    </div>
  );
}
