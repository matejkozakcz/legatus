import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// ─── Helpers ─────────────────────────────────────────────────────────────────
//
// Zjednodušený picker: čas (HH:MM, 24h) + libovolná kombinace dnů v týdnu.
// Časová zóna je vždy Europe/Prague (vč. letního času) — viz schedule_timezone
// na úrovni pravidla. Cron výraz odpovídá:
//   - "<min> <hour> * * *"               (vybrány všechny dny)
//   - "<min> <hour> * * <d1>,<d2>,..."   (vybrané dny, 0=Ne..6=So)

interface ParsedTime {
  hour: number;
  minute: number;
  daysOfWeek: number[]; // 0=Ne..6=So
}

const DEFAULT_PARSED: ParsedTime = {
  hour: 9,
  minute: 0,
  daysOfWeek: [1, 2, 3, 4, 5], // Po–Pá
};

// Zobrazení Po–Ne (sjednoceno s českou konvencí týdne)
const DAY_ORDER: { idx: number; label: string }[] = [
  { idx: 1, label: "Po" },
  { idx: 2, label: "Út" },
  { idx: 3, label: "St" },
  { idx: 4, label: "Čt" },
  { idx: 5, label: "Pá" },
  { idx: 6, label: "So" },
  { idx: 0, label: "Ne" },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function tryParse(cron: string): ParsedTime | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;

  if (dom !== "*" || mon !== "*") return null;
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) return null;
  const minute = parseInt(m, 10);
  const hour = parseInt(h, 10);

  let days: number[];
  if (dow === "*") {
    days = [...ALL_DAYS];
  } else {
    days = dow
      .split(",")
      .map((d) => parseInt(d, 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    if (days.length === 0) return null;
  }

  return { hour, minute, daysOfWeek: days };
}

function build(parsed: ParsedTime): string {
  const { hour, minute, daysOfWeek } = parsed;
  const allSelected = ALL_DAYS.every((d) => daysOfWeek.includes(d));
  const dow = allSelected
    ? "*"
    : [...daysOfWeek].sort((a, b) => a - b).join(",");
  return `${minute} ${hour} * * ${dow}`;
}

function describe(parsed: ParsedTime): string {
  const t = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
  if (parsed.daysOfWeek.length === 0) return "Vyber alespoň jeden den";
  const allSelected = ALL_DAYS.every((d) => parsed.daysOfWeek.includes(d));
  if (allSelected) return `Každý den v ${t}`;
  const labels = DAY_ORDER.filter((d) => parsed.daysOfWeek.includes(d.idx)).map(
    (d) => d.label,
  );
  return `Každý ${labels.join(", ")} v ${t}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CronPickerProps {
  value: string;
  onChange: (cron: string) => void;
}

export function CronPicker({ value, onChange }: CronPickerProps) {
  const initial = useMemo<ParsedTime>(() => {
    return tryParse(value) ?? DEFAULT_PARSED;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [parsed, setParsed] = useState<ParsedTime>(initial);
  const [timeStr, setTimeStr] = useState<string>(
    `${String(initial.hour).padStart(2, "0")}:${String(initial.minute).padStart(2, "0")}`,
  );

  // Sync upward whenever parsed changes
  useEffect(() => {
    onChange(build(parsed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const handleTimeChange = (v: string) => {
    setTimeStr(v);
    const match = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const h = Math.max(0, Math.min(23, parseInt(match[1], 10)));
    const m = Math.max(0, Math.min(59, parseInt(match[2], 10)));
    setParsed((p) => ({ ...p, hour: h, minute: m }));
  };

  const toggleDay = (d: number) => {
    setParsed((p) => ({
      ...p,
      daysOfWeek: p.daysOfWeek.includes(d)
        ? p.daysOfWeek.filter((x) => x !== d)
        : [...p.daysOfWeek, d],
    }));
  };

  const setAllDays = () => setParsed((p) => ({ ...p, daysOfWeek: [...ALL_DAYS] }));
  const setWeekdays = () => setParsed((p) => ({ ...p, daysOfWeek: [1, 2, 3, 4, 5] }));
  const clearDays = () => setParsed((p) => ({ ...p, daysOfWeek: [] }));

  return (
    <div className="space-y-3">
      <div>
        <Label>Čas odeslání (24h)</Label>
        <Input
          type="time"
          value={timeStr}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="font-mono"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Časová zóna: <span className="font-medium">Europe/Prague</span> (automaticky vč. letního času)
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Dny v týdnu</Label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={setWeekdays}
              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Po–Pá
            </button>
            <button
              type="button"
              onClick={setAllDays}
              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Vše
            </button>
            <button
              type="button"
              onClick={clearDays}
              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Žádný
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_ORDER.map(({ idx, label }) => {
            const active = parsed.daysOfWeek.includes(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`px-2 py-2 rounded-md text-xs font-medium border transition-colors ${
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

      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Náhled: </span>
        <span className="font-medium text-foreground">{describe(parsed)}</span>
        <span className="ml-2 text-muted-foreground font-mono text-[10px]">
          ({build(parsed)})
        </span>
      </div>
    </div>
  );
}
