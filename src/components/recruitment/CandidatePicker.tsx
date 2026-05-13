import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Check } from "lucide-react";

interface Candidate {
  id: string;
  full_name: string;
  phone: string | null;
  current_stage: string;
}

interface Props {
  /** Aktuálně vybraní kandidáti */
  selectedIds: string[];
  /** Callback při změně výběru */
  onChange: (ids: string[]) => void;
  /** Pokud true, single select; jinak multi */
  single?: boolean;
  placeholder?: string;
}

/**
 * Vyhledávač kandidátů náboru (autocomplete) + tlačítko "Nový".
 * Pro výběr v Pohovor/Nábor (single) i Info/Postinfo (multi) modalech.
 */
export function CandidatePicker({ selectedIds, onChange, single, placeholder = "Vyhledat kandidáta…" }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: orgUnitId } = useQuery({
    queryKey: ["my_org_unit", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_unit_id").eq("id", user!.id).maybeSingle();
      return (data as any)?.org_unit_id as string | null;
    },
  });

  const { data: candidates = [], refetch } = useQuery({
    queryKey: ["recruitment_candidates_picker", orgUnitId],
    enabled: !!orgUnitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruitment_candidates" as any)
        .select("id, full_name, phone, current_stage")
        .neq("current_stage", "LOST")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Candidate[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 20);
    return candidates.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    ).slice(0, 20);
  }, [candidates, query]);

  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.includes(c.id)),
    [candidates, selectedIds],
  );

  const toggle = (id: string) => {
    if (single) {
      onChange(selectedIds[0] === id ? [] : [id]);
      setOpen(false);
      return;
    }
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const createCandidate = async () => {
    if (!user || !orgUnitId || !newName.trim()) return;
    const { data, error } = await supabase
      .from("recruitment_candidates" as any)
      .insert({
        org_unit_id: orgUnitId,
        owner_id: user.id,
        full_name: newName.trim(),
        phone: newPhone.trim() || null,
        current_stage: "CALL",
        stage_history: [{ stage: "CALL", at: new Date().toISOString(), by: user.id }],
      } as any)
      .select("id, full_name, phone, current_stage")
      .single();
    if (error || !data) return;
    setCreating(false);
    setNewName("");
    setNewPhone("");
    await refetch();
    if (single) onChange([(data as any).id]);
    else onChange([...selectedIds, (data as any).id]);
  };

  return (
    <div className="space-y-2">
      {/* Vybraní */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: "#00abbd", color: "#fff" }}
            >
              {c.full_name}
              <span style={{ opacity: 0.8 }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Vyhledávání */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full h-9 rounded-lg border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {open && (
        <div className="rounded-lg border border-input bg-background max-h-56 overflow-y-auto">
          {filtered.length === 0 && !creating && (
            <div className="p-3 text-xs text-muted-foreground">Žádný kandidát</div>
          )}
          {filtered.map((c) => {
            const sel = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span>
                  <span style={{ color: "var(--text-primary)" }}>{c.full_name}</span>
                  {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: "#00abbd" }}
                  >
                    {c.current_stage}
                  </span>
                  {sel && <Check className="h-4 w-4" style={{ color: "#00abbd" }} />}
                </span>
              </button>
            );
          })}
          {creating ? (
            <div className="p-2 border-t border-border space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jméno a příjmení"
                autoFocus
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Telefon (nepovinné)"
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createCandidate}
                  className="flex-1 h-8 rounded-md text-xs font-semibold text-white"
                  style={{ background: "#00abbd" }}
                >
                  Vytvořit
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="h-8 px-3 rounded-md text-xs font-semibold border border-input"
                >
                  Zrušit
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm border-t border-border hover:bg-accent"
              style={{ color: "#00abbd" }}
            >
              <Plus className="h-4 w-4" />
              Nový kandidát
            </button>
          )}
        </div>
      )}
    </div>
  );
}
