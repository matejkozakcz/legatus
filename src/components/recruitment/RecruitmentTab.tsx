import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  RecruitmentStage,
  RECRUITMENT_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  computeRecruitmentFunnel,
  CandidateRow,
} from "@/lib/recruitmentFunnel";
import { CandidateDetailModal } from "./CandidateDetailModal";

interface Profile {
  id: string;
  role: string;
}

interface CandidateListRow extends CandidateRow {
  full_name: string;
  phone: string | null;
  owner_id: string;
}

/**
 * Záložka „Nábor" v Můj byznys.
 * Zobrazí kandidáty mé struktury (nebo jen přímé) seskupené podle fáze.
 */
export function RecruitmentTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"direct" | "subtree">("direct");
  const [filter, setFilter] = useState<RecruitmentStage | "ALL">("ALL");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);

  const { data: meProfile } = useQuery({
    queryKey: ["my_profile_role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, role, org_unit_id").eq("id", user!.id).maybeSingle();
      return data as any;
    },
  });

  const isLeader = meProfile?.role === "vedouci" || meProfile?.role === "budouci_vedouci";

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["recruitment_candidates_list", user?.id, scope],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("recruitment_candidates" as any)
        .select("id, full_name, phone, current_stage, stage_changed_at, created_at, owner_id, registered_profile_id")
        .order("stage_changed_at", { ascending: false });

      if (scope === "direct" || !isLeader) {
        q = q.eq("owner_id", user!.id);
      }
      // pro subtree spoléháme na RLS (vedouci subtree policy)

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CandidateListRow[];
    },
  });

  const summary = useMemo(() => computeRecruitmentFunnel(candidates), [candidates]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return candidates;
    return candidates.filter((c) => c.current_stage === filter);
  }, [candidates, filter]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user || !meProfile?.org_unit_id || !newName.trim()) return;
      const { error } = await supabase.from("recruitment_candidates" as any).insert({
        org_unit_id: meProfile.org_unit_id,
        owner_id: user.id,
        full_name: newName.trim(),
        phone: newPhone.trim() || null,
        current_stage: "NAB",
        stage_history: [{ stage: "NAB", at: new Date().toISOString(), by: user.id }],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kandidát přidán");
      setCreating(false);
      setNewName("");
      setNewPhone("");
      qc.invalidateQueries({ queryKey: ["recruitment_candidates_list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  return (
    <div className="space-y-4">
      {/* Souhrn */}
      <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, rgba(0,171,189,0.08), rgba(0,85,95,0.05))", border: "1px solid rgba(0,171,189,0.18)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-sm font-bold" style={{ color: "#00555f" }}>
            <Users className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            Náborová cesta
          </h3>
          <span className="text-xs text-muted-foreground">
            Aktivních: <strong style={{ color: "#00abbd" }}>{summary.active}</strong> · Konverze: <strong style={{ color: "#fc7c71" }}>{summary.conversion}%</strong>
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {RECRUITMENT_STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "ALL" : s)}
              className="flex flex-col items-center p-1.5 rounded-lg transition-colors"
              style={{
                background: filter === s ? `${STAGE_COLORS[s]}1f` : "transparent",
                border: `1px solid ${filter === s ? STAGE_COLORS[s] : "transparent"}`,
              }}
            >
              <span className="text-base font-bold" style={{ color: STAGE_COLORS[s] }}>{summary.byStage[s]}</span>
              <span className="text-[9px] uppercase font-semibold" style={{ color: "#6b8a8f" }}>{STAGE_LABELS[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtry */}
      <div className="flex items-center gap-2">
        {isLeader && (
          <div className="flex rounded-lg overflow-hidden border border-input text-xs">
            <button
              onClick={() => setScope("direct")}
              className="px-3 h-8 font-semibold"
              style={{ background: scope === "direct" ? "#00abbd" : "transparent", color: scope === "direct" ? "#fff" : "#6b8a8f" }}
            >
              Moji přímí
            </button>
            <button
              onClick={() => setScope("subtree")}
              className="px-3 h-8 font-semibold"
              style={{ background: scope === "subtree" ? "#00abbd" : "transparent", color: scope === "subtree" ? "#fff" : "#6b8a8f" }}
            >
              Celá struktura
            </button>
          </div>
        )}
        {filter !== "ALL" && (
          <button onClick={() => setFilter("ALL")} className="text-xs text-muted-foreground underline">
            Zrušit filtr
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white"
          style={{ background: "#fc7c71" }}
        >
          <Plus className="h-3.5 w-3.5" /> Nový kandidát
        </button>
      </div>

      {creating && (
        <div className="rounded-lg border border-input p-3 space-y-2 bg-background">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Jméno a příjmení"
            autoFocus
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Telefon (nepovinné)"
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              className="flex-1 h-9 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#00abbd" }}
            >
              Přidat
            </button>
            <button
              onClick={() => setCreating(false)}
              className="h-9 px-4 rounded-md text-sm font-semibold border border-input"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Seznam */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8 text-sm">Načítám…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          {filter === "ALL" ? "Zatím žádní kandidáti." : `Ve fázi ${STAGE_LABELS[filter as RecruitmentStage]} nikdo není.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenCandidateId(c.id)}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.full_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.phone ?? "—"} · poslední změna {format(new Date(c.stage_changed_at), "d. M.", { locale: cs })}
                </div>
              </div>
              <span
                className="px-2 py-1 rounded-full text-[10px] font-bold uppercase ml-2"
                style={{ background: `${STAGE_COLORS[c.current_stage]}1f`, color: STAGE_COLORS[c.current_stage] }}
              >
                {STAGE_LABELS[c.current_stage]}
              </span>
            </button>
          ))}
        </div>
      )}

      {openCandidateId && (
        <CandidateDetailModal
          candidateId={openCandidateId}
          open={!!openCandidateId}
          onClose={() => setOpenCandidateId(null)}
        />
      )}
    </div>
  );
}
