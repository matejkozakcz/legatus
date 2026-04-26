import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { cs } from "date-fns/locale";
import { getProductionPeriodForMonth, getProductionPeriodMonth } from "@/lib/productionPeriod";
import { OPEN_SANS_REGULAR, OPEN_SANS_BOLD } from "@/lib/fonts";
import { computeMeetingStats } from "@/lib/meetingStats";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeetingRow {
  meeting_type: string;
  cancelled: boolean;
  date: string;
  created_at: string;
  outcome_recorded: boolean;
  doporuceni_fsa: number;
  doporuceni_poradenstvi: number;
  doporuceni_pohovor: number;
  podepsane_bj: number;
  info_pocet_lidi?: number | null;
  info_zucastnil_se?: boolean | null;
  user_id?: string;
}

interface PersonStats {
  name: string;
  role: string;
  // Planned (all non-cancelled in period)
  planFsa: number;
  planPoh: number;
  planSer: number;
  planPor: number;
  // Done (past, non-cancelled)
  fsa: number;
  poh: number;
  ser: number;
  por: number;
  ref: number;
  bj: number;
  bjFsa: number;
  bjSer: number;
  // Newly booked
  newFsa: number;
  newPoh: number;
  newSer: number;
  newPor: number;
  // INFO / POST
  infoCount: number;
  infoNovi: number;
  infoStaracci: number;
  postCount: number;
  postNovi: number;
  postStaracci: number;
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
  // Single source of truth for planned/actual counts of FSA/POH/SER/POR + ref.
  const stats = computeMeetingStats(meetings, todayStr);

  // BJ — počítáme jen z potvrzených (proběhlých) schůzek, stejně jako ref v computeMeetingStats.
  const confirmed = meetings.filter((m) => !m.cancelled && m.outcome_recorded === true);
  const bj = confirmed.reduce((acc, m) => acc + (Number(m.podepsane_bj) || 0), 0);
  const bjFsa = confirmed
    .filter((m) => m.meeting_type === "FSA")
    .reduce((acc, m) => acc + (Number(m.podepsane_bj) || 0), 0);
  const bjSer = confirmed
    .filter((m) => m.meeting_type === "SER")
    .reduce((acc, m) => acc + (Number(m.podepsane_bj) || 0), 0);

  // Newly booked — schůzky vytvořené v daném období (bez ohledu na potvrzení).
  const active = meetings.filter((m) => !m.cancelled);
  const newlyBooked = active.filter((m) => {
    const created = m.created_at?.slice(0, 10);
    return created && created >= periodFrom && created <= periodTo;
  });

  const infoRows = active.filter((m) => m.meeting_type === "INFO");
  const postRows = active.filter((m) => m.meeting_type === "POST");
  const sumNovi = (arr: MeetingRow[]) => arr.reduce((s, r) => s + (Number(r.info_pocet_lidi) || 0), 0);
  const uniqAttended = (arr: MeetingRow[]) => {
    const ids = new Set<string>();
    for (const r of arr) if (r.info_zucastnil_se === true && r.user_id) ids.add(r.user_id);
    return ids.size;
  };

  return {
    name,
    role,
    planFsa: stats.fsa.planned,
    planPoh: stats.poh.planned,
    planSer: stats.ser.planned,
    planPor: stats.por.planned,
    fsa: stats.fsa.actual,
    poh: stats.poh.actual,
    ser: stats.ser.actual,
    por: stats.por.actual,
    ref: stats.ref.actual,
    bj,
    bjFsa,
    bjSer,
    newFsa: newlyBooked.filter((m) => m.meeting_type === "FSA").length,
    newPoh: newlyBooked.filter((m) => m.meeting_type === "POH").length,
    newSer: newlyBooked.filter((m) => m.meeting_type === "SER").length,
    newPor: newlyBooked.filter((m) => m.meeting_type === "POR").length,
    infoCount: infoRows.length,
    infoNovi: sumNovi(infoRows),
    infoStaracci: uniqAttended(infoRows),
    postCount: postRows.length,
    postNovi: sumNovi(postRows),
    postStaracci: uniqAttended(postRows),
  };
}

const ROLE_LABEL: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("OpenSans-Regular.ttf", OPEN_SANS_REGULAR);
  doc.addFileToVFS("OpenSans-Bold.ttf", OPEN_SANS_BOLD);
  doc.addFont("OpenSans-Regular.ttf", "OpenSans", "normal");
  doc.addFont("OpenSans-Bold.ttf", "OpenSans", "bold");
  doc.setFont("OpenSans", "normal");
}

const DEFAULT_HEAD_FILL: [number, number, number] = [0, 85, 95];
const TOTALS_FILL: [number, number, number] = [240, 245, 246];

interface PdfConfig {
  company_name: string;
  orientation: "landscape" | "portrait";
  head_color: [number, number, number];
  show_planned: boolean;
  show_completed: boolean;
  show_newly_booked: boolean;
}

async function fetchPdfConfig(): Promise<PdfConfig> {
  const { data } = await supabase.from("app_config").select("value").eq("key", "pdf_export").single();
  const val = data?.value as unknown as PdfConfig | null;
  return (
    val ?? {
      company_name: "LEGATUS",
      orientation: "landscape",
      head_color: DEFAULT_HEAD_FILL,
      show_planned: true,
      show_completed: true,
      show_newly_booked: true,
    }
  );
}

// ─── Main export function ────────────────────────────────────────────────────

export type ExportPeriod = "week" | "month";

export async function exportDashboardPdf(
  userId: string,
  userRole: string,
  userName: string,
  period: ExportPeriod,
  selectedYear?: number,
  selectedMonth?: number,
  viewerRole?: string,
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
    const pm =
      selectedYear && selectedMonth
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
    .select(
      "user_id, meeting_type, cancelled, date, created_at, outcome_recorded, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj, info_pocet_lidi, info_zucastnil_se",
    )
    .eq("user_id", userId)
    .gte("date", periodFrom)
    .lte("date", periodTo);

  const ownStats = computePersonStats(ownMeetings as MeetingRow[], todayStr, periodFrom, periodTo, userName, userRole);

  // Fetch team members — V/BV viewers always see subordinates of the target user
  const viewerIsTopLeader = ["vedouci", "budouci_vedouci"].includes(viewerRole || "");
  const targetIsLeader = ["vedouci", "budouci_vedouci", "garant"].includes(userRole);
  const showTeam = targetIsLeader || viewerIsTopLeader;
  let teamStats: PersonStats[] = [];

  if (showTeam) {
    let subordinateQuery = supabase.from("profiles").select("id, full_name, role").eq("is_active", true);

    if (userRole === "vedouci" || userRole === "budouci_vedouci") {
      subordinateQuery = subordinateQuery.eq("vedouci_id", userId);
    } else if (userRole === "garant") {
      subordinateQuery = subordinateQuery.eq("garant_id", userId);
    } else if (viewerIsTopLeader) {
      // Target is získatel/nováček — find people under them as ziskatel
      subordinateQuery = subordinateQuery.eq("ziskatel_id", userId);
    }

    const { data: subordinates = [] } = await subordinateQuery;

    if (subordinates && subordinates.length > 0) {
      const subIds = subordinates.map((s: any) => s.id);
      const { data: teamMeetings = [] } = await supabase
        .from("client_meetings")
        .select(
          "user_id, meeting_type, cancelled, date, created_at, outcome_recorded, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, podepsane_bj, info_pocet_lidi, info_zucastnil_se",
        )
        .in("user_id", subIds)
        .gte("date", periodFrom)
        .lte("date", periodTo);

      for (const sub of subordinates) {
        const subMeetings = (teamMeetings || []).filter((m: any) => m.user_id === sub.id) as MeetingRow[];
        teamStats.push(computePersonStats(subMeetings, todayStr, periodFrom, periodTo, sub.full_name, sub.role));
      }
      teamStats.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    }
  }

  // ── Fetch PDF config ────────────────────────────────────────────────────
  const pdfCfg = await fetchPdfConfig();
  const HEAD_FILL = pdfCfg.head_color as [number, number, number];

  const doc = new jsPDF({ orientation: pdfCfg.orientation, unit: "mm", format: "a4" });
  registerFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const fontName = "OpenSans";

  // Header
  doc.setFontSize(18);
  doc.setFont(fontName, "bold");
  doc.text(pdfCfg.company_name, 14, 16);
  doc.setFontSize(10);
  doc.setFont(fontName, "normal");
  doc.setTextColor(120);
  doc.text(periodLabel, 14, 23);
  doc.text(`Vygenerováno: ${format(now, "d. M. yyyy HH:mm", { locale: cs })}`, pageWidth - 14, 23, { align: "right" });
  doc.setTextColor(0);

  // ── Helper: build dynamic column groups based on config ─────────────────
  type ColGroup = { label: string; cols: string[]; values: (s: PersonStats) => (string | number)[] };
  const groups: ColGroup[] = [];
  if (pdfCfg.show_planned)
    groups.push({
      label: "Naplánované",
      cols: ["Analýzy", "Pohovory", "Servisy", "Poradenství"],
      values: (s) => [s.planFsa, s.planPoh, s.planSer, s.planPor],
    });
  if (pdfCfg.show_completed)
    groups.push({
      label: "Proběhlé",
      cols: ["Analýzy", "Pohovory", "Servisy", "Poradenství", "Doporučení", "BJ FSA", "BJ SER", "BJ celkem"],
      values: (s) => [s.fsa, s.poh, s.ser, s.por, s.ref, s.bjFsa, s.bjSer, s.bj],
    });
  if (pdfCfg.show_newly_booked)
    groups.push({
      label: "Nově domluvené",
      cols: ["Analýzy", "Pohovory", "Servisy", "Poradenství"],
      values: (s) => [s.newFsa, s.newPoh, s.newSer, s.newPor],
    });

  // ── Personal stats ──────────────────────────────────────────────────────

  doc.setFontSize(13);
  doc.setFont(fontName, "bold");
  doc.text(`Moje aktivity — ${userName}`, 14, 34);

  if (groups.length > 0) {
    const ownHeadRow1 = groups.map((g) => ({ content: g.label, colSpan: g.cols.length }));
    const ownHeadRow2 = groups.flatMap((g) => g.cols);
    const ownBodyRow = groups.flatMap((g) => g.values(ownStats));

    autoTable(doc, {
      startY: 38,
      head: [ownHeadRow1, ownHeadRow2],
      body: [ownBodyRow],
      theme: "grid",
      styles: { font: fontName },
      headStyles: {
        fillColor: HEAD_FILL,
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        font: fontName,
      },
      bodyStyles: { fontSize: 9, font: fontName, halign: "center" },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Týdenní rozpis (osobní) — mirrors the on-screen table in MemberActivity ──
  // Show only weeks fully inside the period so that totals match the cards above.
  const { data: weekRecords = [] } = await supabase
    .from("activity_records")
    .select("week_start, fsa_actual, ser_actual, poh_actual, por_actual, ref_actual, bj_fsa_actual, bj_ser_actual, bj")
    .eq("user_id", userId)
    .gte("week_start", periodFrom)
    .lte("week_start", periodTo);

  type WeekRow = {
    week_start: string;
    fsa_actual: number | null;
    ser_actual: number | null;
    poh_actual: number | null;
    por_actual: number | null;
    ref_actual: number | null;
    bj_fsa_actual: number | null;
    bj_ser_actual: number | null;
    bj: number | null;
  };
  const weekRows = ((weekRecords || []) as WeekRow[])
    .filter((r) => {
      // Only weeks whose entire Mon–Sun window falls inside the production period
      const ws = new Date(r.week_start + "T00:00:00");
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      return format(ws, "yyyy-MM-dd") >= periodFrom && format(we, "yyyy-MM-dd") <= periodTo;
    })
    .sort((a, b) => a.week_start.localeCompare(b.week_start));

  if (weekRows.length > 0) {
    const lastY = (doc as any).lastAutoTable?.finalY || 60;
    let weekStartY = lastY + 10;
    if (weekStartY > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      weekStartY = 16;
    }

    doc.setFontSize(12);
    doc.setFont(fontName, "bold");
    doc.text("Týdenní rozpis", 14, weekStartY);

    const weekHead = [
      "Týden",
      "Analýzy",
      "Poradka",
      "Pohovory",
      "Poradenství",
      "Doporučení",
      "BJ FSA",
      "BJ SER",
      "BJ celkem",
    ];
    const sums = { fsa: 0, ser: 0, poh: 0, por: 0, ref: 0, bjFsa: 0, bjSer: 0, bj: 0 };
    const weekBody: any[] = weekRows.map((r, i) => {
      const fsa = r.fsa_actual || 0;
      const ser = r.ser_actual || 0;
      const poh = r.poh_actual || 0;
      const por = r.por_actual || 0;
      const ref = r.ref_actual || 0;
      const bjFsa = Number(r.bj_fsa_actual) || 0;
      const bjSer = Number(r.bj_ser_actual) || 0;
      const bj = Number(r.bj) || 0;
      sums.fsa += fsa;
      sums.ser += ser;
      sums.poh += poh;
      sums.por += por;
      sums.ref += ref;
      sums.bjFsa += bjFsa;
      sums.bjSer += bjSer;
      sums.bj += bj;
      return [`Týden ${i + 1}`, fsa, ser, poh, por, ref, bjFsa, bjSer, bj];
    });
    weekBody.push(["Celkem", sums.fsa, sums.ser, sums.poh, sums.por, sums.ref, sums.bjFsa, sums.bjSer, sums.bj]);

    autoTable(doc, {
      startY: weekStartY + 4,
      head: [weekHead],
      body: weekBody,
      theme: "grid",
      styles: { font: fontName },
      headStyles: {
        fillColor: HEAD_FILL,
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        font: fontName,
      },
      bodyStyles: { fontSize: 9, font: fontName, halign: "center" },
      columnStyles: { 0: { fontStyle: "bold", halign: "left", cellWidth: 28 } },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === weekBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = TOTALS_FILL;
        }
      },
    });
  }

  // ── Team stats ──────────────────────────────────────────────────────────

  if (showTeam && teamStats.length > 0 && groups.length > 0) {
    const afterOwn2 = (doc as any).lastAutoTable?.finalY || 90;
    let teamStartY = afterOwn2 + 12;

    if (teamStartY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      teamStartY = 16;
    }

    doc.setFontSize(13);
    doc.setFont(fontName, "bold");
    doc.text("Výsledky týmu", 14, teamStartY);

    const teamBody = teamStats.map((s) => [
      s.name,
      ROLE_LABEL[s.role] || s.role,
      ...groups.flatMap((g) => g.values(s)),
    ]);

    // Totals row
    const zeroStats: PersonStats = {
      name: "",
      role: "",
      planFsa: 0,
      planPoh: 0,
      planSer: 0,
      planPor: 0,
      fsa: 0,
      poh: 0,
      ser: 0,
      por: 0,
      ref: 0,
      bj: 0,
      bjFsa: 0,
      bjSer: 0,
      newFsa: 0,
      newPoh: 0,
      newSer: 0,
      newPor: 0,
      infoCount: 0,
      infoNovi: 0,
      infoStaracci: 0,
      postCount: 0,
      postNovi: 0,
      postStaracci: 0,
    };
    const totals = teamStats.reduce<PersonStats>(
      (acc, s) => ({
        ...acc,
        planFsa: acc.planFsa + s.planFsa,
        planPoh: acc.planPoh + s.planPoh,
        planSer: acc.planSer + s.planSer,
        planPor: acc.planPor + s.planPor,
        fsa: acc.fsa + s.fsa,
        poh: acc.poh + s.poh,
        ser: acc.ser + s.ser,
        por: acc.por + s.por,
        ref: acc.ref + s.ref,
        bj: acc.bj + s.bj,
        bjFsa: acc.bjFsa + s.bjFsa,
        bjSer: acc.bjSer + s.bjSer,
        newFsa: acc.newFsa + s.newFsa,
        newPoh: acc.newPoh + s.newPoh,
        newSer: acc.newSer + s.newSer,
        newPor: acc.newPor + s.newPor,
        infoCount: acc.infoCount + s.infoCount,
        infoNovi: acc.infoNovi + s.infoNovi,
        infoStaracci: acc.infoStaracci + s.infoStaracci,
        postCount: acc.postCount + s.postCount,
        postNovi: acc.postNovi + s.postNovi,
        postStaracci: acc.postStaracci + s.postStaracci,
      }),
      zeroStats,
    );

    teamBody.push(["CELKEM", "", ...groups.flatMap((g) => g.values(totals))]);

    const teamHeadRow1: any[] = [
      { content: "Jméno", rowSpan: 2 },
      { content: "Role", rowSpan: 2 },
      ...groups.map((g) => ({ content: g.label, colSpan: g.cols.length })),
    ];
    const teamHeadRow2 = groups.flatMap((g) => g.cols);

    autoTable(doc, {
      startY: teamStartY + 4,
      head: [teamHeadRow1, teamHeadRow2],
      body: teamBody,
      theme: "grid",
      styles: { font: fontName },
      headStyles: {
        fillColor: HEAD_FILL,
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        font: fontName,
      },
      bodyStyles: { fontSize: 8, font: fontName },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 }, 1: { cellWidth: 28 } },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === teamBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = TOTALS_FILL;
        }
      },
    });
  }

  // ── INFO / POST stats — only for vedoucí / BV target ────────────────────
  const showInfoPost = userRole === "vedouci" || userRole === "budouci_vedouci";
  if (showInfoPost) {
    const lastY = (doc as any).lastAutoTable?.finalY || 60;
    let infoStartY = lastY + 12;
    if (infoStartY > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      infoStartY = 16;
    }

    doc.setFontSize(13);
    doc.setFont(fontName, "bold");
    doc.text("Info & Postinfo", 14, infoStartY);

    const infoHeadRow1: any[] = [
      { content: "", rowSpan: 2 },
      { content: "Info schůzky", colSpan: 3 },
      { content: "Postinfo", colSpan: 3 },
    ];
    const infoHeadRow2 = ["Schůzek", "Noví", "Staráčci", "Schůzek", "Noví", "Staráčci"];

    const infoBody: any[] = [
      [
        userName,
        ownStats.infoCount,
        ownStats.infoNovi,
        ownStats.infoStaracci,
        ownStats.postCount,
        ownStats.postNovi,
        ownStats.postStaracci,
      ],
    ];

    if (showTeam && teamStats.length > 0) {
      for (const s of teamStats) {
        infoBody.push([s.name, s.infoCount, s.infoNovi, s.infoStaracci, s.postCount, s.postNovi, s.postStaracci]);
      }
      const totInfoCount = teamStats.reduce((a, s) => a + s.infoCount, 0) + ownStats.infoCount;
      const totInfoNovi = teamStats.reduce((a, s) => a + s.infoNovi, 0) + ownStats.infoNovi;
      const totInfoStar = teamStats.reduce((a, s) => a + s.infoStaracci, 0) + ownStats.infoStaracci;
      const totPostCount = teamStats.reduce((a, s) => a + s.postCount, 0) + ownStats.postCount;
      const totPostNovi = teamStats.reduce((a, s) => a + s.postNovi, 0) + ownStats.postNovi;
      const totPostStar = teamStats.reduce((a, s) => a + s.postStaracci, 0) + ownStats.postStaracci;
      infoBody.push(["CELKEM", totInfoCount, totInfoNovi, totInfoStar, totPostCount, totPostNovi, totPostStar]);
    }

    autoTable(doc, {
      startY: infoStartY + 4,
      head: [infoHeadRow1, infoHeadRow2],
      body: infoBody,
      theme: "grid",
      styles: { font: fontName },
      headStyles: {
        fillColor: HEAD_FILL,
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        font: fontName,
      },
      bodyStyles: { fontSize: 9, font: fontName, halign: "center" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 50, halign: "left" } },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === infoBody.length - 1 && infoBody.length > 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = TOTALS_FILL;
        }
      },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(fontName, "normal");
    doc.setTextColor(160);
    doc.text(`Strana ${i} z ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
  }

  // Download
  const filename = `legatus_${period === "week" ? "tyden" : "mesic"}_${periodFrom}_${userName.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
