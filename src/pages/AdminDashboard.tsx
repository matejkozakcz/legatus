import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Shield, Users, Settings2, Search, Eye, Lock, GitBranch, Plus, Trash2, ChevronDown, RotateCcw, Info, Zap, FileCode, Bell, Pencil } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromotionRules {
  ziskatel_to_garant: { min_bj: number; min_structure: number };
  garant_to_bv: { min_structure: number; min_direct: number };
  bv_to_vedouci: { min_structure: number; min_direct: number };
}

interface PeriodConfig {
  default: number;
  december_rule: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean | null;
  is_admin: boolean;
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
  osobni_id: string | null;
  monthly_bj_goal: number | null;
  personal_bj_goal: number | null;
}

const ROLES = ["vedouci", "budouci_vedouci", "garant", "ziskatel", "novacek"] as const;
const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { godMode, isAdmin } = useAuth();

  if (!godMode || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-heading font-bold text-foreground">Admin Dashboard</h1>
      </div>

      <Tabs defaultValue="promotions" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border flex-wrap">
          <TabsTrigger value="promotions" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Pravidla povýšení
          </TabsTrigger>
          <TabsTrigger value="period" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Produkční období
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" /> Uživatelé
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Lock className="h-4 w-4" /> Logika & Hierarchie
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" /> Notifikace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="promotions">
          <PromotionRulesTab />
        </TabsContent>
        <TabsContent value="period">
          <PeriodConfigTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Promotion Rules Tab ──────────────────────────────────────────────────────

function PromotionRulesTab() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({
    queryKey: ["app_config", "promotion_rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "promotion_rules")
        .single();
      return (data?.value as unknown as PromotionRules) ?? null;
    },
  });

  const [form, setForm] = useState<PromotionRules>({
    ziskatel_to_garant: { min_bj: 1000, min_structure: 2 },
    garant_to_bv: { min_structure: 5, min_direct: 3 },
    bv_to_vedouci: { min_structure: 10, min_direct: 6 },
  });

  useEffect(() => {
    if (rules) setForm(rules);
  }, [rules]);

  const mutation = useMutation({
    mutationFn: async (value: PromotionRules) => {
      const { error } = await supabase
        .from("app_config")
        .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
        .eq("key", "promotion_rules");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", "promotion_rules"] });
      toast.success("Pravidla povýšení uložena");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  const update = (path: string, field: string, val: number) => {
    setForm((prev) => ({
      ...prev,
      [path]: { ...prev[path as keyof PromotionRules], [field]: val },
    }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Získatel → Garant */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Získatel → Garant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Min. kumulativní BJ</Label>
            <Input
              type="number"
              value={form.ziskatel_to_garant.min_bj}
              onChange={(e) => update("ziskatel_to_garant", "min_bj", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Min. lidí ve struktuře</Label>
            <Input
              type="number"
              value={form.ziskatel_to_garant.min_structure}
              onChange={(e) => update("ziskatel_to_garant", "min_structure", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Garant → BV */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Garant → Budoucí vedoucí</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Min. lidí ve struktuře</Label>
            <Input
              type="number"
              value={form.garant_to_bv.min_structure}
              onChange={(e) => update("garant_to_bv", "min_structure", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Min. přímých</Label>
            <Input
              type="number"
              value={form.garant_to_bv.min_direct}
              onChange={(e) => update("garant_to_bv", "min_direct", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* BV → Vedoucí */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Budoucí vedoucí → Vedoucí</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Min. lidí ve struktuře</Label>
            <Input
              type="number"
              value={form.bv_to_vedouci.min_structure}
              onChange={(e) => update("bv_to_vedouci", "min_structure", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Min. přímých</Label>
            <Input
              type="number"
              value={form.bv_to_vedouci.min_direct}
              onChange={(e) => update("bv_to_vedouci", "min_direct", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-3">
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Uložit pravidla
        </Button>
      </div>
    </div>
  );
}

// ─── Period Config Tab ────────────────────────────────────────────────────────

function PeriodConfigTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["app_config", "period_end_day"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "period_end_day")
        .single();
      return (data?.value as unknown as PeriodConfig) ?? null;
    },
  });

  const [day, setDay] = useState(27);
  const [decRule, setDecRule] = useState("first_working_day_january");

  useEffect(() => {
    if (config) {
      setDay(config.default);
      setDecRule(config.december_rule);
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: async () => {
      const value = { default: day, december_rule: decRule };
      const { error } = await supabase
        .from("app_config")
        .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
        .eq("key", "period_end_day");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", "period_end_day"] });
      toast.success("Nastavení období uloženo");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  return (
    <Card className="max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Produkční období</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Den konce období</Label>
          <Input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground mt-1">Pokud den není pracovní, posune se na další pracovní den.</p>
        </div>
        <div>
          <Label>Pravidlo pro prosinec</Label>
          <Select value={decRule} onValueChange={setDecRule}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="first_working_day_january">První pracovní den ledna</SelectItem>
              <SelectItem value="same_as_default">Stejný den jako ostatní měsíce</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Uložit
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProfileRow>>({});

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, is_admin, vedouci_id, garant_id, ziskatel_id, osobni_id, monthly_bj_goal, personal_bj_goal")
        .order("full_name");
      return (data || []) as ProfileRow[];
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProfileRow> }) => {
      const { error } = await supabase.from("profiles").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
      setEditingId(null);
      toast.success("Profil aktualizován");
    },
    onError: (e) => toast.error(`Chyba: ${e.message}`),
  });

  const filtered = profiles.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.role.toLowerCase().includes(search.toLowerCase()) ||
    (p.osobni_id || "").toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (p: ProfileRow) => {
    setEditingId(p.id);
    setEditForm({
      role: p.role,
      is_active: p.is_active,
      vedouci_id: p.vedouci_id,
      garant_id: p.garant_id,
      ziskatel_id: p.ziskatel_id,
      osobni_id: p.osobni_id,
      monthly_bj_goal: p.monthly_bj_goal,
      personal_bj_goal: p.personal_bj_goal,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    mutation.mutate({ id: editingId, updates: editForm });
  };

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Hledat uživatele…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Jméno</th>
              <th className="text-left p-3 font-medium">Role</th>
              <th className="text-left p-3 font-medium">Osobní ID</th>
              <th className="text-left p-3 font-medium">Vedoucí ID</th>
              <th className="text-left p-3 font-medium">Garant ID</th>
              <th className="text-left p-3 font-medium">Získatel ID</th>
              <th className="text-left p-3 font-medium">BJ cíl</th>
              <th className="text-left p-3 font-medium">Aktivní</th>
              <th className="text-left p-3 font-medium">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id} className={`${isEditing ? "bg-accent/10" : "hover:bg-muted/30"}`}>
                  <td className="p-3 font-medium">{p.full_name}</td>
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs">{ROLE_LABELS[p.role] || p.role}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Input
                        className="h-8 w-24"
                        value={editForm.osobni_id || ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, osobni_id: e.target.value || null }))}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{p.osobni_id || "–"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Input
                        className="h-8 w-32 text-[11px]"
                        placeholder="UUID"
                        value={editForm.vedouci_id || ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, vedouci_id: e.target.value || null }))}
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">{p.vedouci_id ? p.vedouci_id.slice(0, 8) + "…" : "–"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Input
                        className="h-8 w-32 text-[11px]"
                        placeholder="UUID"
                        value={editForm.garant_id || ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, garant_id: e.target.value || null }))}
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">{p.garant_id ? p.garant_id.slice(0, 8) + "…" : "–"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Input
                        className="h-8 w-32 text-[11px]"
                        placeholder="UUID"
                        value={editForm.ziskatel_id || ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, ziskatel_id: e.target.value || null }))}
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">{p.ziskatel_id ? p.ziskatel_id.slice(0, 8) + "…" : "–"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Input
                        className="h-8 w-20"
                        type="number"
                        value={editForm.monthly_bj_goal ?? 0}
                        onChange={(e) => setEditForm((f) => ({ ...f, monthly_bj_goal: Number(e.target.value) }))}
                      />
                    ) : (
                      <span className="text-xs">{p.monthly_bj_goal || 0}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Switch
                        checked={editForm.is_active ?? true}
                        onCheckedChange={(v) => setEditForm((f) => ({ ...f, is_active: v }))}
                      />
                    ) : (
                      <span className={`text-xs ${p.is_active ? "text-secondary" : "text-destructive"}`}>
                        {p.is_active ? "Ano" : "Ne"}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" onClick={saveEdit} disabled={mutation.isPending} className="h-7 text-xs">
                          Uložit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-xs">
                          Zrušit
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(p)} className="h-7 text-xs">
                        Upravit
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Permissions & Hierarchy Tab ──────────────────────────────────────────────

const PERM_ROLES = ["Admin", "Vedoucí", "Bud. vedoucí", "Garant", "Získatel", "Nováček"] as const;
const ALL_ACTIONS = ["vidí", "edituje", "vytváří", "maže"] as const;
type PermAction = (typeof ALL_ACTIONS)[number];

interface PermRule {
  table: string;
  label: string;
  matrix: Record<string, PermAction[]>;
}

interface VisibilityRule {
  role: string;
  sees: string;
  scope: string;
}

interface HierarchyRule {
  relationship: string;
  meaning: string;
  whoSets: string;
}

const ACTION_COLORS: Record<PermAction, string> = {
  vidí: "bg-secondary/20 text-secondary border-secondary/30",
  edituje: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
  vytváří: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  maže: "bg-destructive/20 text-destructive border-destructive/30",
};

function useConfigEditor<T>(configKey: string, fallback: T) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["app_config", configKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", configKey)
        .single();
      return (data?.value as unknown as T) ?? fallback;
    },
  });

  const [localData, setLocalData] = useState<T>(fallback);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) { setLocalData(data); setDirty(false); }
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from("app_config")
        .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
        .eq("key", configKey);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", configKey] });
      setDirty(false);
      toast.success("Uloženo");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  const update = (updater: (prev: T) => T) => {
    setLocalData((prev) => {
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  };

  return { data: localData, isLoading, dirty, save, update };
}

function PermissionsTab() {
  return (
    <div className="space-y-6">
      <VisibilityEditor />
      <PermissionMatrixEditor />
      <HierarchyEditor />
    </div>
  );
}

// ─── Visibility Editor ────────────────────────────────────────────────────────

const ROLE_OPTIONS = ["Admin", "Vedoucí", "Bud. vedoucí", "Garant", "Získatel", "Nováček", "Získatel / Nováček"] as const;
const SEES_OPTIONS = ["Profily", "Aktivity & Schůzky", "Byznys případy", "Promotion requests", "Vše vlastní", "Vše"] as const;
const SCOPE_OPTIONS = [
  { value: "Celý svůj podstrom (is_in_vedouci_subtree)", label: "Celý podstrom" },
  { value: "Lidé s vedouci_id = já", label: "Přímý vedoucí (vedouci_id)" },
  { value: "Lidé s garant_id = já", label: "Moji nováčci (garant_id)" },
  { value: "Pouze vlastní záznamy (user_id = já)", label: "Pouze vlastní" },
  { value: "Celá databáze (is_admin())", label: "Celá databáze (admin)" },
  { value: "Všechny (role = vedouci)", label: "Všichni vedoucí" },
] as const;

const DEFAULT_VISIBILITY: VisibilityRule[] = [
  { role: "Vedoucí", sees: "Profily", scope: "Celý svůj podstrom (is_in_vedouci_subtree)" },
  { role: "Vedoucí", sees: "Aktivity & Schůzky", scope: "Lidé s vedouci_id = já" },
  { role: "Vedoucí", sees: "Byznys případy", scope: "Celý svůj podstrom (is_in_vedouci_subtree)" },
  { role: "Vedoucí", sees: "Promotion requests", scope: "Všechny (role = vedouci)" },
  { role: "Garant", sees: "Profily", scope: "Lidé s garant_id = já" },
  { role: "Garant", sees: "Aktivity & Schůzky", scope: "Lidé s garant_id = já" },
  { role: "Získatel / Nováček", sees: "Vše vlastní", scope: "Pouze vlastní záznamy (user_id = já)" },
  { role: "Admin", sees: "Vše", scope: "Celá databáze (is_admin())" },
];

// ─── Shared RLS apply hook ────────────────────────────────────────────────────

function useApplyRls(type: string) {
  const [sqlPreview, setSqlPreview] = useState<string[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyErrors, setApplyErrors] = useState<string[]>([]);

  const callFn = async (payload: Record<string, unknown>, dryRun: boolean) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Nejsi přihlášen"); return; }
    const res = await fetch(`${supabaseUrl}/functions/v1/apply-rls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type, ...payload, dry_run: dryRun }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Chyba");
    return data;
  };

  const previewSql = async (payload: Record<string, unknown>) => {
    try {
      const data = await callFn(payload, true);
      setSqlPreview(data.statements || []);
      setApplyErrors(data.errors || []);
    } catch (e: any) { toast.error(e.message); }
  };

  const applyToDb = async (payload: Record<string, unknown>, saveFn?: () => Promise<void>) => {
    if (!confirm("⚠️ Tato akce změní RLS politiky v databázi. Opravdu pokračovat?")) return;
    setApplying(true);
    try {
      if (saveFn) await saveFn();
      const data = await callFn(payload, false);
      setApplyErrors(data.errors || []);
      setSqlPreview(null);
      toast.success(`RLS politiky aplikovány (${data.applied} příkazů)`);
    } catch (e: any) { toast.error(`Chyba: ${e.message}`); }
    finally { setApplying(false); }
  };

  return { sqlPreview, setSqlPreview, applying, applyErrors, previewSql, applyToDb };
}

function SqlPreviewBlock({ sqlPreview, setSqlPreview, applyErrors }: { sqlPreview: string[] | null; setSqlPreview: (v: null) => void; applyErrors: string[] }) {
  if (!sqlPreview) return null;
  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-heading font-semibold">Náhled SQL příkazů</h4>
        <Button size="sm" variant="ghost" onClick={() => setSqlPreview(null)} className="h-7 text-xs">Zavřít</Button>
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-3 max-h-64 overflow-y-auto">
        <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all">{sqlPreview.join("\n\n")}</pre>
      </div>
      {applyErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive mb-1">Varování:</p>
          {applyErrors.map((e, i) => <p key={i} className="text-[11px] text-destructive/80">{e}</p>)}
        </div>
      )}
    </div>
  );
}

// ─── Visibility Editor ────────────────────────────────────────────────────────

function VisibilityEditor() {
  const { data: rules, isLoading, dirty, save, update } = useConfigEditor<VisibilityRule[]>("visibility_rules", []);
  const rls = useApplyRls("visibility");

  const updateRule = (index: number, field: keyof VisibilityRule, value: string) => {
    update((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRule = () => {
    update((prev) => [...prev, { role: "Nováček", sees: "Vše vlastní", scope: "Pouze vlastní záznamy (user_id = já)" }]);
  };
  const removeRule = (index: number) => {
    update((prev) => prev.filter((_, i) => i !== index));
  };
  const resetToDefaults = () => {
    update(() => [...DEFAULT_VISIBILITY]);
  };

  if (isLoading) return <Card><CardContent className="p-4 text-muted-foreground">Načítání…</CardContent></Card>;

  const grouped = rules.reduce<Record<string, { rule: VisibilityRule; idx: number }[]>>((acc, rule, idx) => {
    if (!acc[rule.role]) acc[rule.role] = [];
    acc[rule.role].push({ rule, idx });
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> Kdo vidí čí data
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={resetToDefaults} className="h-7 text-xs gap-1 text-muted-foreground">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={addRule} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Pravidlo
            </Button>
            {dirty && (
              <Button size="sm" onClick={() => save.mutate(rules)} disabled={save.isPending} className="h-7 text-xs gap-1">
                <Save className="h-3 w-3" /> Uložit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => rls.previewSql({ rules })} className="h-7 text-xs gap-1">
              <FileCode className="h-3 w-3" /> Náhled SQL
            </Button>
            <Button
              size="sm"
              onClick={() => rls.applyToDb({ rules }, () => save.mutateAsync(rules))}
              disabled={rls.applying}
              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
            >
              <Zap className="h-3 w-3" /> {rls.applying ? "Aplikuji…" : "Aplikovat na DB"}
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-lg bg-secondary/5 border border-secondary/10">
          <Info className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Každý řádek definuje, <strong>jaká data</strong> daná role vidí a <strong>v jakém rozsahu</strong> (scope).
            <strong> Náhled SQL</strong> ukáže vygenerované SELECT politiky. <strong>Aplikovat na DB</strong> je zapíše do databáze.
            ⚠️ Toto přepíše stávající SELECT RLS politiky na dotčených tabulkách!
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(grouped).map(([role, items]) => (
            <div key={role} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-heading font-semibold text-foreground">{role}</span>
              </div>
              {items.map(({ rule, idx }) => (
                <div key={idx} className="flex items-start gap-2 pl-2 border-l-2 border-secondary/30">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-foreground w-10 shrink-0">Vidí</label>
                      <Select value={rule.sees} onValueChange={(v) => updateRule(idx, "sees", v)}>
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SEES_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-foreground w-10 shrink-0">Scope</label>
                      <Select value={rule.scope} onValueChange={(v) => updateRule(idx, "scope", v)}>
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeRule(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <SqlPreviewBlock sqlPreview={rls.sqlPreview} setSqlPreview={rls.setSqlPreview} applyErrors={rls.applyErrors} />
      </CardContent>
    </Card>
  );
}

// ─── Permission Matrix Editor ─────────────────────────────────────────────────

function PermissionMatrixEditor() {
  const { data: rules, isLoading, dirty, save, update } = useConfigEditor<PermRule[]>("permission_matrix", []);
  const rls = useApplyRls("matrix");

  const toggleAction = (tableIdx: number, role: string, action: PermAction) => {
    update((prev) =>
      prev.map((rule, i) => {
        if (i !== tableIdx) return rule;
        const current = rule.matrix[role] || [];
        const has = current.includes(action);
        return {
          ...rule,
          matrix: {
            ...rule.matrix,
            [role]: has ? current.filter((a) => a !== action) : [...current, action],
          },
        };
      })
    );
  };

  const previewSql = async () => {
    await rls.previewSql({ matrix: rules });
  };

  const applyToDb = async () => {
    await rls.applyToDb({ matrix: rules }, () => save.mutateAsync(rules));
  };

  if (isLoading) return <Card><CardContent className="p-4 text-muted-foreground">Načítání…</CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Matice oprávnění (tabulka × role)
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {dirty && (
              <Button size="sm" onClick={() => save.mutate(rules)} disabled={save.isPending} className="h-7 text-xs gap-1">
                <Save className="h-3 w-3" /> Uložit konfiguraci
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={previewSql} className="h-7 text-xs gap-1">
              <FileCode className="h-3 w-3" /> Náhled SQL
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={applyToDb}
              disabled={rls.applying}
              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
            >
              <Zap className="h-3 w-3" /> {rls.applying ? "Aplikuji…" : "Aplikovat na DB"}
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-lg bg-secondary/5 border border-secondary/10">
          <Info className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Klikni na badge pro zapnutí/vypnutí oprávnění. <strong>Náhled SQL</strong> ukáže, jaké příkazy se provedou. 
            <strong> Aplikovat na DB</strong> smaže stávající RLS politiky a vytvoří nové podle matice. 
            ⚠️ Špatná konfigurace může zablokovat přístup k datům!
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Tabulka</th>
                {PERM_ROLES.map((r) => (
                  <th key={r} className="text-left p-3 font-medium text-xs">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule, tableIdx) => (
                <tr key={rule.table} className="hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{rule.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{rule.table}</div>
                  </td>
                  {PERM_ROLES.map((role) => {
                    const current = rule.matrix[role] || [];
                    return (
                      <td key={role} className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {ALL_ACTIONS.map((action) => {
                            const active = current.includes(action);
                            return (
                              <button
                                key={action}
                                onClick={() => toggleAction(tableIdx, role, action)}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border transition-all cursor-pointer ${
                                  active
                                    ? ACTION_COLORS[action]
                                    : "bg-transparent text-muted-foreground/40 border-border/50 hover:border-border"
                                }`}
                              >
                                {action}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SqlPreviewBlock sqlPreview={rls.sqlPreview} setSqlPreview={rls.setSqlPreview} applyErrors={rls.applyErrors} />
      </CardContent>
    </Card>
  );
}

// ─── Hierarchy Editor ─────────────────────────────────────────────────────────

const DEFAULT_HIERARCHY: HierarchyRule[] = [
  { relationship: "vedouci_id", meaning: "Vedoucí tohoto člena — řídí celý podstrom", whoSets: "Vedoucí nebo Admin" },
  { relationship: "garant_id", meaning: "Garant tohoto nováčka — přímý mentor", whoSets: "Vedoucí nebo Admin" },
  { relationship: "ziskatel_id", meaning: "Kdo tohoto člena získal — tvoří strukturu pro povýšení", whoSets: "Onboarding / Vedoucí / Admin" },
  { relationship: "ziskatel_name", meaning: "Jméno získatele (záloha pokud není v systému)", whoSets: "Onboarding" },
];

const RELATIONSHIP_OPTIONS = [
  { value: "vedouci_id", label: "vedouci_id", desc: "Kdo je vedoucí tohoto člena" },
  { value: "garant_id", label: "garant_id", desc: "Kdo je garant tohoto nováčka" },
  { value: "ziskatel_id", label: "ziskatel_id", desc: "Kdo tohoto člena získal" },
  { value: "ziskatel_name", label: "ziskatel_name", desc: "Textové jméno získatele" },
] as const;

const MEANING_OPTIONS = [
  "Vedoucí tohoto člena — řídí celý podstrom",
  "Garant tohoto nováčka — přímý mentor",
  "Kdo tohoto člena získal — tvoří strukturu pro povýšení",
  "Jméno získatele (záloha pokud není v systému)",
] as const;

function HierarchyEditor() {
  const { data: rules, isLoading, dirty, save, update } = useConfigEditor<HierarchyRule[]>("hierarchy_rules", []);
  const rls = useApplyRls("hierarchy");

  const updateRule = (index: number, field: keyof HierarchyRule, value: string) => {
    update((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRule = () => {
    update((prev) => [...prev, { relationship: "vedouci_id", meaning: "", whoSets: "Admin" }]);
  };
  const removeRule = (index: number) => {
    update((prev) => prev.filter((_, i) => i !== index));
  };
  const resetToDefaults = () => {
    update(() => [...DEFAULT_HIERARCHY]);
  };

  const WHO_SETS_OPTIONS = ["Admin", "Vedoucí nebo Admin", "Onboarding", "Onboarding / Vedoucí / Admin", "Systém"];

  if (isLoading) return <Card><CardContent className="p-4 text-muted-foreground">Načítání…</CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Hierarchie — vazby v profilu
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={resetToDefaults} className="h-7 text-xs gap-1 text-muted-foreground">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={addRule} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Vazba
            </Button>
            {dirty && (
              <Button size="sm" onClick={() => save.mutate(rules)} disabled={save.isPending} className="h-7 text-xs gap-1">
                <Save className="h-3 w-3" /> Uložit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => rls.previewSql({ rules })} className="h-7 text-xs gap-1">
              <FileCode className="h-3 w-3" /> Náhled SQL
            </Button>
            <Button
              size="sm"
              onClick={() => rls.applyToDb({ rules }, () => save.mutateAsync(rules))}
              disabled={rls.applying}
              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
            >
              <Zap className="h-3 w-3" /> {rls.applying ? "Aplikuji…" : "Aplikovat na DB"}
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-lg bg-secondary/5 border border-secondary/10">
          <Info className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Každá karta představuje jedno <strong>pole v profilu</strong> uživatele, které tvoří hierarchickou vazbu.
            <strong> Kdo nastavuje</strong> = kdo má právo tuto vazbu vytvořit nebo změnit.
            <strong> Aplikovat na DB</strong> přepíše UPDATE politiky na tabulce profiles.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map((r, i) => (
            <div key={i} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono font-semibold text-secondary bg-secondary/10 px-2 py-0.5 rounded">
                  {r.relationship || "nové_pole"}
                </code>
                <Button size="sm" variant="ghost" onClick={() => removeRule(i)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Pole v databázi</label>
                  <Select value={r.relationship} onValueChange={(v) => updateRule(i, "relationship", v)}>
                    <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="font-mono">{o.label}</span>
                          <span className="text-muted-foreground ml-2">— {o.desc}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Co znamená</label>
                  <Select value={r.meaning} onValueChange={(v) => updateRule(i, "meaning", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEANING_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Kdo nastavuje</label>
                  <Select value={r.whoSets} onValueChange={(v) => updateRule(i, "whoSets", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WHO_SETS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <SqlPreviewBlock sqlPreview={rls.sqlPreview} setSqlPreview={rls.setSqlPreview} applyErrors={rls.applyErrors} />
      </CardContent>
    </Card>
  );
}

// ─── Notification Rules Tab ───────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  { value: "new_member", label: "Nový člen", description: "Při registraci nového člena do struktury" },
  { value: "promotion_approved", label: "Povýšení", description: "Při schválení povýšení" },
  { value: "meeting_reminder", label: "Připomínka schůzky", description: "Před plánovanou schůzkou" },
  { value: "weekly_summary", label: "Týdenní souhrn", description: "Souhrn aktivit na konci týdne" },
  { value: "goal_achieved", label: "Cíl splněn", description: "Při dosažení nastaveného cíle" },
  { value: "custom", label: "Vlastní", description: "Vlastní typ notifikace" },
] as const;

const TEMPLATE_VARS: Record<string, string[]> = {
  new_member: ["{{member_name}}", "{{role}}"],
  promotion_approved: ["{{member_name}}", "{{new_role}}", "{{old_role}}"],
  meeting_reminder: ["{{client_name}}", "{{meeting_time}}", "{{meeting_type}}"],
  weekly_summary: ["{{fsa_count}}", "{{ser_count}}", "{{poh_count}}", "{{bj_total}}"],
  goal_achieved: ["{{member_name}}", "{{goal_name}}", "{{goal_value}}"],
  custom: [],
};

interface NotifRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  title_template: string;
  body_template: string;
  recipient_roles: string[];
  is_active: boolean;
  send_push: boolean;
  send_in_app: boolean;
}

function NotificationRulesTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NotifRule>>({});

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["notification_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_rules")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as NotifRule[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (rule: Partial<NotifRule>) => {
      if (rule.id) {
        const { error } = await supabase
          .from("notification_rules")
          .update({
            name: rule.name,
            description: rule.description,
            trigger_event: rule.trigger_event,
            title_template: rule.title_template,
            body_template: rule.body_template,
            recipient_roles: rule.recipient_roles,
            is_active: rule.is_active,
            send_push: rule.send_push,
            send_in_app: rule.send_in_app,
          })
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_rules")
          .insert({
            name: rule.name!,
            trigger_event: rule.trigger_event!,
            title_template: rule.title_template || "",
            body_template: rule.body_template || "",
            recipient_roles: rule.recipient_roles || [],
            is_active: rule.is_active ?? true,
            send_push: rule.send_push ?? true,
            send_in_app: rule.send_in_app ?? true,
            description: rule.description || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification_rules"] });
      setEditingId(null);
      setEditForm({});
      toast.success("Pravidlo uloženo");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification_rules"] });
      toast.success("Pravidlo smazáno");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("notification_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification_rules"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (rule: NotifRule) => {
    setEditingId(rule.id);
    setEditForm({ ...rule });
  };

  const startNew = () => {
    setEditingId("new");
    setEditForm({
      name: "",
      trigger_event: "custom",
      title_template: "",
      body_template: "",
      recipient_roles: [],
      is_active: true,
      send_push: true,
      send_in_app: true,
      description: "",
    });
  };

  const toggleRole = (role: string) => {
    const roles = editForm.recipient_roles || [];
    setEditForm({
      ...editForm,
      recipient_roles: roles.includes(role)
        ? roles.filter((r) => r !== role)
        : [...roles, role],
    });
  };

  const triggerLabel = (event: string) =>
    TRIGGER_EVENTS.find((t) => t.value === event)?.label || event;

  if (isLoading) return <div className="p-8 text-muted-foreground">Načítání...</div>;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Systémové notifikace
        </CardTitle>
        <Button size="sm" onClick={startNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nové pravidlo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Role matrix header */}
        <div className="text-xs text-muted-foreground mb-2">
          Matice: kdo dostane notifikaci. Zapněte/vypněte celé pravidlo přepínačem.
        </div>

        {/* Rules list */}
        <div className="space-y-3">
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            const form = isEditing ? editForm : rule;

            return (
              <div
                key={rule.id}
                className="border border-border rounded-lg p-4 space-y-3"
                style={{ opacity: rule.is_active ? 1 : 0.6 }}
              >
                {isEditing ? (
                  <EditRuleForm
                    form={editForm}
                    setForm={setEditForm}
                    toggleRole={toggleRole}
                    onSave={() => upsertMutation.mutate(editForm)}
                    onCancel={() => { setEditingId(null); setEditForm({}); }}
                    saving={upsertMutation.isPending}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: rule.id, is_active: v })}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{rule.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Spouštěč: {triggerLabel(rule.trigger_event)}
                            {rule.description && ` — ${rule.description}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Opravdu smazat toto pravidlo?")) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Role badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.map((role) => (
                        <span
                          key={role}
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: rule.recipient_roles.includes(role) ? "#00abbd" : "#e1e9eb",
                            color: rule.recipient_roles.includes(role) ? "#fff" : "#8e8e93",
                          }}
                        >
                          {ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>

                    {/* Push/In-app indicators */}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {rule.send_push && <span className="flex items-center gap-1">📱 Push</span>}
                      {rule.send_in_app && <span className="flex items-center gap-1">🔔 In-app</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* New rule form */}
          {editingId === "new" && (
            <div className="border border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
              <EditRuleForm
                form={editForm}
                setForm={setEditForm}
                toggleRole={toggleRole}
                onSave={() => upsertMutation.mutate(editForm)}
                onCancel={() => { setEditingId(null); setEditForm({}); }}
                saving={upsertMutation.isPending}
                isNew
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditRuleForm({
  form,
  setForm,
  toggleRole,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: Partial<NotifRule>;
  setForm: (f: Partial<NotifRule>) => void;
  toggleRole: (role: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  const vars = TEMPLATE_VARS[form.trigger_event || "custom"] || [];

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{isNew ? "Nové pravidlo" : "Upravit pravidlo"}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Název</Label>
          <Input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Název notifikace"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Spouštěč</Label>
          <Select
            value={form.trigger_event || "custom"}
            onValueChange={(v) => setForm({ ...form, trigger_event: v })}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRIGGER_EVENTS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label} — {t.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Popis</Label>
        <Input
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Volitelný popis"
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Titulek notifikace</Label>
          <Input
            value={form.title_template || ""}
            onChange={(e) => setForm({ ...form, title_template: e.target.value })}
            placeholder="Titulek"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Text notifikace</Label>
          <Input
            value={form.body_template || ""}
            onChange={(e) => setForm({ ...form, body_template: e.target.value })}
            placeholder="Text s proměnnými"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {vars.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Dostupné proměnné: {vars.map((v) => (
            <code key={v} className="bg-muted px-1 rounded mx-0.5">{v}</code>
          ))}
        </div>
      )}

      {/* Role checkboxes */}
      <div>
        <Label className="text-xs mb-1.5 block">Příjemci (role)</Label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => {
            const checked = (form.recipient_roles || []).includes(role);
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className="text-xs px-3 py-1 rounded-full font-medium border transition-colors"
                style={{
                  background: checked ? "#00abbd" : "transparent",
                  color: checked ? "#fff" : "inherit",
                  borderColor: checked ? "#00abbd" : "#e1e9eb",
                }}
              >
                {ROLE_LABELS[role]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Delivery toggles */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.send_push ?? true}
            onCheckedChange={(v) => setForm({ ...form, send_push: v })}
          />
          Push notifikace
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.send_in_app ?? true}
            onCheckedChange={(v) => setForm({ ...form, send_in_app: v })}
          />
          In-app notifikace
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={saving || !form.name || !form.trigger_event}>
          <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Ukládám..." : "Uložit"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Zrušit</Button>
      </div>
    </div>
  );
}
