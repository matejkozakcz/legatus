import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Users,
  Bell,
  Coins,
  CalendarDays,
  TrendingUp,
  Wifi,
  RefreshCw,
  Search,
  ArrowUpRight,
  History,
  Zap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BellOff,
  HelpCircle,
} from "lucide-react";
import { format, formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { cs } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { UserDetailModal } from "./UserDetailModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtRel = (d: string | Date) =>
  formatDistanceToNow(new Date(d), { addSuffix: true, locale: cs });

const fmtAbs = (d: string | Date) =>
  format(new Date(d), "d. M. yyyy HH:mm:ss", { locale: cs });

interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

/** Summarize push-error array into short human text (e.g. "VAPID key invalid (2)") */
function summarizeErrors(errors: any): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const e of errors) {
    let label = "Neznámá chyba";
    const msg: string = (e?.message || e?.body || "").toString();
    const status: number | undefined = e?.status;
    if (/VAPID/i.test(msg)) label = "Neplatný VAPID klíč";
    else if (status === 410 || status === 404) label = "Odběr exspirován";
    else if (status === 401 || status === 403) label = "Neautorizováno";
    else if (status === 413) label = "Payload příliš velký";
    else if (status === 429) label = "Rate limit";
    else if (status && status >= 500) label = `Server push (${status})`;
    else if (status) label = `HTTP ${status}`;
    else if (msg) label = msg.slice(0, 60);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([l, c]) => (c > 1 ? `${l} (${c}×)` : l))
    .join(", ");
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function ActivityDashboardTab() {
  const queryClient = useQueryClient();

  // Stable list of admin query-key prefixes used in this tab.
  // Background-invalidating these keeps existing data on screen while
  // refetching, so the UI updates without a full-page flicker.
  const ADMIN_KEYS = [
    "admin_activity_summary",
    "admin_activity_chart_users",
    "admin_activity_chart_events",
    "admin_role_distribution",
    "admin_unified_users",
    "admin_event_feed",
    "admin_notif_runs",
    "admin_recent_errors",
  ] as const;

  const refresh = () => {
    ADMIN_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  // Realtime: invalidate only when profiles or client_meetings actually change.
  // Debounced to avoid burst-refreshes during bulk writes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        timer = null;
      }, 1500);
    };

    const channel = supabase
      .channel("admin-activity-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_meetings" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold text-foreground">
            Dashboard aktivity
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Obnovit
        </Button>
      </div>

      <SummaryCards />

      <div className="grid gap-4 lg:grid-cols-2">
        <OnlineUsersCard />
        <ActiveUsersChart />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyActivityChart />
        <RoleDistributionCard />
      </div>

      <UnifiedUsersTable />

      <RecentEventsFeed />

      <NotificationRunsCard />

      <ErrorLogsCard />
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_activity_summary"],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const last7 = subDays(new Date(), 7).toISOString();
      const last30 = subDays(new Date(), 30).toISOString();

      const [
        { count: totalUsers },
        { count: activeUsers },
        { count: meetingsToday },
        { count: meetings7d },
        { count: notifs24h },
        { count: pushSubs },
        { count: pendingPromos },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase
          .from("client_meetings")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today),
        supabase
          .from("client_meetings")
          .select("id", { count: "exact", head: true })
          .gte("created_at", last7),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .gte("created_at", subDays(new Date(), 1).toISOString()),
        supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
        supabase
          .from("promotion_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

      // Distinct active users last 7 days (had meetings or activity)
      const { data: activeUserRows } = await supabase
        .from("client_meetings")
        .select("user_id")
        .gte("created_at", last7);
      const distinct7d = new Set((activeUserRows || []).map((r: any) => r.user_id)).size;

      return {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        meetingsToday: meetingsToday || 0,
        meetings7d: meetings7d || 0,
        notifs24h: notifs24h || 0,
        pushSubs: pushSubs || 0,
        pendingPromos: pendingPromos || 0,
        distinct7d,
      };
    },
  });

  const cards = [
    { label: "Aktivních uživatelů", value: data?.activeUsers, total: data?.totalUsers, icon: Users },
    { label: "Aktivní (7 dní)", value: data?.distinct7d, icon: TrendingUp },
    { label: "Schůzky dnes", value: data?.meetingsToday, icon: CalendarDays },
    { label: "Schůzky (7 dní)", value: data?.meetings7d, icon: CalendarDays },
    { label: "Notifikace (24h)", value: data?.notifs24h, icon: Bell },
    { label: "Push odběrů", value: data?.pushSubs, icon: Zap },
    { label: "Čekající povýšení", value: data?.pendingPromos, icon: ArrowUpRight },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-body uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="mt-1 text-2xl font-heading font-bold text-foreground">
                  {isLoading ? "…" : c.value ?? 0}
                  {c.total != null && (
                    <span className="text-sm font-medium text-muted-foreground ml-1">
                      / {c.total}
                    </span>
                  )}
                </p>
              </div>
              <c.icon className="h-4 w-4 text-primary opacity-70" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Online Users (Realtime presence) ─────────────────────────────────────────

import { useOnlineUsers } from "@/hooks/usePresenceTracker";

function OnlineUsersCard() {
  const online = useOnlineUsers();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Aktuálně online ({online.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {online.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            <Wifi className="h-4 w-4 inline mr-1 opacity-50" />
            Zatím nikdo online (data se objeví, jakmile někdo načte aplikaci)
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-auto">
            {online.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 transition"
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt={u.full_name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                    {u.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {u.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ROLE_LABELS[u.role] || u.role} · {u.page}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {fmtRel(u.online_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Users Chart (last 14 days) ────────────────────────────────────────

function ActiveUsersChart({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_activity_chart_users"],
    queryFn: async () => {
      const since = subDays(new Date(), 14).toISOString();
      const { data: meetings } = await supabase
        .from("client_meetings")
        .select("user_id, created_at")
        .gte("created_at", since);

      const byDay = new Map<string, Set<string>>();
      for (let i = 13; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        byDay.set(d, new Set());
      }
      (meetings || []).forEach((m: any) => {
        const d = format(new Date(m.created_at), "yyyy-MM-dd");
        if (byDay.has(d)) byDay.get(d)!.add(m.user_id);
      });
      return Array.from(byDay.entries()).map(([date, users]) => ({
        date: format(new Date(date), "d.M."),
        active: users.size,
      }));
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aktivní uživatelé (14 dní)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Načítání…</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip />
              <Line
                type="monotone"
                dataKey="active"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Aktivní"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Daily Activity Chart (events per day) ────────────────────────────────────

function DailyActivityChart({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_activity_chart_events"],
    queryFn: async () => {
      const since = subDays(new Date(), 14).toISOString();
      const [{ data: meetings }, { data: notifs }] = await Promise.all([
        supabase.from("client_meetings").select("created_at").gte("created_at", since),
        supabase.from("notifications").select("created_at").gte("created_at", since),
      ]);

      const map = new Map<string, { date: string; meetings: number; notifications: number }>();
      for (let i = 13; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        map.set(d, { date: format(new Date(d), "d.M."), meetings: 0, notifications: 0 });
      }
      (meetings || []).forEach((m: any) => {
        const d = format(new Date(m.created_at), "yyyy-MM-dd");
        if (map.has(d)) map.get(d)!.meetings++;
      });
      (notifs || []).forEach((n: any) => {
        const d = format(new Date(n.created_at), "yyyy-MM-dd");
        if (map.has(d)) map.get(d)!.notifications++;
      });
      return Array.from(map.values());
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Schůzky & notifikace (14 dní)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Načítání…</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="meetings" fill="hsl(var(--primary))" name="Schůzky" />
              <Bar dataKey="notifications" fill="#00abbd" name="Notifikace" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Role Distribution ───────────────────────────────────────────────────────

function RoleDistributionCard({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_role_distribution"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("is_active", true);
      const counts = new Map<string, number>();
      (data || []).forEach((p: any) => {
        counts.set(p.role, (counts.get(p.role) || 0) + 1);
      });
      return ["vedouci", "budouci_vedouci", "garant", "ziskatel"].map((r) => ({
        role: ROLE_LABELS[r] || r,
        count: counts.get(r) || 0,
      }));
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Distribuce rolí</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Načítání…</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis dataKey="role" type="category" tick={{ fontSize: 11 }} width={110} />
              <ReTooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" name="Počet" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Unified Users Table (slučuje Stav + Top users + Správa) ────────────────

function UnifiedUsersTable({}) {
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_unified_users"],
    queryFn: async () => {
      const since30 = subDays(new Date(), 30).toISOString();
      const [{ data: profiles }, { data: cfg }, { data: meetings }, { data: leaders }, { data: garants }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, full_name, role, avatar_url, last_seen_at, last_known_version, is_active, vedouci_id, garant_id, created_at",
            ),
          supabase.from("app_config").select("value").eq("key", "app_version").maybeSingle(),
          supabase
            .from("client_meetings")
            .select("user_id, podepsane_bj, cancelled, created_at")
            .gte("created_at", since30),
          supabase.from("profiles").select("id, full_name").in("role", ["vedouci", "budouci_vedouci"]),
          supabase.from("profiles").select("id, full_name"),
        ]);

      const currentVersion = (cfg?.value ?? "").toString().replace(/^"|"$/g, "");
      const leaderMap = new Map<string, string>();
      (leaders || []).forEach((l: any) => leaderMap.set(l.id, l.full_name));
      const profMap = new Map<string, string>();
      (garants || []).forEach((p: any) => profMap.set(p.id, p.full_name));

      const stats = new Map<string, { meetings: number; bj: number }>();
      (meetings || []).forEach((m: any) => {
        if (m.cancelled) return;
        const cur = stats.get(m.user_id) || { meetings: 0, bj: 0 };
        cur.meetings++;
        cur.bj += Number(m.podepsane_bj || 0);
        stats.set(m.user_id, cur);
      });

      const rows = (profiles || []).map((p: any) => ({
        ...p,
        vedouci_name: p.vedouci_id ? leaderMap.get(p.vedouci_id) || profMap.get(p.vedouci_id) || "—" : null,
        garant_name: p.garant_id ? profMap.get(p.garant_id) || "—" : null,
        meetings_30d: stats.get(p.id)?.meetings || 0,
        bj_30d: stats.get(p.id)?.bj || 0,
      }));

      // default sort: by created_at desc
      rows.sort((a: any, b: any) => +new Date(b.created_at || 0) - +new Date(a.created_at || 0));

      return { rows, currentVersion };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.rows.filter((r: any) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (q && !r.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, roleFilter]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Uživatelé ({filtered.length})
            {data?.currentVersion && (
              <span className="ml-2 text-[10px] font-mono font-normal text-muted-foreground">
                aktuální verze: {data.currentVersion}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Hledat uživatele…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Všechny role</option>
              <option value="vedouci">Vedoucí</option>
              <option value="budouci_vedouci">Budoucí vedoucí</option>
              <option value="garant">Garant</option>
              <option value="ziskatel">Získatel</option>
              <option value="novacek">Nováček</option>
            </select>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4">Načítání…</p>
          ) : (
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uživatel</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Vedoucí / Garant</TableHead>
                    <TableHead>Naposledy</TableHead>
                    <TableHead className="text-center">Verze</TableHead>
                    <TableHead className="text-right">Schůzek 30d</TableHead>
                    <TableHead className="text-right">BJ 30d</TableHead>
                    <TableHead>Vytvořen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const isCurrent =
                      !!r.last_known_version &&
                      !!data?.currentVersion &&
                      r.last_known_version === data.currentVersion;
                    const neverSeen = !r.last_seen_at;
                    const staleSeen =
                      !!r.last_seen_at && Date.now() - +new Date(r.last_seen_at) > 7 * 24 * 3600 * 1000;
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => setSelectedUserId(r.id)}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                                {r.full_name
                                  .split(" ")
                                  .map((n: string) => n[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                            )}
                            <span className={r.is_active ? "" : "text-muted-foreground line-through"}>
                              {r.full_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ROLE_LABELS[r.role] || r.role}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.vedouci_name && <div>V: {r.vedouci_name}</div>}
                          {r.garant_name && <div>G: {r.garant_name}</div>}
                          {!r.vedouci_name && !r.garant_name && "—"}
                        </TableCell>
                        <TableCell
                          className={`text-xs ${neverSeen ? "text-muted-foreground italic" : staleSeen ? "text-amber-600 dark:text-amber-400" : ""}`}
                          title={r.last_seen_at ? fmtAbs(r.last_seen_at) : "Ještě se nikdy nepřihlásil"}
                        >
                          {neverSeen ? "Nikdy" : fmtRel(r.last_seen_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          {!r.last_known_version ? (
                            <HelpCircle className="h-4 w-4 text-muted-foreground inline" aria-label="Neznámá" />
                          ) : isCurrent ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" aria-label="Aktuální" />
                          ) : (
                            <XCircle className="h-4 w-4 text-amber-600 inline" aria-label="Zastaralá" />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{r.meetings_30d}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{r.bj_30d}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.created_at ? format(new Date(r.created_at), "d. M. yyyy", { locale: cs }) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                        Žádní uživatelé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDetailModal
        userId={selectedUserId}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        currentVersion={data?.currentVersion}
      />
    </>
  );
}


// ─── Recent Events Feed ──────────────────────────────────────────────────────

interface DeliveryInfo {
  status: "delivered" | "partial" | "failed" | "no_subs" | "no_log" | "fatal";
  sent: number;
  failed: number;
  subs: number;
  expired: number;
  errorSummary?: string;
  hasActiveSub: boolean;
}

interface FeedEvent {
  ts: string;
  type: "meeting" | "notification" | "promotion" | "bj_audit" | "promo_request";
  title: string;
  detail: string;
  userName?: string;
  icon: typeof Activity;
  delivery?: DeliveryInfo;
}

function RecentEventsFeed({}) {
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin_event_feed"],
    queryFn: async (): Promise<FeedEvent[]> => {
      const [
        { data: meetings },
        { data: notifs },
        { data: promos },
        { data: audits },
        { data: profiles },
        { data: deliveryLogs },
        { data: pushSubs },
      ] = await Promise.all([
        supabase
          .from("client_meetings")
          .select("id, user_id, meeting_type, case_name, created_at, podepsane_bj, cancelled")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("notifications")
          .select("id, recipient_id, sender_id, title, body, trigger_event, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("promotion_history")
          .select("id, user_id, event, requested_role, created_at, note")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("bj_audit_log")
          .select("id, user_id, action, old_bj, new_bj, change_reason, changed_by, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("profiles").select("id, full_name, role, avatar_url"),
        supabase
          .from("push_delivery_log")
          .select("notification_id, recipient_id, sent, failed, expired_removed, subscription_count, errors, general_error, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("push_subscriptions").select("user_id"),
      ]);

      const profMap = new Map<string, Profile>();
      (profiles || []).forEach((p: any) => profMap.set(p.id, p));
      const name = (id?: string | null) =>
        (id && profMap.get(id)?.full_name) || "—";

      // Map: notification_id -> latest delivery log
      const deliveryMap = new Map<string, any>();
      (deliveryLogs || []).forEach((d: any) => {
        if (d.notification_id && !deliveryMap.has(d.notification_id)) {
          deliveryMap.set(d.notification_id, d);
        }
      });

      // Set of users with at least one active push subscription
      const usersWithSubs = new Set<string>();
      (pushSubs || []).forEach((s: any) => usersWithSubs.add(s.user_id));

      const events: FeedEvent[] = [];

      (meetings || []).forEach((m: any) => {
        events.push({
          ts: m.created_at,
          type: "meeting",
          title: `${m.cancelled ? "Zrušená " : ""}schůzka ${m.meeting_type}`,
          detail: `${name(m.user_id)} · ${m.case_name || "bez názvu"} · ${m.podepsane_bj || 0} BJ`,
          userName: name(m.user_id),
          icon: CalendarDays,
        });
      });

      (notifs || []).forEach((n: any) => {
        const log = deliveryMap.get(n.id);
        const hasActiveSub = usersWithSubs.has(n.recipient_id);
        let delivery: DeliveryInfo;
        if (!log) {
          // No log row — either too old (before logging was enabled) or push trigger never fired
          delivery = {
            status: hasActiveSub ? "no_log" : "no_subs",
            sent: 0,
            failed: 0,
            subs: 0,
            expired: 0,
            hasActiveSub,
          };
        } else if (log.general_error) {
          delivery = {
            status: "fatal",
            sent: 0,
            failed: 0,
            subs: log.subscription_count || 0,
            expired: log.expired_removed || 0,
            errorSummary: log.general_error,
            hasActiveSub,
          };
        } else if (log.subscription_count === 0) {
          delivery = {
            status: "no_subs",
            sent: 0,
            failed: 0,
            subs: 0,
            expired: 0,
            hasActiveSub,
          };
        } else if (log.failed === 0 && log.sent > 0) {
          delivery = {
            status: "delivered",
            sent: log.sent,
            failed: 0,
            subs: log.subscription_count,
            expired: log.expired_removed || 0,
            hasActiveSub,
          };
        } else if (log.sent > 0) {
          delivery = {
            status: "partial",
            sent: log.sent,
            failed: log.failed,
            subs: log.subscription_count,
            expired: log.expired_removed || 0,
            errorSummary: summarizeErrors(log.errors),
            hasActiveSub,
          };
        } else {
          delivery = {
            status: "failed",
            sent: 0,
            failed: log.failed || 0,
            subs: log.subscription_count || 0,
            expired: log.expired_removed || 0,
            errorSummary: summarizeErrors(log.errors),
            hasActiveSub,
          };
        }

        events.push({
          ts: n.created_at,
          type: "notification",
          title: `Notifikace: ${n.title}`,
          detail: `${name(n.sender_id) !== "—" ? `od ${name(n.sender_id)} → ` : ""}${name(n.recipient_id)} · ${n.trigger_event}`,
          userName: name(n.recipient_id),
          icon: Bell,
          delivery,
        });
      });

      (promos || []).forEach((p: any) => {
        events.push({
          ts: p.created_at,
          type: "promotion",
          title: `Povýšení: ${p.event}`,
          detail: `${name(p.user_id)} → ${ROLE_LABELS[p.requested_role] || p.requested_role}${p.note ? ` · ${p.note}` : ""}`,
          userName: name(p.user_id),
          icon: ArrowUpRight,
        });
      });

      (audits || []).forEach((a: any) => {
        events.push({
          ts: a.created_at,
          type: "bj_audit",
          title: `BJ úprava: ${a.action}`,
          detail: `${name(a.user_id)}: ${a.old_bj ?? "—"} → ${a.new_bj ?? "—"} · ${a.change_reason || ""}`,
          userName: name(a.user_id),
          icon: Coins,
        });
      });

      return events.sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 100);
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        (e.userName && e.userName.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Nedávné události ({filtered.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrovat události…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Načítání…</p>
        ) : (
          <div className="space-y-1 max-h-[500px] overflow-auto">
            {filtered.map((e, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 transition border-l-2 border-transparent hover:border-primary"
              >
                <e.icon className="h-3.5 w-3.5 text-primary mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.detail}</p>
                  {e.delivery && <DeliveryBadge d={e.delivery} />}
                </div>
                <span
                  className="text-[10px] text-muted-foreground whitespace-nowrap"
                  title={fmtAbs(e.ts)}
                >
                  {fmtRel(e.ts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Delivery Badge ──────────────────────────────────────────────────────────

function DeliveryBadge({ d }: { d: DeliveryInfo }) {
  const config: Record<
    DeliveryInfo["status"],
    { icon: typeof CheckCircle2; color: string; bg: string; label: string }
  > = {
    delivered: {
      icon: CheckCircle2,
      color: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      label: `Doručeno (${d.sent}/${d.subs})`,
    },
    partial: {
      icon: AlertCircle,
      color: "text-amber-700 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-900/30",
      label: `Částečně (${d.sent}/${d.subs}) · ${d.failed} chyb`,
    },
    failed: {
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      label: `Selhalo (${d.failed}/${d.subs})`,
    },
    fatal: {
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      label: "Push služba selhala",
    },
    no_subs: {
      icon: BellOff,
      color: "text-muted-foreground",
      bg: "bg-muted",
      label: d.hasActiveSub ? "Žádný odběr v době odeslání" : "Push notifikace nepovoleny",
    },
    no_log: {
      icon: HelpCircle,
      color: "text-muted-foreground",
      bg: "bg-muted",
      label: "Bez záznamu doručení",
    },
  };

  const c = config[d.status];
  const Icon = c.icon;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.color}`}
        title={d.errorSummary}
      >
        <Icon className="h-3 w-3" />
        {c.label}
      </span>
      {d.expired > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          {d.expired} odběr(y) odebrány
        </span>
      )}
      {!d.hasActiveSub && d.status !== "no_subs" && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
          title="Příjemce momentálně nemá registrované žádné push odběry"
        >
          <BellOff className="h-3 w-3" /> Aktuálně bez push
        </span>
      )}
      {d.errorSummary && (d.status === "failed" || d.status === "partial" || d.status === "fatal") && (
        <span className="text-[10px] text-destructive font-mono truncate max-w-full">
          {d.errorSummary}
        </span>
      )}
    </div>
  );
}

// ─── Notification Run Log ────────────────────────────────────────────────────

function NotificationRunsCard({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_notif_runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_run_log")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Poslední běhy notifikací
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Načítání…</p>
        ) : (data?.length || 0) === 0 ? (
          <p className="text-muted-foreground text-sm py-4">Zatím žádné běhy.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kdy</TableHead>
                <TableHead>Pravidlo</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Odeslano</TableHead>
                <TableHead className="text-right">Trvání</TableHead>
                <TableHead>Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap" title={fmtAbs(r.run_at)}>
                    {fmtRel(r.run_at)}
                  </TableCell>
                  <TableCell className="text-xs">{r.rule_name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.trigger_event || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.inserted_count}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                  </TableCell>
                  <TableCell>
                    {r.error_message ? (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Chyba
                      </span>
                    ) : r.matched ? (
                      <span className="text-xs text-emerald-600">OK</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Žádná shoda</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent Errors (DB + Edge logs) ──────────────────────────────────────────

function ErrorLogsCard({}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_recent_errors"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_run_log")
        .select("id, run_at, rule_name, error_message")
        .not("error_message", "is", null)
        .order("run_at", { ascending: false })
        .limit(15);
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-destructive" />
          Nedávné chyby
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Načítání…</p>
        ) : (data?.length || 0) === 0 ? (
          <p className="text-emerald-600 text-sm py-2 flex items-center gap-2">
            ✓ Žádné nedávné chyby v notifikacích
          </p>
        ) : (
          <div className="space-y-2">
            {data!.map((r: any) => (
              <div key={r.id} className="border-l-2 border-destructive pl-3 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {r.rule_name || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtRel(r.run_at)}
                  </span>
                </div>
                <p className="text-xs text-destructive font-mono mt-0.5 break-all">
                  {r.error_message}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
