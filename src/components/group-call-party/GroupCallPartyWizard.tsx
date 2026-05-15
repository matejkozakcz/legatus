import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { QRCodeSVG } from "qrcode.react";
import {
  Users, Search, Loader2, ArrowLeft, ArrowRight, Copy, Check, Play, Crown, RotateCw, Calendar as CalendarIcon,
} from "lucide-react";
import { useGroupParty } from "@/hooks/useGroupParty";
import { GroupCallPartyRoom } from "./GroupCallPartyRoom";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";

type Preset = "direct" | "subtree" | "garant" | "workspace" | null;

interface ProfilePeer {
  id: string;
  full_name: string;
  vedouci_id: string | null;
  garant_id: string | null;
  org_unit_id: string | null;
}

interface Props {
  /** Existing party id (e.g. when re-entering a scheduled lobby), otherwise undefined for new wizard */
  initialPartyId?: string | null;
  onClose: () => void;
}

export function GroupCallPartyWizard({ initialPartyId = null, onClose }: Props) {
  const [partyId, setPartyId] = useState<string | null>(initialPartyId);

  // If we have a party id, jump straight to lobby/room (decided by status)
  if (partyId) {
    return <GroupPartyResolved partyId={partyId} onClose={onClose} />;
  }
  return <GroupSetupStep onCreated={setPartyId} onCancel={onClose} />;
}

// ─── Resolver: lobby (scheduled) vs. room (live/ended) ───────────────────────
function GroupPartyResolved({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const { party, isLoading } = useGroupParty(partyId);

  if (isLoading || !party) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00abbd" }} />
      </div>
    );
  }

  if (party.status === "scheduled") {
    return <GroupLobby partyId={partyId} onClose={onClose} />;
  }
  return <GroupCallPartyRoom partyId={partyId} onClose={onClose} />;
}

// ─── Step 1: Setup ───────────────────────────────────────────────────────────
function GroupSetupStep({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { profile } = useAuth();

  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5 - (d.getMinutes() % 5));
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState<string>("");
  const [callsGoal, setCallsGoal] = useState<string>("100");
  const [meetingsGoal, setMeetingsGoal] = useState<string>("10");
  const [allowExternal, setAllowExternal] = useState(false);

  const { data: myOrgUnit = null } = useQuery({
    queryKey: ["my_org_unit", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_unit_id").eq("id", profile!.id).maybeSingle();
      return (data?.org_unit_id ?? null) as string | null;
    },
  });

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
        })
        .select()
        .single();
      if (error) throw error;

      // Insert host as participant (idempotent)
      await supabase
        .from("group_call_party_participants")
        .upsert(
          [{ party_id: party.id, user_id: profile.id, invited_via: "host", role: "host" }],
          { onConflict: "party_id,user_id" },
        );

      return party.id as string;
    },
    onSuccess: (id) => {
      toast.success("Party vytvořena — pozvi tým");
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <StepHeader step={1} title="Nastavení skupinové party" />

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
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
            <Label htmlFor="gp-dur">Délka (min)</Label>
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

        <div className="rounded-lg border border-border p-3 flex items-center justify-between">
          <div>
            <Label className="text-sm">Povolit externí odkaz</Label>
            <p className="text-[11px] text-muted-foreground">Kdokoli s odkazem/QR se může připojit.</p>
          </div>
          <Switch checked={allowExternal} onCheckedChange={setAllowExternal} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Zpět</Button>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || !name.trim()}
          style={{ background: "#fc7c71", color: "#fff" }}
          className="gap-1.5 hover:opacity-90"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Pokračovat <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Lobby ───────────────────────────────────────────────────────────
function GroupLobby({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { party, participants, refetchAll } = useGroupParty(partyId);

  const [search, setSearch] = useState("");
  const [activePreset, setActivePreset] = useState<Preset>(null);
  const [copied, setCopied] = useState(false);
  const [scheduledAtDraft, setScheduledAtDraft] = useState<string>("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (party?.scheduled_at) {
      const d = new Date(party.scheduled_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      setScheduledAtDraft(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
    }
  }, [party?.scheduled_at]);

  const { data: peers = [] } = useQuery({
    queryKey: ["workspace_peers_for_party", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, vedouci_id, garant_id, org_unit_id")
        .neq("id", profile!.id);
      if (error) throw error;
      return data as ProfilePeer[];
    },
  });

  const myOrgUnit = useMemo(() => {
    return peers.find((p) => p.id === profile?.id)?.org_unit_id ?? null;
  }, [peers, profile]);

  const presetIds = useMemo(() => {
    if (!profile || !activePreset) return new Set<string>();
    const ids = new Set<string>();
    if (activePreset === "direct") {
      peers.filter((p) => p.vedouci_id === profile.id).forEach((p) => ids.add(p.id));
    } else if (activePreset === "subtree") {
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
    } else if (activePreset === "garant") {
      peers.filter((p) => p.garant_id === profile.id).forEach((p) => ids.add(p.id));
    } else if (activePreset === "workspace") {
      peers.filter((p) => p.org_unit_id && p.org_unit_id === myOrgUnit).forEach((p) => ids.add(p.id));
    }
    return ids;
  }, [activePreset, peers, profile, myOrgUnit]);

  const participantIds = useMemo(() => new Set(participants.map((p) => p.user_id)), [participants]);

  const applyPreset = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nepřihlášen");
      const toAdd = Array.from(presetIds).filter((id) => !participantIds.has(id));
      if (toAdd.length === 0) {
        toast.info("Všichni z této skupiny už jsou pozvaní.");
        return;
      }
      const rows = toAdd.map((uid) => ({
        party_id: partyId,
        user_id: uid,
        invited_via: `preset_${activePreset}`,
        role: "caller",
      }));
      const { error } = await supabase
        .from("group_call_party_participants")
        .upsert(rows, { onConflict: "party_id,user_id" });
      if (error) throw error;

      // Notify
      if (party) {
        await supabase.from("notifications").insert(
          toAdd.map((uid) => ({
            recipient_id: uid,
            sender_id: profile.id,
            trigger_event: "group_call_party_invite",
            title: "Pozvánka na Skupinovou Call Party",
            body: `${profile.full_name} tě zve na "${party.name}"`,
            link_url: `/call-party?party=${partyId}`,
            icon: "phone-call",
            accent_color: "#fc7c71",
          })),
        );
      }
      toast.success(`Pozváno ${toAdd.length} ${toAdd.length === 1 ? "osoba" : "osob"}`);
    },
    onSuccess: () => {
      refetchAll();
      setActivePreset(null);
      qc.invalidateQueries({ queryKey: ["group_party_participants", partyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteOne = useMutation({
    mutationFn: async (userId: string) => {
      if (!profile || !party) throw new Error("Nepřipraveno");
      const { error } = await supabase
        .from("group_call_party_participants")
        .upsert(
          [{ party_id: partyId, user_id: userId, invited_via: "manual", role: "caller" }],
          { onConflict: "party_id,user_id" },
        );
      if (error) throw error;
      await supabase.from("notifications").insert({
        recipient_id: userId,
        sender_id: profile.id,
        trigger_event: "group_call_party_invite",
        title: "Pozvánka na Skupinovou Call Party",
        body: `${profile.full_name} tě zve na "${party.name}"`,
        link_url: `/call-party?party=${partyId}`,
        icon: "phone-call",
        accent_color: "#fc7c71",
      });
    },
    onSuccess: () => refetchAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeOne = useMutation({
    mutationFn: async (userId: string) => {
      if (userId === profile?.id) throw new Error("Hosta nelze odebrat");
      const { error } = await supabase
        .from("group_call_party_participants")
        .delete()
        .eq("party_id", partyId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => refetchAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateScheduled = useMutation({
    mutationFn: async () => {
      if (!scheduledAtDraft) return;
      const { error } = await supabase
        .from("group_call_parties")
        .update({ scheduled_at: new Date(scheduledAtDraft).toISOString() })
        .eq("id", partyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Termín uložen");
      refetchAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startNow = async () => {
    const { data, error } = await supabase.functions.invoke("group-call-party-action", {
      body: { action: "start", party_id: partyId },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Chyba");
      return;
    }
    toast.success("Party spuštěna! 🎉");
    refetchAll();
  };

  const rotateToken = async () => {
    const { data, error } = await supabase.functions.invoke("group-call-party-action", {
      body: { action: "rotate_token", party_id: partyId },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Chyba");
      return;
    }
    toast.success("Nový odkaz");
    refetchAll();
  };

  const inviteUrl = party ? `${window.location.origin}/call-party/join/${party.join_token}` : "";
  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Odkaz zkopírován");
    setTimeout(() => setCopied(false), 1500);
  };

  if (!party) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const isHost = party.host_id === profile?.id;

  const filteredPeers = peers
    .filter((p) => !search.trim() || p.full_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const presetButtons: { key: Exclude<Preset, null>; label: string }[] = [
    { key: "direct", label: "Moje přímá struktura" },
    { key: "subtree", label: "Celá moje struktura" },
    { key: "garant", label: "Moji nováčci" },
    { key: "workspace", label: "Celý workspace" },
  ];

  // Countdown
  const startTs = party.scheduled_at ? new Date(party.scheduled_at).getTime() : null;
  const remainingMs = startTs ? startTs - now : null;

  return (
    <div className="space-y-5 pb-12">
      <StepHeader step={2} title="Pozvánky a guest list" />

      {/* Lobby header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-heading font-bold text-xl" style={{ color: "var(--text-primary, #00555f)" }}>
              {party.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {party.scheduled_at && (
                <>Plán: {format(parseISO(party.scheduled_at), "EEEE d. M. yyyy · HH:mm", { locale: cs })}</>
              )}
              {party.planned_duration_min && <> · {party.planned_duration_min} min</>}
            </p>
            {remainingMs !== null && remainingMs > 0 && (
              <p className="text-xs mt-1" style={{ color: "#00abbd" }}>
                Start za {formatRemaining(remainingMs)}
              </p>
            )}
          </div>
          {isHost ? (
            <Button onClick={startNow} style={{ background: "#22c55e", color: "#fff" }} className="gap-1.5 hover:opacity-90">
              <Play className="h-4 w-4" /> Spustit teď
            </Button>
          ) : (
            <span className="text-sm font-medium px-3 py-2 rounded-md" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>
              Připravit ke startu…
            </span>
          )}
        </div>

        {isHost && (
          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Upravit plánovaný start</Label>
              <Input type="datetime-local" value={scheduledAtDraft} onChange={(e) => setScheduledAtDraft(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => updateScheduled.mutate()} disabled={updateScheduled.isPending}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Uložit termín
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Invite — presets + manual + QR */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-heading font-semibold text-sm" style={{ color: "#00555f" }}>Pozvat účastníky</h3>

          {isHost && (
            <>
              <div>
                <Label className="text-xs">Rychlé skupiny</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {presetButtons.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setActivePreset(activePreset === b.key ? null : b.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                      style={{
                        background: activePreset === b.key ? "#00abbd" : "rgba(0,171,189,0.08)",
                        color: activePreset === b.key ? "#fff" : "#00555f",
                        border: "1px solid #00abbd33",
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {activePreset && (
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-muted-foreground">{presetIds.size} {presetIds.size === 1 ? "osoba" : "osob"} v této skupině</span>
                    <Button size="sm" variant="outline" onClick={() => applyPreset.mutate()} disabled={applyPreset.isPending}>
                      {applyPreset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pozvat skupinu"}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Manuální výběr</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat…" />
                </div>
                <div className="mt-2 max-h-44 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {filteredPeers.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">Nikdo nenalezen</div>
                  ) : (
                    filteredPeers.map((p) => {
                      const inv = participantIds.has(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                          <Checkbox
                            checked={inv}
                            onCheckedChange={(v) => {
                              if (v && !inv) inviteOne.mutate(p.id);
                              else if (!v && inv) removeOne.mutate(p.id);
                            }}
                          />
                          <span className="flex-1">{p.full_name}</span>
                          {inv && <span className="text-[10px] text-muted-foreground">pozván</span>}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* QR */}
          <div className="pt-2 border-t border-border">
            <Label className="text-xs">Odkaz / QR kód</Label>
            <div className="flex gap-3 items-start mt-2">
              <div className="bg-white p-2 rounded-md shrink-0">
                <QRCodeSVG value={inviteUrl} size={120} />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Input value={inviteUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} className="font-mono text-xs" />
                  <Button onClick={copy} size="icon" variant="outline">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {party.allow_external ? "Kdokoli s odkazem se může připojit." : "Jen členové stejného workspace."}
                </p>
                {isHost && (
                  <Button onClick={rotateToken} variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                    <RotateCw className="h-3 w-3" /> Vygenerovat nový odkaz
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Guest list */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm" style={{ color: "#00555f" }}>Guest list</h3>
            <span className="text-xs text-muted-foreground">{participants.length} pozvaných</span>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Zatím nikdo. Pozvi přes skupinu nebo odkaz.</p>
          ) : (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
              {participants.map((p) => {
                const isPartyHost = p.role === "host";
                return (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/30">
                    <span className="flex-1 truncate text-sm">{p.full_name}</span>
                    {isPartyHost ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "#fc7c71", color: "#fff" }}>
                        <Crown className="h-3 w-3" /> HOST
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,171,189,0.12)", color: "#00555f" }}>
                        pozván
                      </span>
                    )}
                    {isHost && !isPartyHost && (
                      <button
                        onClick={() => removeOne.mutate(p.user_id)}
                        className="text-xs text-muted-foreground hover:text-destructive px-1"
                        title="Odebrat"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> Zpět na výběr</Button>
      </div>
    </div>
  );
}

function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center font-bold rounded-full"
        style={{ width: 28, height: 28, background: "#00abbd", color: "#fff", fontSize: 13 }}
      >
        {step}
      </div>
      <h2 className="font-heading font-semibold text-base" style={{ color: "var(--text-primary, #00555f)" }}>{title}</h2>
    </div>
  );
}

function formatRemaining(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s.toString().padStart(2, "0")} s`;
  return `${s} s`;
}
