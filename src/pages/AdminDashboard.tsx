import { useState, useEffect, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import {
  Save,
  Shield,
  Users,
  Settings2,
  Search,
  Eye,
  Lock,
  GitBranch,
  Plus,
  Trash2,
  ChevronDown,
  RotateCcw,
  Info,
  Zap,
  FileCode,
  Bell,
  Pencil,
  SendHorizontal,
  Clock,
  FileText,
  History,
  Target,
  Activity,
  RefreshCw,
  Coins,
  CalendarDays,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { AdminPillTabs } from "@/components/admin/AdminPillTabs";
import { GoalConfiguratorTab } from "@/components/admin/GoalConfiguratorTab";
import { NotificationDiagnosticsTab } from "@/components/admin/NotificationDiagnosticsTab";
import { SchuzkyTab } from "@/components/admin/SchuzkyTab";
import { TransakceTab } from "@/components/admin/TransakceTab";

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

const ADMIN_TABS = [
  { key: "users", label: "Uživatelé", icon: Users },
  { key: "schuzky", label: "Schůzky", icon: CalendarDays },
  { key: "transakce", label: "Transakce", icon: Coins },
  { key: "settings", label: "Nastavení", icon: Settings2 },
  { key: "permissions", label: "Oprávnění", icon: Lock },
  { key: "notifications", label: "Notifikace", icon: Bell },
  { key: "goals", label: "Cíle", icon: Target },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { godMode, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  if (!godMode || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-heading font-bold text-foreground">Admin Dashboard</h1>
      </div>

      <AdminPillTabs tabs={ADMIN_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "schuzky" && <SchuzkyTab />}
        {activeTab === "transakce" && <TransakceTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "permissions" && <PermissionsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "goals" && <GoalConfiguratorTab />}
      </div>
    </div>
  );
}

// ─── Settings Tab (consolidated) ──────────────────────────────────────────────

function SettingsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Pravidla povýšení</h2>
        <PromotionRulesTab />
      </div>
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Produkční období</h2>
        <PeriodConfigTab />
      </div>
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Defaultní trvání schůzek</h2>
        <MeetingDefaultsTab />
      </div>
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-4">PDF Export</h2>
        <PdfExportTab />
      </div>
    </div>
  );
}

// ─── Notifications Tab (with sub-tabs) ────────────────────────────────────────

function NotificationsTab() {
  return (
    <Tabs defaultValue="rules" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="rules" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" /> Pravidla
        </TabsTrigger>
        <TabsTrigger value="log" className="gap-1.5">
          <History className="h-3.5 w-3.5" /> Historie odeslaných
        </TabsTrigger>
        <TabsTrigger value="diagnostics" className="gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Diagnostika
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <NotificationRulesTab />
      </TabsContent>
      <TabsContent value="log">
        <NotificationLogTab />
      </TabsContent>
      <TabsContent value="diagnostics">
        <NotificationDiagnosticsTab />
      </TabsContent>
    </Tabs>
  );
}

// ─── Promotion Rules Tab ──────────────────────────────────────────────────────

function PromotionRulesTab() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({
    queryKey: ["app_config", "promotion_rules"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("value").eq("key", "promotion_rules").single();
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
      const { data } = await supabase.from("app_config").select("value").eq("key", "period_end_day").single();
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
          <p className="text-xs text-muted-foreground mt-1">
            Pokud den není pracovní, posune se na další pracovní den.
          </p>
        </div>
        <div>
          <Label>Pravidlo pro prosinec</Label>
          <Select value={decRule} onValueChange={setDecRule}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
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
        .select(
          "id, full_name, role, is_active, is_admin, vedouci_id, garant_id, ziskatel_id, osobni_id, monthly_bj_goal, personal_bj_goal",
        )
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

  const filtered = profiles.filter(
    (p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.role.toLowerCase().includes(search.toLowerCase()) ||
      (p.osobni_id || "").toLowerCase().includes(search.toLowerCase()),
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
                        <SelectTrigger className="h-8 w-36">
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
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">
                        {p.vedouci_id ? p.vedouci_id.slice(0, 8) + "…" : "–"}
                      </span>
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
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">
                        {p.garant_id ? p.garant_id.slice(0, 8) + "…" : "–"}
                      </span>
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
                      <span className="text-[11px] text-muted-foreground truncate max-w-[100px] block">
                        {p.ziskatel_id ? p.ziskatel_id.slice(0, 8) + "…" : "–"}
                      </span>
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
                        <Button
                          size="sm"
                          variant="default"
                          onClick={saveEdit}
                          disabled={mutation.isPending}
                          className="h-7 text-xs"
                        >
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
      const { data } = await supabase.from("app_config").select("value").eq("key", configKey).single();
      return (data?.value as unknown as T) ?? fallback;
    },
  });

  const [localData, setLocalData] = useState<T>(fallback);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setLocalData(data);
      setDirty(false);
    }
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

const ROLE_OPTIONS = [
  "Admin",
  "Vedoucí",
  "Bud. vedoucí",
  "Garant",
  "Získatel",
  "Nováček",
  "Získatel / Nováček",
] as const;
const SEES_OPTIONS = [
  "Profily",
  "Aktivity & Schůzky",
  "Byznys případy",
  "Promotion requests",
  "Vše vlastní",
  "Vše",
] as const;
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
  { role: "Vedoucí", sees: "Můj byznys", scope: "Celý svůj podstrom (is_in_vedouci_subtree)" },
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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Nejsi přihlášen");
      return;
    }
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
    } catch (e: any) {
      toast.error(e.message);
    }
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
    } catch (e: any) {
      toast.error(`Chyba: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  return { sqlPreview, setSqlPreview, applying, applyErrors, previewSql, applyToDb };
}

function SqlPreviewBlock({
  sqlPreview,
  setSqlPreview,
  applyErrors,
}: {
  sqlPreview: string[] | null;
  setSqlPreview: (v: null) => void;
  applyErrors: string[];
}) {
  if (!sqlPreview) return null;
  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-heading font-semibold">Náhled SQL příkazů</h4>
        <Button size="sm" variant="ghost" onClick={() => setSqlPreview(null)} className="h-7 text-xs">
          Zavřít
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-3 max-h-64 overflow-y-auto">
        <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all">
          {sqlPreview.join("\n\n")}
        </pre>
      </div>
      {applyErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive mb-1">Varování:</p>
          {applyErrors.map((e, i) => (
            <p key={i} className="text-[11px] text-destructive/80">
              {e}
            </p>
          ))}
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
    update((prev) => [
      ...prev,
      { role: "Nováček", sees: "Vše vlastní", scope: "Pouze vlastní záznamy (user_id = já)" },
    ]);
  };
  const removeRule = (index: number) => {
    update((prev) => prev.filter((_, i) => i !== index));
  };
  const resetToDefaults = () => {
    update(() => [...DEFAULT_VISIBILITY]);
  };

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-4 text-muted-foreground">Načítání…</CardContent>
      </Card>
    );

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
            <Button
              size="sm"
              variant="outline"
              onClick={resetToDefaults}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={addRule} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Pravidlo
            </Button>
            {dirty && (
              <Button
                size="sm"
                onClick={() => save.mutate(rules)}
                disabled={save.isPending}
                className="h-7 text-xs gap-1"
              >
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
            <strong> Náhled SQL</strong> ukáže vygenerované SELECT politiky. <strong>Aplikovat na DB</strong> je zapíše
            do databáze. ⚠️ Toto přepíše stávající SELECT RLS politiky na dotčených tabulkách!
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
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEES_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-foreground w-10 shrink-0">Scope</label>
                      <Select value={rule.scope} onValueChange={(v) => updateRule(idx, "scope", v)}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRule(idx)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                  >
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
      }),
    );
  };

  const previewSql = async () => {
    await rls.previewSql({ matrix: rules });
  };

  const applyToDb = async () => {
    await rls.applyToDb({ matrix: rules }, () => save.mutateAsync(rules));
  };

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-4 text-muted-foreground">Načítání…</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Matice oprávnění (tabulka × role)
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {dirty && (
              <Button
                size="sm"
                onClick={() => save.mutate(rules)}
                disabled={save.isPending}
                className="h-7 text-xs gap-1"
              >
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
            <strong> Aplikovat na DB</strong> smaže stávající RLS politiky a vytvoří nové podle matice. ⚠️ Špatná
            konfigurace může zablokovat přístup k datům!
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
                  <th key={r} className="text-left p-3 font-medium text-xs">
                    {r}
                  </th>
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
  {
    relationship: "ziskatel_id",
    meaning: "Kdo tohoto člena získal — tvoří strukturu pro povýšení",
    whoSets: "Onboarding / Vedoucí / Admin",
  },
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

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-4 text-muted-foreground">Načítání…</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Hierarchie — vazby v profilu
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={resetToDefaults}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" variant="outline" onClick={addRule} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Vazba
            </Button>
            {dirty && (
              <Button
                size="sm"
                onClick={() => save.mutate(rules)}
                disabled={save.isPending}
                className="h-7 text-xs gap-1"
              >
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRule(i)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Pole v databázi</label>
                  <Select value={r.relationship} onValueChange={(v) => updateRule(i, "relationship", v)}>
                    <SelectTrigger className="h-8 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEANING_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Kdo nastavuje</label>
                  <Select value={r.whoSets} onValueChange={(v) => updateRule(i, "whoSets", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WHO_SETS_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
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
  { value: "promotion_eligible", label: "Splnění podmínek povýšení", description: "Člen splní podmínky pro povýšení" },
  { value: "promotion_approved", label: "Povýšení schváleno", description: "Při schválení povýšení" },
  { value: "promotion_rejected", label: "Povýšení zamítnuto", description: "Při zamítnutí povýšení" },
  { value: "meeting_reminder", label: "Připomínka schůzky", description: "Před plánovanou schůzkou" },
  { value: "weekly_summary", label: "Týdenní souhrn", description: "Souhrn aktivit na konci týdne" },
  { value: "goal_achieved", label: "Cíl splněn", description: "Při dosažení nastaveného cíle" },
  { value: "scheduled", label: "Pravidelná", description: "Opakovaná notifikace v nastaveném čase" },
  { value: "custom", label: "Vlastní", description: "Vlastní typ notifikace" },
] as const;

const TEMPLATE_VARS: Record<string, string[]> = {
  new_member: ["{{member_name}}", "{{role}}"],
  promotion_eligible: ["{{member_name}}", "{{role_label}}", "{{cumulative_bj}}", "{{structure_info}}"],
  promotion_approved: ["{{role_label}}", "{{vedouci_name}}"],
  promotion_rejected: ["{{role_label}}", "{{vedouci_name}}"],
  meeting_reminder: ["{{client_name}}", "{{meeting_time}}", "{{meeting_type}}"],
  weekly_summary: ["{{fsa_count}}", "{{ser_count}}", "{{poh_count}}", "{{bj_total}}"],
  goal_achieved: ["{{member_name}}", "{{goal_name}}", "{{goal_value}}"],
  scheduled: [
    "{{total_bj}}",
    "{{total_fsa}}",
    "{{total_ser}}",
    "{{total_poh}}",
    "{{total_meetings}}",
    "{{member_count}}",
    "{{pending_promotions}}",
    "{{date}}",
    "{{day_name}}",
  ],
  custom: [],
};

const ALL_TEMPLATE_VARS: { category: string; vars: { name: string; description: string }[] }[] = [
  {
    category: "Člen / Profil",
    vars: [
      { name: "{{member_name}}", description: "Celé jméno člena" },
      { name: "{{role}}", description: "Aktuální role (novacek, ziskatel…)" },
      { name: "{{role_label}}", description: "Česky pojmenovaná role" },
      { name: "{{osobni_id}}", description: "Osobní ID člena" },
      { name: "{{vedouci_name}}", description: "Jméno vedoucího" },
      { name: "{{garant_name}}", description: "Jméno garanta" },
      { name: "{{ziskatel_name}}", description: "Jméno získatele" },
      { name: "{{avatar_url}}", description: "URL avataru člena" },
      { name: "{{personal_bj_goal}}", description: "Osobní BJ cíl" },
      { name: "{{monthly_bj_goal}}", description: "Měsíční BJ cíl" },
    ],
  },
  {
    category: "Povýšení",
    vars: [
      { name: "{{cumulative_bj}}", description: "Kumulativní BJ člena" },
      { name: "{{direct_ziskatels}}", description: "Počet přímých získatelů" },
      { name: "{{requested_role}}", description: "Požadovaná role povýšení" },
      { name: "{{structure_info}}", description: "Popis struktury (počty)" },
      { name: "{{promotion_status}}", description: "Stav žádosti (approved/rejected)" },
    ],
  },
  {
    category: "Schůzka (detail)",
    vars: [
      { name: "{{client_name}}", description: "Jméno klienta / název případu" },
      { name: "{{case_name}}", description: "Název obchodního případu" },
      { name: "{{meeting_type}}", description: "Typ schůzky (FSA, SER, POH, POR)" },
      { name: "{{meeting_date}}", description: "Datum schůzky" },
      { name: "{{meeting_time}}", description: "Čas schůzky" },
      { name: "{{location_type}}", description: "Typ místa (kancelář, online…)" },
      { name: "{{location_detail}}", description: "Detail místa" },
      { name: "{{duration_minutes}}", description: "Délka schůzky v minutách" },
      { name: "{{bj}}", description: "BJ ze schůzky" },
      { name: "{{podepsane_bj}}", description: "Podepsané BJ" },
      { name: "{{potencial_bj}}", description: "Potenciální BJ" },
      { name: "{{vizi_spoluprace}}", description: "Vize spolupráce (ano/ne)" },
    ],
  },
  {
    category: "Doporučení ze schůzky",
    vars: [
      { name: "{{doporuceni_fsa}}", description: "Počet doporučení na FSA" },
      { name: "{{doporuceni_pohovor}}", description: "Počet doporučení na pohovor" },
      { name: "{{doporuceni_poradenstvi}}", description: "Počet doporučení na poradenství" },
      { name: "{{has_pohovor}}", description: "Naplánován pohovor (ano/ne)" },
      { name: "{{pohovor_date}}", description: "Datum pohovoru" },
      { name: "{{has_poradenstvi}}", description: "Naplánováno poradenství (ano/ne)" },
      { name: "{{poradenstvi_date}}", description: "Datum poradenství" },
      { name: "{{poradenstvi_status}}", description: "Stav poradenství" },
    ],
  },
  {
    category: "Týdenní aktivita",
    vars: [
      { name: "{{week_start}}", description: "Začátek týdne (datum)" },
      { name: "{{fsa_planned}}", description: "Plánované FSA" },
      { name: "{{fsa_actual}}", description: "Skutečné FSA" },
      { name: "{{ser_planned}}", description: "Plánované SER" },
      { name: "{{ser_actual}}", description: "Skutečné SER" },
      { name: "{{poh_planned}}", description: "Plánované POH" },
      { name: "{{poh_actual}}", description: "Skutečné POH" },
      { name: "{{por_planned}}", description: "Plánované POR" },
      { name: "{{por_actual}}", description: "Skutečné POR" },
      { name: "{{ref_planned}}", description: "Plánovaná doporučení" },
      { name: "{{ref_actual}}", description: "Skutečná doporučení" },
      { name: "{{bj_fsa_actual}}", description: "BJ z FSA" },
      { name: "{{bj_ser_actual}}", description: "BJ ze SER" },
      { name: "{{kl_fsa_actual}}", description: "Klienti z FSA" },
      { name: "{{dop_kl_actual}}", description: "Doporučení klientů" },
    ],
  },
  {
    category: "Cíle vedoucího",
    vars: [
      { name: "{{goal_name}}", description: "Název splněného cíle" },
      { name: "{{goal_value}}", description: "Hodnota / procento cíle" },
      { name: "{{team_bj_goal}}", description: "Týmový BJ cíl" },
      { name: "{{vedouci_count_goal}}", description: "Cíl počtu vedoucích" },
      { name: "{{budouci_vedouci_count_goal}}", description: "Cíl počtu budoucích vedoucích" },
      { name: "{{garant_count_goal}}", description: "Cíl počtu garantů" },
    ],
  },
  {
    category: "Můj byznys",
    vars: [
      { name: "{{case_status}}", description: "Stav případu (aktivní, ukončený)" },
      { name: "{{case_poznamka}}", description: "Poznámka k případu" },
    ],
  },
  {
    category: "Pravidelné (agregáty)",
    vars: [
      { name: "{{total_bj}}", description: "Celkové BJ za aktuální týden" },
      { name: "{{total_fsa}}", description: "Počet FSA za týden" },
      { name: "{{total_ser}}", description: "Počet SER za týden" },
      { name: "{{total_poh}}", description: "Počet POH za týden" },
      { name: "{{total_meetings}}", description: "Celkový počet schůzek za týden" },
      { name: "{{member_count}}", description: "Počet aktivních členů" },
      { name: "{{pending_promotions}}", description: "Čekající žádosti o povýšení" },
      { name: "{{date}}", description: "Aktuální datum (česky)" },
      { name: "{{day_name}}", description: "Název dne v týdnu (česky)" },
    ],
  },
];
const SCHEDULE_TYPES = [
  { value: "event", label: "Událost", description: "Spustí se při výskytu události" },
  { value: "daily", label: "Denně", description: "Každý den v nastavený čas" },
  { value: "weekly", label: "Týdně", description: "Jednou týdně v nastavený den a čas" },
  { value: "monthly", label: "Měsíčně", description: "Jednou měsíčně v nastavený den a čas" },
] as const;

const DAY_NAMES = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];

const RECIPIENT_TYPES = [
  {
    value: "self",
    label: "Dotčená osoba",
    description: "Notifikaci dostane přímo osoba, které se událost týká (např. nový člen dostane uvítací zprávu)",
  },
  {
    value: "hierarchy",
    label: "Nadřízení",
    description:
      "Notifikaci dostanou nadřízení osoby (vedoucí, BV, garant, získatel) — filtrováno podle vybraných rolí",
  },
  {
    value: "by_role",
    label: "Podle role",
    description: "Notifikaci dostanou všichni uživatelé s vybranou rolí bez ohledu na strukturu",
  },
] as const;

const SENDER_TYPES = [
  {
    value: "system",
    label: "Systém",
    description: "Odesílatelem je systém (sender_id = recipient_id). Vhodné pro automatické notifikace.",
  },
  {
    value: "self",
    label: "Dotčená osoba",
    description: "Odesílatelem je osoba, které se událost týká (např. člen, který splnil podmínku).",
  },
  {
    value: "hierarchy",
    label: "Nadřízený",
    description: "Odesílatelem je přímý nadřízený dotčené osoby (vedoucí, garant, získatel).",
  },
] as const;

const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  self: "Dotčená osoba",
  hierarchy: "Nadřízení v hierarchii",
  by_role: "Podle role",
};

const SENDER_TYPE_LABELS: Record<string, string> = {
  system: "Systém",
  self: "Dotčená osoba",
  hierarchy: "Nadřízený",
};

interface NotifRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  title_template: string;
  body_template: string;
  recipient_roles: string[];
  recipient_type: string;
  is_active: boolean;
  send_push: boolean;
  send_in_app: boolean;
  sender_type: string;
  schedule_type: string;
  schedule_time: string | null;
  schedule_day_of_week: number | null;
  schedule_day_of_month: number | null;
  redirect_url: string | null;
}

const APP_PAGES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/aktivity", label: "Moje aktivity" },
  { value: "/tym", label: "Správa týmu" },
  { value: "/ukoly", label: "Úkoly" },
  { value: "/obchodni-pripady", label: "Můj byznys" },
  { value: "/obchod", label: "Byznys" },
  { value: "/kalendar", label: "Kalendář" },
  { value: "/hledani", label: "Hledání" },
  { value: "/zapracovani", label: "Zapracování" },
  { value: "/zapracovani-management", label: "Zapracování (management)" },
  { value: "/admin", label: "Admin Dashboard" },
];

function NotificationRulesTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NotifRule>>({});
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [testRule, setTestRule] = useState<NotifRule | null>(null);
  const [testVars, setTestVars] = useState<Record<string, string>>({});
  const [showVarsModal, setShowVarsModal] = useState(false);
  // Příjemce testu: null = admin sobě; jinak UUID vybraného uživatele
  const [testRecipientId, setTestRecipientId] = useState<string | null>(null);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);

  // ─── Force-update broadcast ───────────────────────────────────────────
  // Používá se po deployi nové verze, kdy uživatelé mají v PWA cache
  // staré HTML/JS bundly. Notifikace nese type='force_update' a UI
  // (NotificationBell.tsx) ho rozpozná a vykreslí tlačítko, které
  // smaže cache + odregistruje SW + hard reloadne.
  const FORCE_UPDATE_TITLE_DEFAULT = "Je dostupná nová verze aplikace";
  const FORCE_UPDATE_BODY_DEFAULT =
    "Klikni na tlačítko 'Aktualizovat' a aplikace se sama aktualizuje. Zůstaneš přihlášený.";
  const [forceUpdateOpen, setForceUpdateOpen] = useState(false);
  const [forceUpdateTitle, setForceUpdateTitle] = useState(FORCE_UPDATE_TITLE_DEFAULT);
  const [forceUpdateBody, setForceUpdateBody] = useState(FORCE_UPDATE_BODY_DEFAULT);
  const [forceUpdateSending, setForceUpdateSending] = useState(false);

  // Aktivní uživatelé pro picker (načítáme jen když je otevřený test dialog,
  // aby se nešidilo loading při prvním kliknutí)
  const { data: activeUsers = [] } = useQuery({
    queryKey: ["admin_active_profiles_for_test"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .order("full_name");
      return (data || []) as { id: string; full_name: string; role: string }[];
    },
    enabled: !!testRule,
    staleTime: 60 * 1000,
  });

  const selectedRecipient = useMemo(
    () => activeUsers.find((u) => u.id === testRecipientId) || null,
    [activeUsers, testRecipientId],
  );

  const extractPlaceholders = (rule: NotifRule): string[] => {
    const combined = `${rule.title_template} ${rule.body_template}`;
    const matches = combined.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
  };

  const openTestDialog = (rule: NotifRule) => {
    const placeholders = extractPlaceholders(rule);
    const defaults: Record<string, string> = {};
    placeholders.forEach((p) => {
      defaults[p] = "";
    });
    setTestVars(defaults);
    setTestRule(rule);
    setTestRecipientId(null); // default = admin sobě
  };

  // Broadcast notifikace všem aktivním uživatelům s tlačítkem "Aktualizovat".
  // Postup: 1) bulk-insert do `notifications` (jeden řádek per recipient),
  //         2) per-user volání send-push edge funkce (best effort).
  // Push může selhat (uživatel nemá registrované zařízení) — to nevadí,
  // in-app notifikace v zvonečku má button, který reset provede.
  const sendForceUpdateBroadcast = async () => {
    if (!user) return;
    const title = forceUpdateTitle.trim() || FORCE_UPDATE_TITLE_DEFAULT;
    const body = forceUpdateBody.trim() || FORCE_UPDATE_BODY_DEFAULT;

    setForceUpdateSending(true);
    try {
      // 1) Vytáhni všechny aktivní uživatele (admin má insert any policy
      //    z migrace 20260421130000)
      const { data: recipients, error: recErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true);
      if (recErr) {
        toast.error(`Načtení uživatelů selhalo: ${recErr.message}`);
        return;
      }
      if (!recipients || recipients.length === 0) {
        toast.warning("Žádní aktivní uživatelé.");
        return;
      }

      // 2) Bulk insert in-app notifikací. Deadline=dnes (povinné NOT NULL pole),
      //    ale pro force_update je irelevantní.
      const today = new Date().toISOString().split("T")[0];
      const rows = recipients.map((r) => ({
        sender_id: user.id,
        recipient_id: r.id,
        type: "force_update",
        title,
        body,
        deadline: today,
      }));
      const { data: inserted, error: insErr } = await supabase
        .from("notifications")
        .insert(rows)
        .select("id, recipient_id");
      if (insErr) {
        toast.error(`Insert notifikací selhal: ${insErr.message}`);
        return;
      }

      // 3) Push per recipient (best effort, paralelně)
      let pushOk = 0;
      let pushFail = 0;
      const insertedList = inserted || [];
      await Promise.all(
        insertedList.map(async (n: { id: string; recipient_id: string }) => {
          try {
            const { data, error } = await supabase.functions.invoke("send-push", {
              body: { notification_id: n.id },
            });
            if (error) {
              pushFail++;
            } else if ((data as any)?.pushed) {
              pushOk++;
            } else {
              pushFail++;
            }
          } catch {
            pushFail++;
          }
        }),
      );

      toast.success(
        `Force-update odesláno: ${insertedList.length} in-app, push ${pushOk}/${insertedList.length} doručeno`,
      );
      setForceUpdateOpen(false);
    } catch (e: any) {
      toast.error(`Chyba: ${e?.message || e}`);
    } finally {
      setForceUpdateSending(false);
    }
  };

  const sendTestNotification = async () => {
    if (!testRule || !user) return;
    setSendingTestId(testRule.id);
    try {
      const title = (testRule.title_template || "Test").replace(/\{\{(\w+)\}\}/g, (_, key) => testVars[key] || key);
      const body = (testRule.body_template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => testVars[key] || key);

      // Příjemce: pokud admin nevybral konkrétního uživatele, posíláme sobě.
      // Pokud vybral, posíláme tomu (pro test reálného doručení push notifikace
      // konkrétnímu uživateli — vyžaduje, aby cílový uživatel měl push subscription).
      const recipientId = testRecipientId || user.id;
      const isCustomRecipient = !!testRecipientId && testRecipientId !== user.id;

      // RESPEKTUJEME send_in_app a send_push flagy z pravidla.
      const wantsInApp = testRule.send_in_app !== false;
      const wantsPush = testRule.send_push !== false;

      let insertedId: string | null = null;
      let inAppOk = false;
      if (wantsInApp) {
        const { data: insRow, error: insErr } = await supabase
          .from("notifications")
          .insert({
            sender_id: user.id,
            recipient_id: recipientId,
            type: testRule.trigger_event || "test",
            title,
            body,
            deadline: new Date().toISOString().split("T")[0],
            redirect_url: testRule.redirect_url || null,
          })
          .select("id")
          .single();
        if (insErr) {
          toast.error(`In-app insert selhal: ${insErr.message}`);
        } else {
          insertedId = insRow?.id ?? null;
          inAppOk = true;
        }
      }

      let pushResult: { ok: boolean; pushed?: boolean; reason?: string; pushedCount?: number } = { ok: false };
      if (wantsPush) {
        // Posíláme přes send-push (sjednocená cesta), což taky umí inline
        // payload pokud nemáme notification_id.
        const pushBody = insertedId
          ? { notification_id: insertedId }
          : {
              recipient_id: recipientId,
              title,
              body,
              type: testRule.trigger_event || "test",
              redirect_url: testRule.redirect_url || null,
            };
        const { data, error } = await supabase.functions.invoke("send-push", { body: pushBody });
        if (error) {
          console.warn("send-push failed:", error);
          pushResult = { ok: false, reason: "function_error" };
        } else {
          pushResult = data || { ok: false };
        }
      }

      // Stavový toast — řekne, co se reálně podařilo doručit.
      const parts: string[] = [];
      if (wantsInApp) parts.push(inAppOk ? "in-app ✓" : "in-app ✗");
      if (wantsPush) {
        if (pushResult.pushed) {
          parts.push(`push ✓ (${pushResult.pushedCount ?? 1} zařízení)`);
        } else if (pushResult.reason === "no_subscription") {
          parts.push("push ✗ (na tomto účtu nejsou registrovaná žádná zařízení – povol notifikace v prohlížeči)");
        } else if (pushResult.reason === "subscription_expired") {
          parts.push("push ✗ (subscription vypršel, znovu povol notifikace)");
        } else {
          parts.push("push ✗");
        }
      }
      const summary = parts.length ? parts.join(", ") : "nic neodesláno (pravidlo má vypnutý in-app i push)";

      const recipientLabel = isCustomRecipient
        ? selectedRecipient?.full_name || "vybraný uživatel"
        : "tobě";
      const allGreen = (!wantsInApp || inAppOk) && (!wantsPush || pushResult.pushed);
      if (allGreen) {
        toast.success(`Testovací notifikace pro ${recipientLabel}: ${summary}`);
      } else {
        toast.warning(`Testovací notifikace pro ${recipientLabel} částečně: ${summary}`);
      }

      setTestRule(null);
      setTestRecipientId(null);
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    } finally {
      setSendingTestId(null);
    }
  };

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["notification_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_rules").select("*").order("created_at");
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
            recipient_type: rule.recipient_type,
            sender_type: rule.sender_type || "system",
            is_active: rule.is_active,
            send_push: rule.send_push,
            send_in_app: rule.send_in_app,
            schedule_type: rule.schedule_type || "event",
            schedule_time: rule.schedule_time || "08:00",
            schedule_day_of_week: rule.schedule_day_of_week ?? null,
            schedule_day_of_month: rule.schedule_day_of_month ?? null,
            redirect_url: rule.redirect_url || null,
          })
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_rules").insert({
          name: rule.name!,
          trigger_event: rule.trigger_event!,
          title_template: rule.title_template || "",
          body_template: rule.body_template || "",
          recipient_roles: rule.recipient_roles || [],
          recipient_type: rule.recipient_type || "by_role",
          sender_type: rule.sender_type || "system",
          is_active: rule.is_active ?? true,
          send_push: rule.send_push ?? true,
          send_in_app: rule.send_in_app ?? true,
          description: rule.description || null,
          schedule_type: rule.schedule_type || "event",
          schedule_time: rule.schedule_time || "08:00",
          schedule_day_of_week: rule.schedule_day_of_week ?? null,
          schedule_day_of_month: rule.schedule_day_of_month ?? null,
          redirect_url: rule.redirect_url || null,
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
      const { error } = await supabase.from("notification_rules").update({ is_active }).eq("id", id);
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
      recipient_type: "self",
      sender_type: "system",
      description: "",
      redirect_url: null,
    });
  };

  const toggleRole = (role: string) => {
    const roles = editForm.recipient_roles || [];
    setEditForm({
      ...editForm,
      recipient_roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role],
    });
  };

  const triggerLabel = (event: string) => TRIGGER_EVENTS.find((t) => t.value === event)?.label || event;

  if (isLoading) return <div className="p-8 text-muted-foreground">Načítání...</div>;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Systémové notifikace
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setForceUpdateOpen(true)}
            className="gap-1.5"
            title="Po deployi nové verze: pošle všem aktivním uživatelům notifikaci s tlačítkem, které smaže PWA cache a načte novou verzi."
          >
            <RefreshCw className="h-4 w-4" /> Vynutit aktualizaci
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowVarsModal(true)} className="gap-1.5">
            <Info className="h-4 w-4" /> Proměnné
          </Button>
          <Button size="sm" onClick={startNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nové pravidlo
          </Button>
        </div>
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
                    onCancel={() => {
                      setEditingId(null);
                      setEditForm({});
                    }}
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
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-1 items-center">
                            <span>Spouštěč: {triggerLabel(rule.trigger_event)}</span>
                            {(rule.schedule_type || "event") !== "event" && (
                              <span className="inline-flex items-center bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded text-[10px] font-medium">
                                🔄 {SCHEDULE_TYPES.find((s) => s.value === rule.schedule_type)?.label}
                                {rule.schedule_time && ` ${rule.schedule_time}`}
                                {rule.schedule_type === "weekly" &&
                                  rule.schedule_day_of_week != null &&
                                  ` ${DAY_NAMES[rule.schedule_day_of_week]}`}
                                {rule.schedule_type === "monthly" &&
                                  rule.schedule_day_of_month != null &&
                                  ` ${rule.schedule_day_of_month}.`}
                              </span>
                            )}
                            {rule.description && <span>— {rule.description}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openTestDialog(rule)}
                          disabled={sendingTestId === rule.id}
                          title="Odeslat testovací notifikaci"
                        >
                          <SendHorizontal className="h-3.5 w-3.5" />
                        </Button>
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

                    {/* Recipient type + Role badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/15 text-primary">
                        {RECIPIENT_TYPE_LABELS[rule.recipient_type] || "Podle role"}
                      </span>
                      {rule.recipient_type !== "self" &&
                        ROLES.map((role) => (
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
                    {/* Sender type badge */}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                      Sender: {SENDER_TYPE_LABELS[rule.sender_type] || "Systém"}
                    </span>

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
                onCancel={() => {
                  setEditingId(null);
                  setEditForm({});
                }}
                saving={upsertMutation.isPending}
                isNew
              />
            </div>
          )}
        </div>
      </CardContent>

      {/* Test notification dialog */}
      <Dialog open={!!testRule} onOpenChange={(open) => { if (!open) { setTestRule(null); setTestRecipientId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Testovací notifikace</DialogTitle>
          </DialogHeader>
          {testRule && (
            <div className="space-y-3">
              {/* Příjemce testu — picker s search */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Příjemce</label>
                <Popover open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={recipientPickerOpen}
                      className="w-full justify-between h-9 font-normal"
                    >
                      {selectedRecipient
                        ? `${selectedRecipient.full_name} (${selectedRecipient.role})`
                        : "Já (admin)"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Hledat uživatele…" />
                      <CommandList>
                        <CommandEmpty>Žádný uživatel nenalezen.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__self__ ja admin"
                            onSelect={() => {
                              setTestRecipientId(null);
                              setRecipientPickerOpen(false);
                            }}
                          >
                            Já (admin)
                          </CommandItem>
                          {activeUsers.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={`${u.full_name} ${u.role}`}
                              onSelect={() => {
                                setTestRecipientId(u.id);
                                setRecipientPickerOpen(false);
                              }}
                            >
                              <span className="flex-1">{u.full_name}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{u.role}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="text-[10px] text-muted-foreground">
                  Push dorazí jen pokud má cílový uživatel registrované zařízení.
                </div>
              </div>

              {/* Variables */}
              {(() => {
                const placeholders = extractPlaceholders(testRule);
                if (placeholders.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Šablona neobsahuje žádné proměnné. Notifikace bude odeslána tak jak je.
                    </p>
                  );
                }
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Vyplňte hodnoty proměnných pro test:</p>
                    {placeholders.map((key) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{`{{${key}}}`}</label>
                        <Input
                          placeholder={key}
                          value={testVars[key] || ""}
                          onChange={(e) => setTestVars((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setTestRule(null); setTestRecipientId(null); }}>
              Zrušit
            </Button>
            <Button size="sm" onClick={sendTestNotification} disabled={sendingTestId === testRule?.id}>
              {sendingTestId === testRule?.id ? "Odesílám…" : "Odeslat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Force-update broadcast dialog */}
      <Dialog open={forceUpdateOpen} onOpenChange={setForceUpdateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Vynutit aktualizaci u všech
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Pošle všem aktivním uživatelům in-app notifikaci a push s tlačítkem
              <strong> Aktualizovat</strong>. Po kliknutí se uživateli smaže PWA cache,
              odregistrují se service workery a aplikace se hard-reloadne. Auth session
              zůstane zachována (Supabase tokeny se neresetují).
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Titulek</label>
              <Input
                value={forceUpdateTitle}
                onChange={(e) => setForceUpdateTitle(e.target.value)}
                placeholder={FORCE_UPDATE_TITLE_DEFAULT}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Zpráva</label>
              <Textarea
                value={forceUpdateBody}
                onChange={(e) => setForceUpdateBody(e.target.value)}
                rows={3}
                placeholder={FORCE_UPDATE_BODY_DEFAULT}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setForceUpdateOpen(false);
                setForceUpdateTitle(FORCE_UPDATE_TITLE_DEFAULT);
                setForceUpdateBody(FORCE_UPDATE_BODY_DEFAULT);
              }}
              disabled={forceUpdateSending}
            >
              Zrušit
            </Button>
            <Button size="sm" onClick={sendForceUpdateBroadcast} disabled={forceUpdateSending}>
              {forceUpdateSending ? "Odesílám…" : "Odeslat všem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variables reference modal */}
      <Dialog open={showVarsModal} onOpenChange={setShowVarsModal}>
        <DialogContent className="max-w-[90vw] w-[900px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileCode className="h-4 w-4" /> Seznam všech proměnných
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Kliknutím na proměnnou ji zkopírujete do schránky. Vkládejte do šablon ve formátu{" "}
              <code className="bg-muted px-1 rounded">{"{{nazev}}"}</code>.
            </p>
          </DialogHeader>
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-0">
            {ALL_TEMPLATE_VARS.map((cat) => (
              <div key={cat.category} className="break-inside-avoid mb-5">
                <div className="text-xs font-bold uppercase tracking-wider text-primary border-b border-primary/20 pb-1 mb-2">
                  {cat.category}
                </div>
                <div className="space-y-0.5">
                  {cat.vars.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      className="flex items-start gap-2 w-full text-left rounded px-1.5 py-1 hover:bg-muted/80 transition-colors group cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(v.name);
                        toast.success(`Zkopírováno: ${v.name}`);
                      }}
                    >
                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px] whitespace-nowrap flex-shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {v.name}
                      </code>
                      <span className="text-[11px] text-muted-foreground leading-tight pt-0.5">{v.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setShowVarsModal(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            onValueChange={(v) => {
              const isScheduled = v === "scheduled";
              setForm({
                ...form,
                trigger_event: v,
                schedule_type: isScheduled ? (form.schedule_type === "event" ? "daily" : form.schedule_type) : "event",
              });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
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

      {/* Schedule settings — shown when trigger is "scheduled" */}
      {form.trigger_event === "scheduled" && (
        <div className="space-y-3 p-3 rounded-md bg-muted/30 border border-border">
          <div className="text-xs font-medium">Plánování opakování</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Frekvence</Label>
              <Select
                value={form.schedule_type || "daily"}
                onValueChange={(v) => setForm({ ...form, schedule_type: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Denně</SelectItem>
                  <SelectItem value="weekly">Týdně</SelectItem>
                  <SelectItem value="monthly">Měsíčně</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Čas odeslání (CET/CEST)</Label>
              <Input
                type="time"
                value={form.schedule_time || "08:00"}
                onChange={(e) => setForm({ ...form, schedule_time: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            {form.schedule_type === "weekly" && (
              <div>
                <Label className="text-xs">Den v týdnu</Label>
                <Select
                  value={String(form.schedule_day_of_week ?? 1)}
                  onValueChange={(v) => setForm({ ...form, schedule_day_of_week: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.schedule_type === "monthly" && (
              <div>
                <Label className="text-xs">Den v měsíci</Label>
                <Select
                  value={String(form.schedule_day_of_month ?? 1)}
                  onValueChange={(v) => setForm({ ...form, schedule_day_of_month: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Dostupné proměnné pro šablonu:{" "}
            {(TEMPLATE_VARS["scheduled"] || []).map((v) => (
              <code key={v} className="bg-muted px-1 rounded mx-0.5">
                {v}
              </code>
            ))}
          </div>
        </div>
      )}

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
          Dostupné proměnné:{" "}
          {vars.map((v) => (
            <code key={v} className="bg-muted px-1 rounded mx-0.5">
              {v}
            </code>
          ))}
        </div>
      )}

      {/* Recipient type */}
      <div>
        <Label className="text-xs mb-1.5 block">Komu odeslat</Label>
        <div className="flex flex-wrap gap-2">
          {RECIPIENT_TYPES.map((rt) => {
            const checked = (form.recipient_type || "by_role") === rt.value;
            return (
              <button
                key={rt.value}
                type="button"
                onClick={() => setForm({ ...form, recipient_type: rt.value })}
                className="text-xs px-3 py-1 rounded-full font-medium border transition-colors"
                style={{
                  background: checked ? "hsl(var(--primary))" : "transparent",
                  color: checked ? "#fff" : "inherit",
                  borderColor: checked ? "hsl(var(--primary))" : "#e1e9eb",
                }}
              >
                {rt.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {RECIPIENT_TYPES.find((rt) => rt.value === (form.recipient_type || "by_role"))?.description}
        </div>
      </div>

      {/* Role checkboxes — only for hierarchy and by_role */}
      {(form.recipient_type || "by_role") !== "self" && (
        <div>
          <Label className="text-xs mb-1.5 block">
            {form.recipient_type === "hierarchy" ? "Které role z nadřízených dostanou notifikaci" : "Příjemci (role)"}
          </Label>
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
      )}

      {/* Sender type */}
      <div>
        <Label className="text-xs mb-1.5 block">Odesílatel (sender)</Label>
        <div className="flex flex-wrap gap-2">
          {SENDER_TYPES.map((st) => {
            const checked = (form.sender_type || "system") === st.value;
            return (
              <button
                key={st.value}
                type="button"
                onClick={() => setForm({ ...form, sender_type: st.value })}
                className="text-xs px-3 py-1 rounded-full font-medium border transition-colors"
                style={{
                  background: checked ? "hsl(var(--primary))" : "transparent",
                  color: checked ? "#fff" : "inherit",
                  borderColor: checked ? "hsl(var(--primary))" : "#e1e9eb",
                }}
              >
                {st.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {SENDER_TYPES.find((st) => st.value === (form.sender_type || "system"))?.description}
        </div>
      </div>

      <div>
        <Label className="text-xs">Přesměrování po kliknutí (volitelné)</Label>
        <div className="flex gap-2 mt-1">
          <Select
            value={
              APP_PAGES.some((p) => p.value === form.redirect_url)
                ? form.redirect_url!
                : form.redirect_url
                  ? "__custom"
                  : "__none"
            }
            onValueChange={(v) => {
              if (v === "__none") setForm({ ...form, redirect_url: null });
              else if (v === "__custom") setForm({ ...form, redirect_url: "/" });
              else setForm({ ...form, redirect_url: v });
            }}
          >
            <SelectTrigger className="h-8 text-sm w-48">
              <SelectValue placeholder="Žádné" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Žádné</SelectItem>
              {APP_PAGES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom">Vlastní URL…</SelectItem>
            </SelectContent>
          </Select>
          {form.redirect_url && !APP_PAGES.some((p) => p.value === form.redirect_url) && (
            <Input
              value={form.redirect_url || ""}
              onChange={(e) => setForm({ ...form, redirect_url: e.target.value })}
              placeholder="/cesta"
              className="h-8 text-sm flex-1"
            />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Kam bude uživatel přesměrován po kliknutí na notifikaci.
        </p>
      </div>

      {/* Delivery toggles */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.send_push ?? true} onCheckedChange={(v) => setForm({ ...form, send_push: v })} />
          Push notifikace
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.send_in_app ?? true} onCheckedChange={(v) => setForm({ ...form, send_in_app: v })} />
          In-app notifikace
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={saving || !form.name || !form.trigger_event}>
          <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Ukládám..." : "Uložit"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Zrušit
        </Button>
      </div>
    </div>
  );
}

// ─── Meeting Defaults Tab ─────────────────────────────────────────────────────

interface MeetingDefaults {
  FSA: number;
  POH: number;
  POR: number;
  SER: number;
}

function MeetingDefaultsTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["app_config", "meeting_defaults"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("value").eq("key", "meeting_defaults").single();
      return (data?.value as unknown as MeetingDefaults) ?? null;
    },
  });

  const [form, setForm] = useState<MeetingDefaults>({ FSA: 60, POH: 15, POR: 30, SER: 60 });

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const mutation = useMutation({
    mutationFn: async (value: MeetingDefaults) => {
      const { error } = await supabase
        .from("app_config")
        .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
        .eq("key", "meeting_defaults");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", "meeting_defaults"] });
      toast.success("Defaultní trvání schůzek uloženo");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  const MEETING_LABELS: Record<string, string> = {
    FSA: "Analýza (FSA)",
    POH: "Pohovor (POH)",
    POR: "Poradenství (POR)",
    SER: "Servis (SER)",
  };

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Defaultní trvání schůzek</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["FSA", "POH", "POR", "SER"] as const).map((key) => (
          <div key={key} className="flex items-center gap-4">
            <Label className="w-40">{MEETING_LABELS[key]}</Label>
            <Input
              type="number"
              min={5}
              max={480}
              className="w-24"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
            />
            <span className="text-sm text-muted-foreground">minut</span>
          </div>
        ))}
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Uložit
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── PDF Export Tab ───────────────────────────────────────────────────────────

interface PdfExportConfig {
  company_name: string;
  orientation: "landscape" | "portrait";
  head_color: [number, number, number];
  show_planned: boolean;
  show_completed: boolean;
  show_newly_booked: boolean;
}

function PdfExportTab() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["app_config", "pdf_export"],
    queryFn: async () => {
      const { data } = await supabase.from("app_config").select("value").eq("key", "pdf_export").single();
      return (data?.value as unknown as PdfExportConfig) ?? null;
    },
  });

  const [form, setForm] = useState<PdfExportConfig>({
    company_name: "LEGATUS",
    orientation: "landscape",
    head_color: [0, 85, 95],
    show_planned: true,
    show_completed: true,
    show_newly_booked: true,
  });

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const mutation = useMutation({
    mutationFn: async (value: PdfExportConfig) => {
      const { error } = await supabase
        .from("app_config")
        .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
        .eq("key", "pdf_export");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", "pdf_export"] });
      toast.success("Nastavení PDF exportu uloženo");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  const headColorHex = `#${form.head_color.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  return (
    <Card className="max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nastavení PDF exportu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>Název firmy v hlavičce</Label>
          <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
        </div>

        <div>
          <Label>Orientace stránky</Label>
          <Select
            value={form.orientation}
            onValueChange={(v: "landscape" | "portrait") => setForm((f) => ({ ...f, orientation: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Na šířku</SelectItem>
              <SelectItem value="portrait">Na výšku</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Barva hlavičky tabulek</Label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="color"
              value={headColorHex}
              onChange={(e) => {
                const hex = e.target.value;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                setForm((f) => ({ ...f, head_color: [r, g, b] }));
              }}
              className="w-10 h-10 rounded border border-border cursor-pointer"
            />
            <span className="text-sm text-muted-foreground font-mono">{headColorHex}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Zobrazované sekce</Label>
          <div className="flex items-center gap-3">
            <Switch checked={form.show_planned} onCheckedChange={(v) => setForm((f) => ({ ...f, show_planned: v }))} />
            <span className="text-sm">Naplánované</span>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.show_completed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, show_completed: v }))}
            />
            <span className="text-sm">Proběhlé</span>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.show_newly_booked}
              onCheckedChange={(v) => setForm((f) => ({ ...f, show_newly_booked: v }))}
            />
            <span className="text-sm">Nově domluvené</span>
          </div>
        </div>

        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Uložit
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Notification Log Tab ─────────────────────────────────────────────────────

interface NotifLog {
  id: string;
  sender_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  sender?: { full_name: string } | null;
  recipient?: { full_name: string } | null;
}

function NotificationLogTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin_notification_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, sender_id, recipient_id, type, title, body, read, created_at, sender:profiles!notifications_sender_id_fkey(full_name), recipient:profiles!notifications_recipient_id_fkey(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as NotifLog[];
    },
  });

  const types = useMemo(() => {
    const set = new Set(logs.map((l) => l.type));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const senderName = (l.sender as any)?.full_name || "";
        const recipientName = (l.recipient as any)?.full_name || "";
        return (
          l.title.toLowerCase().includes(s) ||
          (l.body || "").toLowerCase().includes(s) ||
          senderName.toLowerCase().includes(s) ||
          recipientName.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [logs, search, typeFilter]);

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Historie odeslaných notifikací
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hledat v notifikacích…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechny typy</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Žádné notifikace</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Datum</th>
                  <th className="text-left p-3 font-medium">Typ</th>
                  <th className="text-left p-3 font-medium">Příjemce</th>
                  <th className="text-left p-3 font-medium">Odesílatel</th>
                  <th className="text-left p-3 font-medium">Titulek</th>
                  <th className="text-left p-3 font-medium">Přečteno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((n) => (
                  <tr key={n.id} className="hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(n.created_at), "d.M.yyyy HH:mm")}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/15 text-primary">
                        {n.type}
                      </span>
                    </td>
                    <td className="p-3 text-xs">{(n.recipient as any)?.full_name || "–"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{(n.sender as any)?.full_name || "–"}</td>
                    <td className="p-3 text-xs max-w-[300px] truncate" title={n.body || ""}>
                      {n.title}
                    </td>
                    <td className="p-3 text-center">
                      {n.read ? (
                        <span className="text-xs text-green-600">✓</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Zobrazeno posledních {filtered.length} z {logs.length} notifikací
        </p>
      </CardContent>
    </Card>
  );
}
