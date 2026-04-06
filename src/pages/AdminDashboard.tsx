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
import { Save, Shield, Users, Settings2, Search, Eye, Lock, GitBranch } from "lucide-react";

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

type PermAction = "vidí" | "edituje" | "vytváří" | "maže";

interface PermRule {
  table: string;
  label: string;
  matrix: Record<string, PermAction[]>;
}

const PERM_DATA: PermRule[] = [
  {
    table: "profiles",
    label: "Profily uživatelů",
    matrix: {
      Admin: ["vidí", "edituje"],
      Vedoucí: ["vidí", "edituje"],
      "Bud. vedoucí": ["vidí"],
      Garant: ["vidí", "edituje"],
      Získatel: ["vidí"],
      Nováček: ["vidí"],
    },
  },
  {
    table: "activity_records",
    label: "Záznamy aktivit",
    matrix: {
      Admin: ["vidí", "edituje"],
      Vedoucí: ["vidí"],
      "Bud. vedoucí": [],
      Garant: ["vidí"],
      Získatel: ["vidí", "edituje", "vytváří", "maže"],
      Nováček: ["vidí", "edituje", "vytváří", "maže"],
    },
  },
  {
    table: "client_meetings",
    label: "Schůzky s klienty",
    matrix: {
      Admin: ["vidí"],
      Vedoucí: ["vidí"],
      "Bud. vedoucí": [],
      Garant: ["vidí"],
      Získatel: ["vidí", "edituje", "vytváří", "maže"],
      Nováček: ["vidí", "edituje", "vytváří", "maže"],
    },
  },
  {
    table: "cases",
    label: "Byznys případy",
    matrix: {
      Admin: ["vidí", "edituje"],
      Vedoucí: ["vidí"],
      "Bud. vedoucí": [],
      Garant: [],
      Získatel: ["vidí", "edituje", "vytváří", "maže"],
      Nováček: ["vidí", "edituje", "vytváří", "maže"],
    },
  },
  {
    table: "notifications",
    label: "Notifikace",
    matrix: {
      Admin: [],
      Vedoucí: ["vidí", "vytváří"],
      "Bud. vedoucí": [],
      Garant: ["vytváří"],
      Získatel: ["vidí", "edituje", "vytváří", "maže"],
      Nováček: ["vidí", "edituje", "vytváří", "maže"],
    },
  },
  {
    table: "promotion_requests",
    label: "Žádosti o povýšení",
    matrix: {
      Admin: ["vidí", "edituje"],
      Vedoucí: ["vidí", "edituje", "maže"],
      "Bud. vedoucí": [],
      Garant: [],
      Získatel: ["vidí"],
      Nováček: ["vidí"],
    },
  },
  {
    table: "vedouci_goals",
    label: "Cíle vedoucího",
    matrix: {
      Admin: [],
      Vedoucí: ["vidí", "edituje", "vytváří", "maže"],
      "Bud. vedoucí": [],
      Garant: [],
      Získatel: [],
      Nováček: [],
    },
  },
  {
    table: "app_config",
    label: "Nastavení aplikace",
    matrix: {
      Admin: ["vidí", "edituje", "vytváří"],
      Vedoucí: [],
      "Bud. vedoucí": [],
      Garant: [],
      Získatel: [],
      Nováček: [],
    },
  },
];

interface VisibilityRule {
  role: string;
  sees: string;
  scope: string;
}

const VISIBILITY_RULES: VisibilityRule[] = [
  { role: "Vedoucí", sees: "Profily", scope: "Celý svůj podstrom (is_in_vedouci_subtree)" },
  { role: "Vedoucí", sees: "Aktivity & Schůzky", scope: "Lidé s vedouci_id = já" },
  { role: "Vedoucí", sees: "Byznys případy", scope: "Celý podstrom (is_in_vedouci_subtree)" },
  { role: "Vedoucí", sees: "Promotion requests", scope: "Všechny (role = vedouci)" },
  { role: "Garant", sees: "Profily", scope: "Lidé s garant_id = já" },
  { role: "Garant", sees: "Aktivity & Schůzky", scope: "Lidé s garant_id = já" },
  { role: "Získatel / Nováček", sees: "Vše vlastní", scope: "Pouze vlastní záznamy (user_id = já)" },
  { role: "Admin", sees: "Vše", scope: "Celá databáze (is_admin())" },
];

interface HierarchyRule {
  relationship: string;
  meaning: string;
  whoSets: string;
}

const HIERARCHY_RULES: HierarchyRule[] = [
  { relationship: "vedouci_id", meaning: "Vedoucí tohoto člena — řídí celý podstrom", whoSets: "Vedoucí nebo Admin" },
  { relationship: "garant_id", meaning: "Garant tohoto nováčka — přímý mentor", whoSets: "Vedoucí nebo Admin" },
  { relationship: "ziskatel_id", meaning: "Kdo tohoto člena získal — tvoří strukturu pro povýšení", whoSets: "Onboarding / Vedoucí / Admin" },
  { relationship: "ziskatel_name", meaning: "Jméno získatele (záloha pokud není v systému)", whoSets: "Onboarding" },
];

const ACTION_COLORS: Record<PermAction, string> = {
  vidí: "bg-secondary/20 text-secondary",
  edituje: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  vytváří: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  maže: "bg-destructive/20 text-destructive",
};

function PermissionsTab() {
  return (
    <div className="space-y-6">
      {/* Visibility rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> Kdo vidí čí data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Role</th>
                  <th className="text-left p-3 font-medium">Vidí</th>
                  <th className="text-left p-3 font-medium">Rozsah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {VISIBILITY_RULES.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.role}</td>
                    <td className="p-3">{r.sees}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{r.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Permission matrix per table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Matice oprávnění (tabulka × role)
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                {PERM_DATA.map((rule) => (
                  <tr key={rule.table} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{rule.label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{rule.table}</div>
                    </td>
                    {PERM_ROLES.map((role) => (
                      <td key={role} className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(rule.matrix[role] || []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            rule.matrix[role].map((action) => (
                              <span
                                key={action}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ACTION_COLORS[action]}`}
                              >
                                {action}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * Oprávnění „vidí/edituje" u Vedoucího a Garanta se vztahuje pouze na jejich podstrom/nováčky (viz tabulka výše). 
            Vlastní záznamy může každý vidět a editovat vždy.
          </p>
        </CardContent>
      </Card>

      {/* Hierarchy relationships */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Hierarchie — vazby v profilu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Pole</th>
                  <th className="text-left p-3 font-medium">Význam</th>
                  <th className="text-left p-3 font-medium">Kdo nastavuje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {HIERARCHY_RULES.map((r) => (
                  <tr key={r.relationship} className="hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs font-medium">{r.relationship}</td>
                    <td className="p-3">{r.meaning}</td>
                    <td className="p-3 text-muted-foreground">{r.whoSets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
