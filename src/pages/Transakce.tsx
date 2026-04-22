import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Coins, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { AddTransactionModal } from "@/components/AddTransactionModal";

const PAGE_SIZE = 100;

export type TransactionRow = {
  source: "meeting" | "manual";
  source_id: string;
  user_id: string;
  user_name: string;
  date: string;
  meeting_type: string | null;
  case_name: string | null;
  bj: number;
  poznamka: string | null;
};

export default function Transakce() {
  const { godMode, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["transakce_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, is_active");
      return data || [];
    },
    enabled: godMode && isAdmin,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; is_active: boolean }>();
    profiles.forEach((p) => m.set(p.id, { name: p.full_name, is_active: p.is_active ?? true }));
    return m;
  }, [profiles]);

  const { data: meetings = [], isLoading: loadingMeetings } = useQuery({
    queryKey: ["transakce_meetings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_meetings")
        .select("id, user_id, date, meeting_type, case_name, podepsane_bj, poznamka, cancelled")
        .order("date", { ascending: false })
        .limit(5000);
      return (data || []).filter((m) => !m.cancelled);
    },
    enabled: godMode && isAdmin,
  });

  const { data: manuals = [], isLoading: loadingManuals } = useQuery({
    queryKey: ["transakce_manuals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_bj_adjustments")
        .select("id, user_id, date, bj, poznamka")
        .order("date", { ascending: false })
        .limit(5000);
      return data || [];
    },
    enabled: godMode && isAdmin,
  });

  const allRows = useMemo<TransactionRow[]>(() => {
    const meetingRows: TransactionRow[] = meetings.map((m) => ({
      source: "meeting",
      source_id: m.id,
      user_id: m.user_id,
      user_name: profileMap.get(m.user_id)?.name || "—",
      date: m.date,
      meeting_type: m.meeting_type,
      case_name: m.case_name,
      bj: Number(m.podepsane_bj) || 0,
      poznamka: m.poznamka,
    }));
    const manualRows: TransactionRow[] = manuals.map((m) => ({
      source: "manual",
      source_id: m.id,
      user_id: m.user_id,
      user_name: profileMap.get(m.user_id)?.name || "—",
      date: m.date,
      meeting_type: "MANUAL",
      case_name: null,
      bj: Number(m.bj) || 0,
      poznamka: m.poznamka,
    }));
    return [...meetingRows, ...manualRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [meetings, manuals, profileMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!showInactive) {
        const pi = profileMap.get(r.user_id);
        if (pi && !pi.is_active) return false;
      }
      if (!q) return true;
      return (
        r.user_name.toLowerCase().includes(q) ||
        (r.meeting_type || "").toLowerCase().includes(q) ||
        (r.case_name || "").toLowerCase().includes(q) ||
        r.date.includes(q) ||
        format(parseISO(r.date), "d.M.yyyy").includes(q)
      );
    });
  }, [allRows, search, showInactive, profileMap]);

  if (!godMode || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalBj = filtered.reduce((s, r) => s + r.bj, 0);

  // Reset page when filters change
  if (page > 0 && page >= totalPages) {
    setPage(0);
  }

  const isLoading = loadingMeetings || loadingManuals;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Coins className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 26, color: "var(--text-primary)" }}>
            Transakce
          </h1>
          <span className="text-sm text-muted-foreground">
            {filtered.length} záznamů · {totalBj.toFixed(1)} BJ
          </span>
        </div>
        <Button
          onClick={() => setAdding(true)}
          style={{ background: "#fc7c71", color: "#fff" }}
          className="hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Přidat záznam
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat podle typu, data, případu, jména…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-10"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Zobrazit deaktivované
        </label>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground p-4">Načítání…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Datum</th>
                  <th className="text-left p-3 font-medium">Uživatel</th>
                  <th className="text-left p-3 font-medium">Typ</th>
                  <th className="text-left p-3 font-medium">Byznys případ</th>
                  <th className="text-right p-3 font-medium">BJ</th>
                  <th className="text-left p-3 font-medium">Zdroj</th>
                  <th className="text-right p-3 font-medium">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Žádné záznamy odpovídající hledání.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const pi = profileMap.get(r.user_id);
                    return (
                      <tr key={`${r.source}-${r.source_id}`} className="hover:bg-muted/30">
                        <td className="p-3 whitespace-nowrap">
                          {format(parseISO(r.date), "d.M.yyyy", { locale: cs })}
                        </td>
                        <td className="p-3">
                          <span className={pi && !pi.is_active ? "text-muted-foreground line-through" : ""}>
                            {r.user_name}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {r.meeting_type || "—"}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">
                          {r.case_name || "—"}
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {r.bj.toFixed(1)}
                        </td>
                        <td className="p-3">
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{
                              background: r.source === "manual" ? "rgba(252,124,113,0.12)" : "rgba(0,171,189,0.12)",
                              color: r.source === "manual" ? "#fc7c71" : "#00abbd",
                            }}
                          >
                            {r.source === "manual" ? "Ruční" : "Schůzka"}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(r)}
                            className="h-7 text-xs"
                          >
                            Upravit
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Strana {page + 1} z {totalPages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <TransactionDetailModal
          transaction={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <AddTransactionModal
          profiles={profiles.filter((p) => p.is_active !== false)}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
