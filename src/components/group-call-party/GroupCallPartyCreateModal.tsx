import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Search, Loader2, X } from "lucide-react";

type Preset = "direct" | "subtree" | "garant" | "workspace" | null;

interface Profile {
  id: string;
  full_name: string;
  vedouci_id: string | null;
  garant_id: string | null;
  org_unit_id: string | null;
}

export function GroupCallPartyCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5 - (d.getMinutes() % 5));
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState<string>(""); // empty = open
  const [callsGoal, setCallsGoal] = useState<string>("100");
  const [meetingsGoal, setMeetingsGoal] = useState<string>("10");
  const [allowExternal, setAllowExternal] = useState(false);
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<Preset>(null);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Load workspace peers + my org_unit_id
  const { data: peers = [] } = useQuery({
    queryKey: ["workspace_peers_for_party", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, vedouci_id, garant_id, org_unit_id")
        .neq("id", profile!.id);
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: myOrgUnit = null } = useQuery({
    queryKey: ["my_org_unit", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_unit_id").eq("id", profile!.id).maybeSingle();
      return (data?.org_unit_id ?? null) as string | null;
    },
  });

  const presetIds = useMemo(() => {
    if (!profile) return new Set<string>();
    if (!preset) return new Set<string>();
    const ids = new Set<string>();
    if (preset === "direct") {
      peers.filter((p) => p.vedouci_id === profile.id).forEach((p) => ids.add(p.id));
    } else if (preset === "subtree") {
      // BFS through vedouci_id chain
      const byVedouci = new Map<string, string[]>();
      peers.forEach((p) => {
        if (p.vedouci_id) {
          const arr = byVedouci.get(p.vedouci_id) || [];
          arr.push(p.id);
          byVedouci.set(p.vedouci_id, arr);
        }
      });
      const queue = [profile.id];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const child of byVedouci.get(cur) || []) {
          if (!ids.has(child)) {
            ids.add(child);
            queue.push(child);
          }
        }
      }
    } else if (preset === "garant") {
      peers.filter((p) => p.garant_id === profile.id).forEach((p) => ids.add(p.id));
    } else if (preset === "workspace") {
      peers.filter((p) => p.org_unit_id && p.org_unit_id === myOrgUnit).forEach((p) => ids.add(p.id));
    }
    return ids;
  }, [preset, peers, profile]);

  const allSelectedIds = useMemo(() => {
    const s = new Set<string>(presetIds);
    manualSelected.forEach((id) => s.add(id));
    return s;
  }, [presetIds, manualSelected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return peers
      .filter((p) => !q || p.full_name.toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [peers, search]);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nepřihlášen");
      if (!name.trim()) throw new Error("Zadej název");
      const goals: any = {};
      if (callsGoal) goals.calls = Number(callsGoal);
      if (meetingsGoal) goals.meetings = Number(meetingsGoal);

      const { data: party, error } = await supabase
        .from("group_call_parties")
        .insert({
          name: name.trim(),
          host_id: profile.id,
          org_unit_id: myOrgUnit ?? null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          planned_duration_min: duration ? Number(duration) : null,
          goals,
          allow_external: allowExternal,
          notes: notes.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Insert host as participant
      const participantRows: any[] = [
        { party_id: party.id, user_id: profile.id, invited_via: "host", role: "host" },
      ];
      // Invited via preset
      presetIds.forEach((uid) =>
        participantRows.push({
          party_id: party.id,
          user_id: uid,
          invited_via: preset === "direct" ? "preset_direct"
            : preset === "subtree" ? "preset_subtree"
            : preset === "garant" ? "preset_garant"
            : "preset_workspace",
          role: "caller",
        }),
      );
      // Manually added (excluding any already in preset)
      manualSelected.forEach((uid) => {
        if (!presetIds.has(uid)) {
          participantRows.push({ party_id: party.id, user_id: uid, invited_via: "manual", role: "caller" });
        }
      });

      // Use upsert to dedupe
      const { error: pErr } = await supabase
        .from("group_call_party_participants")
        .upsert(participantRows, { onConflict: "party_id,user_id" });
      if (pErr) throw pErr;

      // Push notifications via notifications table (existing trigger sends pushes)
      const recipients = participantRows.filter((r) => r.user_id !== profile.id);
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((r) => ({
            recipient_id: r.user_id,
            sender_id: profile.id,
            trigger_event: "group_call_party_invite",
            title: "Pozvánka na Skupinovou Call Party",
            body: `${profile.full_name} tě zve na "${party.name}"`,
            link_url: `/call-party?party=${party.id}`,
            icon: "phone-call",
            accent_color: "#fc7c71",
          })),
        );
      }

      return party.id as string;
    },
    onSuccess: (id) => {
      toast.success("Party vytvořena");
      qc.invalidateQueries({ queryKey: ["my_group_parties"] });
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const presetButtons: { key: Exclude<Preset, null>; label: string }[] = [
    { key: "direct", label: "Moje přímá struktura" },
    { key: "subtree", label: "Celá moje struktura" },
    { key: "garant", label: "Moji nováčci" },
    { key: "workspace", label: "Celý workspace" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: "#00abbd" }} />
            Nová Skupinová Call Party
          </DialogTitle>
          <DialogDescription>Pozvi tým, nastav cíle a naskoč.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="gp-name">Název *</Label>
            <Input id="gp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pondělní call party" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="gp-when">Plánovaný start</Label>
              <Input id="gp-when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="gp-dur">Délka (min, volitelné)</Label>
              <Input id="gp-dur" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Otevřená" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cíl: hovorů</Label>
              <Input type="number" min="0" value={callsGoal} onChange={(e) => setCallsGoal(e.target.value)} />
            </div>
            <div>
              <Label>Cíl: domluvených</Label>
              <Input type="number" min="0" value={meetingsGoal} onChange={(e) => setMeetingsGoal(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Povolit připojení odkazem mimo workspace</Label>
                <p className="text-[11px] text-muted-foreground">Kdokoli s odkazem/QR se může připojit.</p>
              </div>
              <Switch checked={allowExternal} onCheckedChange={setAllowExternal} />
            </div>
          </div>

          <div>
            <Label>Pozvánky — rychlé skupiny</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {presetButtons.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setPreset(preset === b.key ? null : b.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: preset === b.key ? "#00abbd" : "rgba(0,171,189,0.08)",
                    color: preset === b.key ? "#fff" : "#00555f",
                    border: "1px solid #00abbd33",
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Vybráno: {allSelectedIds.size} {allSelectedIds.size === 1 ? "osoba" : allSelectedIds.size >= 2 && allSelectedIds.size <= 4 ? "osoby" : "osob"}
            </p>
          </div>

          <div>
            <Label>Manuální výběr</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat…" />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">Nikdo nenalezen</div>
              ) : (
                filtered.map((p) => {
                  const inPreset = presetIds.has(p.id);
                  const checked = allSelectedIds.has(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                      <Checkbox
                        checked={checked}
                        disabled={inPreset}
                        onCheckedChange={(v) => {
                          setManualSelected((s) => {
                            const ns = new Set(s);
                            if (v) ns.add(p.id); else ns.delete(p.id);
                            return ns;
                          });
                        }}
                      />
                      <span className="flex-1">{p.full_name}</span>
                      {inPreset && <span className="text-[10px] text-muted-foreground">přes skupinu</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="gp-notes">Poznámka</Label>
            <Textarea id="gp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Zrušit</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !name.trim()}
            style={{ background: "#fc7c71", color: "#fff" }}
            className="hover:opacity-90"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vytvořit party"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
