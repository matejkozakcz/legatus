// Single source of truth for meeting-type colors across the entire system.
// Aligned with the Dashboard's ConversionFunnel cards so badges, filters,
// calendar entries and analytics are visually consistent.

export type MeetingTypeKey = "FSA" | "POR" | "SER" | "POH" | "NAB" | "INFO" | "POST";

/** Solid accent color per meeting type (hex). */
export const MEETING_TYPE_COLORS: Record<MeetingTypeKey, string> = {
  FSA: "#F59E0B",   // Analýzy — amber/orange
  POR: "#8B5CF6",   // Poradenství — purple
  SER: "#EF4444",   // Servisy — red
  POH: "#0D9488",   // Pohovory — teal
  NAB: "#7E22CE",   // Nábor — deep purple
  INFO: "#7B5EA7",  // Info — muted purple
  POST: "#5E7AB5",  // Postinfo — muted blue
};

/** Soft tint background + readable foreground for badges/pills. */
export function meetingTypeBadgeColors(t: string, cancelled = false): { background: string; color: string } {
  if (cancelled) return { background: "#e5e7eb", color: "#6b7280" };
  const c = MEETING_TYPE_COLORS[t as MeetingTypeKey];
  if (!c) return { background: "#fef3f2", color: "#c0392b" };
  // 18% tint for background, full color for text
  return { background: `${c}26`, color: c };
}

/** Lowercase alias map used by ConversionFunnel and similar charts. */
export const MEETING_TYPE_COLORS_LOWER = {
  fsa: MEETING_TYPE_COLORS.FSA,
  por: MEETING_TYPE_COLORS.POR,
  ser: MEETING_TYPE_COLORS.SER,
  poh: MEETING_TYPE_COLORS.POH,
} as const;
