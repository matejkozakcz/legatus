import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { AdminMeetingModal, MeetingRecord } from "./AdminMeetingModal";

const PAGE_SIZE = 100;

export function SchuzkyTab() {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MeetingRecord | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin_meetings_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, is_active");
      return data || [];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; is_active: boolean }>();
    profiles.forEach((p) =>
      m.set(p.id, { name: p.full_name, is_active: p.is_active ?? true })
    );
    return m;
  }, [profiles]);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["admin_meetings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_meetings")
        .select(
          "id, user_id, date, meeting_type, case_name, podepsane_bj, potencial_bj, cancelled, poznamka, doporuceni_fsa, doporuceni_poradenstvi, doporuceni_pohovor, has_poradenstvi, has_pohovor"
        )
        .order("date", { ascending: false })
        .limit(5000);
      return (data || []) as MeetingRecord[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (!showInactive) {
        const pi = profileMap.get(m.user_id);
        if (pi && !pi.is_active) return false;
      }
      if (!showCancelled && m.cancelled) return false;
      if (!q) return true;
      const userName = profileMap.get(m.user_id)?.name || "";
      return (
        userName.toLowerCase().includes(q) ||
        (m.meeting_type || "").toLowerCase().includes(q) ||
        (m.case_name || "").toLowerCase().includes(q) ||
        m.date.includes(q) ||
        format(parseISO(m.date), "d.M.yyyy").includes(q)
      );
    });
  }, [meetings, search, showInactive, showCancelled, profileMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalBj = filtered.reduce(
    (s, r) => s + (r.cancelled ? 0 : Number(r.podepsane_bj) || 0),
    0
  );

  if (page > 0 && page >= totalPages) setPage(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {filtered.length} schůzek · {totalBj.toFixed(1)} BJ podepsáno
        </span>
        <Button
          onClick={() => setAdding(true)}
          style={{ background: "#fc7c71", color: "#fff" }}
          className="hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Přidat schůzku
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
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => {
              setShowCancelled(e.target.checked);
              setPage(0);
            }}
            className="h-4 w-4 rounded border-border"
          />
          Zobrazit zrušené
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
                  <th className="text-left p-3 font-medium">Stav</th>
                  <th className="text-right p-3 font-medium">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Žádné schůzky odpovídající hledání.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((m) => {
                    const pi = profileMap.get(m.user_id);
                    return (
                      <tr key={m.id} className="hover:bg-muted/30">
                        <td className="p-3 whitespace-nowrap">
                          {format(parseISO(m.date), "d.M.yyyy", { locale: cs })}
                        </td>
                        <td className="p-3">
                          <span
                            className={
                              pi && !pi.is_active ? "text-muted-foreground line-through" : ""
                            }
                          >
                            {pi?.name || "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {m.meeting_type}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">
                          {m.case_name || "—"}
                        </td>
                        <td className="p-3 text-right font-medium tabular-nums">
                          {Number(m.podepsane_bj).toFixed(1)}
                        </td>
                        <td className="p-3">
                          {m.cancelled ? (
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{
                                background: "rgba(252,124,113,0.12)",
                                color: "#fc7c71",
                              }}
                            >
                              Zrušená
                            </span>
                          ) : (
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{
                                background: "rgba(0,171,189,0.12)",
                                color: "#00abbd",
                              }}
                            >
                              Aktivní
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(m)}
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
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

      {(editing || adding) && (
        <AdminMeetingModal
          meeting={editing}
          profiles={profiles.filter((p) => showInactive || p.is_active !== false)}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
