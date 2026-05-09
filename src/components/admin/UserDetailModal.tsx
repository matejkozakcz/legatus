import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User as UserIcon,
  Activity,
  Wrench,
  Shield,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  CalendarDays,
  Bell,
  Coins,
  ArrowUpRight,
  History,
  Target,
  Pencil,
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { UserGoalsModal } from "@/components/UserGoalsModal";
import { metricLabel } from "@/lib/goalMetrics";

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

const ROLES = ["vedouci", "budouci_vedouci", "garant", "ziskatel", "novacek"] as const;

const fmtRel = (d?: string | null) =>
  d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: cs }) : "—";
const fmtAbs = (d?: string | null) =>
  d ? format(new Date(d), "d. M. yyyy HH:mm", { locale: cs }) : "—";

interface UserDetailModalProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  currentVersion?: string;
}

export function UserDetailModal({ userId, open, onClose, currentVersion }: UserDetailModalProps) {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin_user_detail", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: vedouci } = useQuery({
    queryKey: ["admin_user_vedouci", profile?.vedouci_id],
    enabled: !!profile?.vedouci_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", profile!.vedouci_id!)
        .maybeSingle();
      return data;
    },
  });

  const { data: garant } = useQuery({
    queryKey: ["admin_user_garant", profile?.garant_id],
    enabled: !!profile?.garant_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", profile!.garant_id!)
        .maybeSingle();
      return data;
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[860px] !max-w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-3">
            {profile && (
              <>
                <Avatar className="h-10 w-10">
                  {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
                  <AvatarFallback>
                    {profile.full_name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-base font-heading font-semibold">{profile.full_name}</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    {ROLE_LABELS[profile.role] || profile.role}
                    {profile.is_admin && " · Admin"}
                  </div>
                </div>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !profile ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Načítání…</div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-6 h-auto">
              <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-transparent">
                <UserIcon className="h-3.5 w-3.5" /> Přehled
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2 data-[state=active]:bg-transparent">
                <Activity className="h-3.5 w-3.5" /> Aktivita
              </TabsTrigger>
              <TabsTrigger value="tech" className="gap-2 data-[state=active]:bg-transparent">
                <Wrench className="h-3.5 w-3.5" /> Tech
              </TabsTrigger>
              <TabsTrigger value="goals" className="gap-2 data-[state=active]:bg-transparent">
                <Target className="h-3.5 w-3.5" /> Cíle
              </TabsTrigger>
              <TabsTrigger value="manage" className="gap-2 data-[state=active]:bg-transparent">
                <Shield className="h-3.5 w-3.5" /> Správa
              </TabsTrigger>
            </TabsList>

            <div className="p-6 max-h-[70vh] overflow-auto">
              <TabsContent value="overview" className="m-0">
                <OverviewTab profile={profile} vedouci={vedouci} garant={garant} />
              </TabsContent>

              <TabsContent value="activity" className="m-0">
                <ActivityTab userId={profile.id} />
              </TabsContent>

              <TabsContent value="tech" className="m-0">
                <TechTab profile={profile} currentVersion={currentVersion} />
              </TabsContent>

              <TabsContent value="goals" className="m-0">
                <GoalsTab profile={profile} />
              </TabsContent>

              <TabsContent value="manage" className="m-0">
                <ManageTab
                  profile={profile}
                  onUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["admin_user_detail", userId] });
                    queryClient.invalidateQueries({ queryKey: ["admin_user_status"] });
                    queryClient.invalidateQueries({ queryKey: ["admin_unified_users"] });
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ profile, vedouci, garant }: { profile: any; vedouci: any; garant: any }) {
  return (
    <div className="space-y-4">
      <Field label="Datum registrace" value={fmtAbs(profile.created_at)} />
      <Field label="Osobní ID" value={profile.osobni_id || "—"} />
      <Field label="Role" value={ROLE_LABELS[profile.role] || profile.role} />
      <Field label="Vedoucí" value={vedouci?.full_name || (profile.vedouci_id ? "—" : "Žádný")} />
      <Field label="Garant" value={garant?.full_name || (profile.garant_id ? "—" : "Žádný")} />
      <Field label="Měsíční BJ cíl" value={String(profile.monthly_bj_goal ?? 0)} />
      <Field label="Osobní BJ cíl" value={String(profile.personal_bj_goal ?? 0)} />
      <Field
        label="Stav"
        value={profile.is_active ? "Aktivní" : "Deaktivováno"}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────

function ActivityTab({ userId }: { userId: string }) {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_user_activity", userId, days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const [{ data: meetings }, { data: notifs }, { data: promos }, { data: audits }] =
        await Promise.all([
          supabase
            .from("client_meetings")
            .select("id, meeting_type, case_name, created_at, podepsane_bj, doporuceni_fsa, doporuceni_pohovor, doporuceni_poradenstvi, cancelled, outcome_recorded")
            .eq("user_id", userId)
            .gte("created_at", since)
            .order("created_at", { ascending: false }),
          supabase
            .from("notifications")
            .select("id, title, trigger_event, created_at")
            .eq("recipient_id", userId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("promotion_history")
            .select("id, event, requested_role, created_at, note")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("bj_audit_log")
            .select("id, action, old_bj, new_bj, change_reason, created_at")
            .eq("user_id", userId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      const valid = (meetings || []).filter((m: any) => !m.cancelled);
      const totalBj = valid.reduce((s: number, m: any) => s + Number(m.podepsane_bj || 0), 0);
      const totalRefs = valid.reduce(
        (s: number, m: any) =>
          s + (m.doporuceni_fsa || 0) + (m.doporuceni_pohovor || 0) + (m.doporuceni_poradenstvi || 0),
        0,
      );
      const fsaCount = valid.filter((m: any) => m.meeting_type === "FSA").length;
      const serCount = valid.filter((m: any) => m.meeting_type === "SER").length;
      const unrecorded = valid.filter((m: any) => !m.outcome_recorded).length;

      // Build timeline
      const timeline: any[] = [];
      (meetings || []).forEach((m: any) =>
        timeline.push({
          ts: m.created_at,
          icon: CalendarDays,
          title: `${m.cancelled ? "Zrušená " : ""}schůzka ${m.meeting_type}`,
          detail: `${m.case_name || "bez názvu"} · ${m.podepsane_bj || 0} BJ`,
        }),
      );
      (notifs || []).forEach((n: any) =>
        timeline.push({
          ts: n.created_at,
          icon: Bell,
          title: `Notifikace: ${n.title}`,
          detail: n.trigger_event,
        }),
      );
      (promos || []).forEach((p: any) =>
        timeline.push({
          ts: p.created_at,
          icon: ArrowUpRight,
          title: `Povýšení: ${p.event}`,
          detail: `${ROLE_LABELS[p.requested_role] || p.requested_role}${p.note ? ` · ${p.note}` : ""}`,
        }),
      );
      (audits || []).forEach((a: any) =>
        timeline.push({
          ts: a.created_at,
          icon: Coins,
          title: `BJ úprava: ${a.action}`,
          detail: `${a.old_bj ?? "—"} → ${a.new_bj ?? "—"} · ${a.change_reason || ""}`,
        }),
      );
      timeline.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));

      return {
        stats: {
          meetingsTotal: valid.length,
          fsaCount,
          serCount,
          totalBj,
          totalRefs,
          unrecorded,
        },
        timeline: timeline.slice(0, 50),
      };
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Období:</Label>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dní</SelectItem>
            <SelectItem value="30">30 dní</SelectItem>
            <SelectItem value="90">90 dní</SelectItem>
            <SelectItem value="365">12 měsíců</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Načítání…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Schůzek" value={data!.stats.meetingsTotal} />
            <Stat label="FSA" value={data!.stats.fsaCount} />
            <Stat label="SER" value={data!.stats.serCount} />
            <Stat label="Podepsané BJ" value={data!.stats.totalBj} />
            <Stat label="Doporučení" value={data!.stats.totalRefs} />
            <Stat label="Bez výsledku" value={data!.stats.unrecorded} highlight={data!.stats.unrecorded > 0} />
          </div>

          <div>
            <h4 className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
              <History className="h-3.5 w-3.5" /> Timeline událostí
            </h4>
            {data!.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Žádné události za období.</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-auto">
                {data!.timeline.map((e: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 transition border-l-2 border-transparent hover:border-primary"
                  >
                    <e.icon className="h-3.5 w-3.5 text-primary mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{e.detail}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={fmtAbs(e.ts)}>
                      {fmtRel(e.ts)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`text-xl font-heading font-bold mt-1 ${highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Tech ────────────────────────────────────────────────────────────────────

function TechTab({ profile, currentVersion }: { profile: any; currentVersion?: string }) {
  const queryClient = useQueryClient();
  const isCurrent =
    !!profile.last_known_version && !!currentVersion && profile.last_known_version === currentVersion;

  const { data: subs, isLoading: loadingSubs } = useQuery({
    queryKey: ["admin_user_subs", profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, user_agent, created_at, last_used_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const deleteSub = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Push subscription smazán");
      queryClient.invalidateQueries({ queryKey: ["admin_user_subs", profile.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-2">
        <div className="grid grid-cols-[160px_1fr] gap-3 items-center text-sm">
          <Label className="text-xs text-muted-foreground">Poslední přihlášení</Label>
          <div>
            {fmtRel(profile.last_seen_at)}
            <span className="text-xs text-muted-foreground ml-2">({fmtAbs(profile.last_seen_at)})</span>
          </div>
        </div>
        <div className="grid grid-cols-[160px_1fr] gap-3 items-center text-sm">
          <Label className="text-xs text-muted-foreground">Verze klienta</Label>
          <div className="flex items-center gap-2">
            {!profile.last_known_version ? (
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            ) : isCurrent ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600" />
            )}
            <span className="font-mono text-xs">{profile.last_known_version || "neznámá"}</span>
            {currentVersion && (
              <span className="text-[10px] text-muted-foreground">/ aktuální: {currentVersion}</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
          Push subscriptions ({subs?.length ?? 0})
        </h4>
        {loadingSubs ? (
          <p className="text-sm text-muted-foreground">Načítání…</p>
        ) : (subs?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-3">Žádné aktivní push subscriptions.</p>
        ) : (
          <div className="space-y-2">
            {subs!.map((s: any) => (
              <div key={s.id} className="rounded-md border p-3 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-foreground truncate" title={s.user_agent || ""}>
                      {s.user_agent || "Neznámý prohlížeč"}
                    </div>
                    <div className="text-muted-foreground">
                      Vytvořeno: {fmtRel(s.created_at)} · Naposledy: {fmtRel(s.last_used_at)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate" title={s.endpoint}>
                      {s.endpoint}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteSub.mutate(s.id)}
                    disabled={deleteSub.isPending}
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Manage ──────────────────────────────────────────────────────────────────

function ManageTab({ profile, onUpdated }: { profile: any; onUpdated: () => void }) {
  const [role, setRole] = useState(profile.role);
  const [vedouciId, setVedouciId] = useState(profile.vedouci_id || "");
  const [garantId, setGarantId] = useState(profile.garant_id || "");
  const [isActive, setIsActive] = useState(profile.is_active);

  const { data: leaders } = useQuery({
    queryKey: ["admin_leaders_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["vedouci", "budouci_vedouci"])
        .eq("is_active", true)
        .order("full_name");
      return data || [];
    },
  });

  const { data: garants } = useQuery({
    queryKey: ["admin_garants_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["garant", "budouci_vedouci", "vedouci"])
        .eq("is_active", true)
        .order("full_name");
      return data || [];
    },
  });

  const dirty = useMemo(
    () =>
      role !== profile.role ||
      (vedouciId || null) !== profile.vedouci_id ||
      (garantId || null) !== profile.garant_id ||
      isActive !== profile.is_active,
    [role, vedouciId, garantId, isActive, profile],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          role,
          vedouci_id: vedouciId || null,
          garant_id: garantId || null,
          is_active: isActive,
        })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profil aktualizován");
      onUpdated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Vedoucí</Label>
        <Select value={vedouciId || "none"} onValueChange={(v) => setVedouciId(v === "none" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Vyber vedoucího" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Žádný —</SelectItem>
            {(leaders || []).map((l: any) => (
              <SelectItem key={l.id} value={l.id}>
                {l.full_name} ({ROLE_LABELS[l.role]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Garant</Label>
        <Select value={garantId || "none"} onValueChange={(v) => setGarantId(v === "none" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Vyber garanta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Žádný —</SelectItem>
            {(garants || []).map((g: any) => (
              <SelectItem key={g.id} value={g.id}>
                {g.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <div className="text-sm font-medium">Aktivní účet</div>
          <div className="text-xs text-muted-foreground">
            Deaktivovaný uživatel se nemůže přihlásit a nezobrazuje se v hierarchii.
          </div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="bg-[#fc7c71] hover:bg-[#fc7c71]/90 text-white"
        >
          {save.isPending ? "Ukládám…" : "Uložit změny"}
        </Button>
      </div>
    </div>
  );
}
