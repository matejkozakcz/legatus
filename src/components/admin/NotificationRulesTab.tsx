import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Pencil, Trash2, SendHorizontal, Power, PowerOff } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  { key: "promotion_eligible", label: "Povýšení — splněny podmínky" },
  { key: "promotion_approved", label: "Povýšení — schváleno" },
  { key: "promotion_rejected", label: "Povýšení — zamítnuto" },
  { key: "onboarding_completed", label: "Nový uživatel — dokončil onboarding" },
  { key: "meeting_outcome_missing", label: "Schůzka — nezadaný výsledek" },
  { key: "weekly_low_activity", label: "Týdenní report — málo aktivity" },
  { key: "scheduled", label: "Naplánovaná notifikace (cron)" },
  { key: "manual", label: "Manuální (jen test)" },
] as const;

const RECIPIENT_ROLES = [
  { key: "self", label: "Sám sobě" },
  { key: "ziskatel", label: "Získatel" },
  { key: "garant", label: "Garant" },
  { key: "vedouci", label: "Vedoucí" },
  { key: "all_vedouci", label: "Všichni vedoucí" },
  { key: "all_active", label: "Všichni aktivní uživatelé" },
];

const APP_ROLES = ["vedouci", "budouci_vedouci", "garant", "ziskatel", "novacek"];

const ACCENT_COLORS = [
  { key: "primary", label: "Coral (hlavní)", hsl: "hsl(var(--primary))" },
  { key: "accent", label: "Teal (akcent)", hsl: "hsl(var(--accent))" },
  { key: "success", label: "Zelená", hsl: "hsl(142 76% 36%)" },
  { key: "warning", label: "Oranžová", hsl: "hsl(38 92% 50%)" },
  { key: "destructive", label: "Červená", hsl: "hsl(var(--destructive))" },
];

const ICON_OPTIONS = [
  "Bell", "BellRing", "Trophy", "Star", "Award", "TrendingUp",
  "Calendar", "CheckCircle2", "AlertCircle", "Info", "Sparkles", "Zap",
];

interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  is_active: boolean;
  title_template: string;
  body_template: string;
  icon: string | null;
  accent_color: string | null;
  link_url: string | null;
  recipient_roles: string[];
  recipient_filters: { only_active?: boolean; role_in?: string[] };
  schedule_cron: string | null;
  schedule_timezone: string;
  conditions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const emptyRule = (): Partial<NotificationRule> => ({
  name: "",
  description: "",
  trigger_event: "manual",
  is_active: true,
  title_template: "",
  body_template: "",
  icon: "Bell",
  accent_color: "primary",
  link_url: "",
  recipient_roles: ["self"],
  recipient_filters: { only_active: true, role_in: [] },
  schedule_cron: "",
  schedule_timezone: "Europe/Prague",
  conditions: {},
});

// ─── Component ──────────────────────────────────────────────────────────────

export function NotificationRulesTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editingRule, setEditingRule] = useState<Partial<NotificationRule> | null>(null);

  // Cast to any until generated types include notification_rules table
  const sb = supabase as unknown as {
    from: (tbl: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: Error | null }>;
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: Error | null }>;
      };
      delete: () => {
        eq: (col: string, val: string) => Promise<{ error: Error | null }>;
      };
    };
  };

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["notification_rules"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("notification_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NotificationRule[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (rule: Partial<NotificationRule>) => {
      const payload: Record<string, unknown> = {
        name: rule.name,
        description: rule.description || null,
        trigger_event: rule.trigger_event,
        is_active: rule.is_active ?? true,
        title_template: rule.title_template,
        body_template: rule.body_template,
        icon: rule.icon || null,
        accent_color: rule.accent_color || null,
        link_url: rule.link_url || null,
        recipient_roles: rule.recipient_roles || [],
        recipient_filters: rule.recipient_filters || {},
        schedule_cron: rule.schedule_cron || null,
        schedule_timezone: rule.schedule_timezone || "Europe/Prague",
        conditions: rule.conditions || {},
        created_by: user?.id ?? null,
      };
      if (rule.id) {
        const { error } = await sb.from("notification_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("notification_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification_rules"] });
      setEditingRule(null);
      toast.success("Pravidlo uloženo");
    },
    onError: (e: Error) => toast.error(`Chyba: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("notification_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification_rules"] });
      toast.success("Pravidlo smazáno");
    },
    onError: (e: Error) => toast.error(`Chyba: ${e.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sb.from("notification_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification_rules"] }),
  });

  // Manual test send — sends notification to current admin using selected rule's template
  const testSendMutation = useMutation({
    mutationFn: async (rule: NotificationRule) => {
      if (!user) throw new Error("Nepřihlášen");
      const { error } = await supabase.from("notifications").insert({
        recipient_id: user.id,
        sender_id: user.id,
        rule_id: rule.id,
        trigger_event: "manual",
        title: rule.title_template,
        body: rule.body_template,
        icon: rule.icon,
        accent_color: rule.accent_color,
        link_url: rule.link_url,
        payload: { test: true },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Testovací notifikace odeslána sobě"),
    onError: (e: Error) => toast.error(`Chyba: ${e.message}`),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-heading font-semibold text-foreground">Šablony notifikací</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Vytvoř pravidlo: trigger → šablona → komu poslat. Lze zapnout/vypnout, otestovat sobě.
          </p>
        </div>
        <Button onClick={() => setEditingRule(emptyRule())} className="gap-2">
          <Plus className="h-4 w-4" /> Nové pravidlo
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Zatím nemáš žádná pravidla.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const triggerLabel =
              TRIGGER_EVENTS.find((t) => t.key === rule.trigger_event)?.label ?? rule.trigger_event;
            return (
              <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{rule.name}</h4>
                        <Badge variant="secondary" className="text-xs">{triggerLabel}</Badge>
                        {!rule.is_active && (
                          <Badge variant="outline" className="text-xs">Vypnuto</Badge>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                      )}
                      <p className="text-sm text-foreground mt-2 font-medium">{rule.title_template}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{rule.body_template}</p>
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {rule.recipient_roles.map((r) => (
                          <Badge key={r} variant="outline" className="text-[10px]">
                            {RECIPIENT_ROLES.find((x) => x.key === r)?.label ?? r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Test odeslání sobě"
                        onClick={() => testSendMutation.mutate(rule)}
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={rule.is_active ? "Vypnout" : "Zapnout"}
                        onClick={() =>
                          toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })
                        }
                      >
                        {rule.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Upravit"
                        onClick={() => setEditingRule(rule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Smazat"
                        onClick={() => {
                          if (confirm(`Smazat pravidlo "${rule.name}"?`)) deleteMutation.mutate(rule.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RuleEditorDialog
        rule={editingRule}
        onClose={() => setEditingRule(null)}
        onSave={(r) => upsertMutation.mutate(r)}
        saving={upsertMutation.isPending}
      />
    </div>
  );
}

// ─── Editor Dialog ──────────────────────────────────────────────────────────

interface EditorProps {
  rule: Partial<NotificationRule> | null;
  onClose: () => void;
  onSave: (rule: Partial<NotificationRule>) => void;
  saving: boolean;
}

function RuleEditorDialog({ rule, onClose, onSave, saving }: EditorProps) {
  const [form, setForm] = useState<Partial<NotificationRule>>(rule ?? emptyRule());

  // Reset form whenever a different rule is opened
  useEffect(() => {
    if (rule) setForm(rule);
  }, [rule]);

  if (!rule) return null;

  const isScheduled = form.trigger_event === "scheduled";

  const toggleRecipient = (key: string) => {
    const current = form.recipient_roles ?? [];
    setForm({
      ...form,
      recipient_roles: current.includes(key)
        ? current.filter((r) => r !== key)
        : [...current, key],
    });
  };

  const toggleRoleFilter = (role: string) => {
    const current = form.recipient_filters?.role_in ?? [];
    setForm({
      ...form,
      recipient_filters: {
        ...form.recipient_filters,
        role_in: current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
      },
    });
  };

  const handleSave = () => {
    if (!form.name?.trim()) return toast.error("Vyplň název pravidla");
    if (!form.title_template?.trim()) return toast.error("Vyplň text titulku");
    if (!form.body_template?.trim()) return toast.error("Vyplň text těla");
    if ((form.recipient_roles ?? []).length === 0) return toast.error("Vyber alespoň jednoho příjemce");
    if (isScheduled && !form.schedule_cron?.trim())
      return toast.error("Pro naplánovanou notifikaci vyplň cron výraz");
    onSave(form);
  };

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Upravit pravidlo" : "Nové pravidlo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basics */}
          <div className="grid gap-3">
            <div>
              <Label>Název pravidla</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Např. Povýšení na Garanta — gratulace"
              />
            </div>
            <div>
              <Label>Popis (interní)</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="K čemu pravidlo slouží…"
              />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <Label>Spouštěč (trigger)</Label>
            <Select
              value={form.trigger_event}
              onValueChange={(v) => setForm({ ...form, trigger_event: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {TRIGGER_EVENTS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule (only if scheduled) */}
          {isScheduled && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40">
              <div>
                <Label>Cron výraz</Label>
                <Input
                  value={form.schedule_cron ?? ""}
                  onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}
                  placeholder="0 9 * * *"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  např. <code>0 9 * * *</code> = denně 9:00, <code>0 18 * * 5</code> = pátek 18:00
                </p>
              </div>
              <div>
                <Label>Časová zóna</Label>
                <Input
                  value={form.schedule_timezone ?? "Europe/Prague"}
                  onChange={(e) => setForm({ ...form, schedule_timezone: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Template */}
          <div className="space-y-3">
            <div>
              <Label>Titulek</Label>
              <Input
                value={form.title_template ?? ""}
                onChange={(e) => setForm({ ...form, title_template: e.target.value })}
                placeholder="Gratulujeme {{member_name}}!"
              />
            </div>
            <div>
              <Label>Tělo</Label>
              <Textarea
                rows={3}
                value={form.body_template ?? ""}
                onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                placeholder="Právě jsi povýšen na {{new_role}}. Skvělá práce!"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Proměnné: <code>{`{{member_name}}`}</code>, <code>{`{{new_role}}`}</code>,{" "}
                <code>{`{{sender_name}}`}</code>, <code>{`{{count}}`}</code>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ikona (Lucide)</Label>
                <Select
                  value={form.icon ?? "Bell"}
                  onValueChange={(v) => setForm({ ...form, icon: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {ICON_OPTIONS.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Akcent barva</Label>
                <Select
                  value={form.accent_color ?? "primary"}
                  onValueChange={(v) => setForm({ ...form, accent_color: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {ACCENT_COLORS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Odkaz po kliknutí (in-app route)</Label>
              <Input
                value={form.link_url ?? ""}
                onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                placeholder="/dashboard nebo /sprava-tymu"
              />
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label>Příjemci</Label>
            <div className="grid grid-cols-2 gap-2">
              {RECIPIENT_ROLES.map((r) => {
                const active = (form.recipient_roles ?? []).includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRecipient(r.key)}
                    className={`text-left text-xs px-3 py-2 rounded-md border transition-colors ${
                      active
                        ? "bg-primary/10 border-primary text-foreground"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-3 p-3 rounded-lg bg-muted/40">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Jen aktivní uživatelé</Label>
                <p className="text-[10px] text-muted-foreground">Vynech deaktivované profily</p>
              </div>
              <Switch
                checked={form.recipient_filters?.only_active ?? true}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    recipient_filters: { ...form.recipient_filters, only_active: v },
                  })
                }
              />
            </div>
            <div>
              <Label className="text-sm">Filtr podle role (volitelné)</Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Zaškrtni role, které mají dostat notifikaci. Nic = všechny role.
              </p>
              <div className="flex flex-wrap gap-2">
                {APP_ROLES.map((role) => {
                  const active = (form.recipient_filters?.role_in ?? []).includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRoleFilter(role)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        active
                          ? "bg-accent/20 border-accent text-foreground"
                          : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div>
              <Label className="text-sm">Aktivní</Label>
              <p className="text-[10px] text-muted-foreground">Vypnuté pravidlo nic neodesílá</p>
            </div>
            <Switch
              checked={form.is_active ?? true}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Ukládám…" : "Uložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
