import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { cs } from "date-fns/locale";
import {
  getProductionPeriodForMonth,
  getProductionPeriodMonth,
} from "@/lib/productionPeriod";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeetingRow {
  meeting_type: string;
  cancelled: boolean;
  date: string;
  created_at: string;
  doporuceni_fsa: number;
  doporuceni_poradenstvi: number;
  doporuceni_pohovor: number;
  podepsane_bj: number;
}

interface PersonStats {
  name: string;
  role: string;
  fsa: number;
  poh: number;
  ser: number;
  por: number;
  ref: number;
  bj: number;
  newFsa: number;
  newPoh: number;
  newSer: number;
  newPor: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePersonStats(
  meetings: MeetingRow[],
  todayStr: string,
  periodFrom: string,
  periodTo: string,
  name: string,
  role: string,
): PersonStats {
  const active = meetings.filter((m) => !m.cancelled);
  const past = active.filter((m) => m.date <= todayStr);

  const countPast = (type: string) => past.filter((m) => m.meeting_type === type).length;
  const refs = active.reduce(
    (acc, m) => acc + (m.doporuceni_fsa || 0) + (m.doporuceni_poradenstvi || 0) + (m.doporuceni_pohovor || 0),
    0,
  );
  const bj = active.reduce((acc, m) => acc + (Number(m.podepsane_bj) || 0), 0);

  const newlyBooked = active.filter((m) => {
    const created = m.created_at?.slice(0, 10);
    return created && created >= periodFrom && created <= periodTo;
  });

  return {
    name,
    role,
    fsa: countPast("FSA"),
    poh: countPast("POH"),
    ser: countPast("SER"),
    por: countPast("POR"),
    ref: refs,
    bj,
    newFsa: newlyBooked.filter((m) => m.meeting_type === "FSA").length,
    newPoh: newlyBooked.filter((m) => m.meeting_type === "POH").length,
    newSer: newlyBooked.filter((m) => m.meeting_type === "SER").length,
    newPor: newlyBooked.filter((m) => m.meeting_type === "POR").length,
  };
}

const ROLE_LABEL: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

// ─── Main export function ────────────────────────────────────────────────────

export type ExportPeriod = "week" | "month";

export async function exportDashboardPdf(
  userId: string,
  userRole: string,
  userName: string,
  period: ExportPeriod,
  /** For month export — which production period */
  selectedYear?: number,
  selectedMonth?: number,
) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  // Determine date range
  let periodFrom: string;
  let periodTo: string;
  let periodLabel: string;

  if (period === "week") {
    const ws = startOfWeek(now, { weekStartsOn: 1 });
    const we = endOfWeek(now, { weekStartsOn: 1 });
    periodFrom = format(ws, "yyyy-MM-dd");
    periodTo = format(we, "yyyy-MM-dd");
    periodLabel = `Týden ${format(ws, "d. M.", { locale: cs })} – ${format(we, "d. M. yyyy", { locale: cs })}`;
  } else {
    const pm = selectedYear && selectedMonth
      ? getProductionPeriodForMonth(selectedYear, selectedMonth)
      : (() => {
        const cp = getProductionPeriodMonth(now);
        return getProductionPeriodForMonth(cp.year, cp.month);
      })();
    periodFrom = format(pm.start, "yyyy-MM-dd");
    periodTo = format(pm.end, "yyyy-MM-dd");
    periodLabel = `Období ${format(pm.start, "d. M.", { locale: cs })} – ${format(pm.end, "d. M. yyyy", { locale: cs })}`;
  }

  // Fetch own meetings
  const { data: ownMeetings = [] } = await supabase
    .from("client_meetings")
    .select("meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj")
    .eq("user_id", userId)
    .gte("date", periodFrom)
    .lte("date", periodTo);

  const ownStats = computePersonStats(ownMeetings as MeetingRow[], todayStr, periodFrom, periodTo, userName, userRole);

  // Fetch team members if leader role
  const isLeader = ["vedouci", "budouci_vedouci", "garant"].includes(userRole);
  let teamStats: PersonStats[] = [];

  if (isLeader) {
    // Get subordinates based on role
    let subordinateQuery = supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true);

    if (userRole === "vedouci" || userRole === "budouci_vedouci") {
      subordinateQuery = subordinateQuery.eq("vedouci_id", userId);
    } else if (userRole === "garant") {
      subordinateQuery = subordinateQuery.eq("garant_id", userId);
    }

    const { data: subordinates = [] } = await subordinateQuery;

    if (subordinates && subordinates.length > 0) {
      // Fetch meetings for all subordinates
      const subIds = subordinates.map((s: any) => s.id);
      const { data: teamMeetings = [] } = await supabase
        .from("client_meetings")
        .select("user_id, meeting_type, cancelled, date, created_at, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj")
        .in("user_id", subIds)
        .gte("date", periodFrom)
        .lte("date", periodTo);

      for (const sub of subordinates) {
        const subMeetings = (teamMeetings || []).filter((m: any) => m.user_id === sub.id) as MeetingRow[];
        teamStats.push(
          computePersonStats(subMeetings, todayStr, periodFrom, periodTo, sub.full_name, sub.role),
        );
      }
      // Sort alphabetically
      teamStats.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    }
  }

  // ── Generate PDF ───────────────────────────────────────────────────────────

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("LEGATUS", 14, 16);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(periodLabel, 14, 23);
  doc.text(`Vygenerováno: ${format(now, "d. M. yyyy HH:mm", { locale: cs })}`, pageWidth - 14, 23, { align: "right" });
  doc.setTextColor(0);

  // Personal stats table
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Moje aktivity — ${userName}`, 14, 34);

  autoTable(doc, {
    startY: 38,
    head: [["", "FSA", "POH", "SER", "POR", "Doporučení", "BJ"]],
    body: [
      ["Proběhlo", ownStats.fsa, ownStats.poh, ownStats.ser, ownStats.por, ownStats.ref, ownStats.bj],
      ["Nově doml.", ownStats.newFsa, ownStats.newPoh, ownStats.newSer, ownStats.newPor, "–", "–"],
    ],
    theme: "grid",
    headStyles: { fillColor: [0, 85, 95], textColor: 255, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 } },
    margin: { left: 14, right: 14 },
  });

  // Team stats table
  if (isLeader && teamStats.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 70;
    const teamStartY = finalY + 12;

    // Check if we need a new page
    if (teamStartY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Výsledky týmu", 14, 16);
    } else {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Výsledky týmu", 14, teamStartY);
    }

    const teamBody = teamStats.map((s) => [
      s.name,
      ROLE_LABEL[s.role] || s.role,
      s.fsa,
      s.poh,
      s.ser,
      s.por,
      s.ref,
      s.bj,
      s.newFsa,
      s.newPoh,
      s.newSer,
      s.newPor,
    ]);

    // Totals row
    const totals = teamStats.reduce(
      (acc, s) => ({
        fsa: acc.fsa + s.fsa,
        poh: acc.poh + s.poh,
        ser: acc.ser + s.ser,
        por: acc.por + s.por,
        ref: acc.ref + s.ref,
        bj: acc.bj + s.bj,
        newFsa: acc.newFsa + s.newFsa,
        newPoh: acc.newPoh + s.newPoh,
        newSer: acc.newSer + s.newSer,
        newPor: acc.newPor + s.newPor,
      }),
      { fsa: 0, poh: 0, ser: 0, por: 0, ref: 0, bj: 0, newFsa: 0, newPoh: 0, newSer: 0, newPor: 0 },
    );

    teamBody.push([
      "CELKEM",
      "",
      totals.fsa,
      totals.poh,
      totals.ser,
      totals.por,
      totals.ref,
      totals.bj,
      totals.newFsa,
      totals.newPoh,
      totals.newSer,
      totals.newPor,
    ]);

    const startY2 = teamStartY > doc.internal.pageSize.getHeight() - 40 ? 20 : teamStartY + 4;

    autoTable(doc, {
      startY: startY2,
      head: [["Jméno", "Role", "FSA", "POH", "SER", "POR", "Dop.", "BJ", "+FSA", "+POH", "+SER", "+POR"]],
      body: teamBody,
      theme: "grid",
      headStyles: { fillColor: [0, 85, 95], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 }, 1: { cellWidth: 28 } },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        // Bold totals row
        if (data.row.index === teamBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 245, 246];
        }
      },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(
      `Strana ${i} z ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  // Download
  const filename = `legatus_${period === "week" ? "tyden" : "mesic"}_${periodFrom}_${userName.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
