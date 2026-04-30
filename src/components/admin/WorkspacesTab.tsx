import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Users, Mail, AlertCircle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { WorkspaceDetailModal } from "@/components/admin/WorkspaceDetailModal";

interface OrgUnit {
  id: string;
  name: string;
  owner_id: string | null;
  parent_unit_id: string | null;
  is_active: boolean;
  created_at: string;
  owner?: { full_name: string; role: string } | null;
  member_count?: number;
  has_custom_rules?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

const AVATAR_PALETTE = [
  "#00abbd",
  "#fc7c71",
  "#7c5cff",
  "#f5a524",
  "#22c55e",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
];

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ElementType }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-heading font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

export function WorkspacesTab() {
  const [showInvitesAnchor, setShowInvitesAnchor] = useState(false);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["org_units"],
    queryFn: async (): Promise<OrgUnit[]> => {
      const { data, error } = await supabase
        .from("org_units")
        .select(`
          id, name, owner_id, parent_unit_id, is_active, created_at,
          owner:profiles!org_units_owner_id_fkey(full_name, role)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (data ?? []).map(async (ws: any) => {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("org_unit_id", ws.id)
            .eq("is_active", true);

          const { data: customRules } = await supabase
            .from("promotion_rules")
            .select("id")
            .eq("org_unit_id", ws.id)
            .limit(1);

          return {
            ...ws,
            member_count: count ?? 0,
            has_custom_rules: (customRules?.length ?? 0) > 0,
          } as OrgUnit;
        })
      );

      return enriched;
    },
  });

  const { data: pendingInvites } = useQuery({
    queryKey: ["invites", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, full_name, expires_at, org_unit_id, created_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const list = workspaces ?? [];
    return {
      total: list.length,
      active: list.filter((w) => w.is_active).length,
      members: list.reduce((sum, w) => sum + (w.member_count ?? 0), 0),
      invites: pendingInvites?.length ?? 0,
    };
  }, [workspaces, pendingInvites]);

  const handleCreate = () => {
    toast.info("Vytváření workspace bude doplněno v další iteraci");
  };

  const handleDetail = (ws: OrgUnit) => {
    toast.info(`Detail workspace „${ws.name}" bude doplněn`);
  };

  const handleEnter = (ws: OrgUnit) => {
    try {
      localStorage.setItem("legatus_active_workspace", ws.id);
    } catch {}
    toast.success(`Přepnuto na workspace „${ws.name}"`);
    window.location.href = "/dashboard";
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Workspace celkem" value={stats.total} icon={Building2} />
        <StatCard label="Aktivní" value={stats.active} icon={Building2} />
        <StatCard label="Celkem členů" value={stats.members} icon={Users} />
        <StatCard label="Aktivní pozvánky" value={stats.invites} icon={Mail} />
      </div>

      {/* Pending invites banner */}
      {(pendingInvites?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              {pendingInvites!.length} čekající {pendingInvites!.length === 1 ? "pozvánka" : pendingInvites!.length < 5 ? "pozvánky" : "pozvánek"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowInvitesAnchor(true);
              document.getElementById("workspace-invites-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Zobrazit pozvánky
          </Button>
        </div>
      )}

      {/* Header + create */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold text-foreground">Workspaces</h2>
        <Button onClick={handleCreate} className="bg-[#fc7c71] hover:bg-[#fc7c71]/90 text-white">
          <Plus className="h-4 w-4 mr-1.5" />
          Nový workspace
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Načítání…</div>
      ) : (workspaces?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Zatím nejsou vytvořeny žádné workspace.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workspaces!.map((ws, idx) => {
            const initial = ws.name?.charAt(0).toUpperCase() ?? "?";
            const color = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
            return (
              <Card key={ws.id} className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-heading font-bold text-lg shrink-0"
                    style={{ background: color }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-foreground truncate">{ws.name}</h3>
                      <Badge
                        variant="outline"
                        className={
                          ws.is_active
                            ? "border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10"
                            : "border-muted text-muted-foreground"
                        }
                      >
                        {ws.is_active ? "aktivní" : "neaktivní"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {ws.owner ? (
                        <>
                          {ws.owner.full_name}
                          <span className="mx-1.5">·</span>
                          <span>{ROLE_LABELS[ws.owner.role] ?? ws.owner.role}</span>
                        </>
                      ) : (
                        "Bez vlastníka"
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <div className="text-base font-heading font-bold text-foreground">{ws.member_count ?? 0}</div>
                    <div className="text-[11px] text-muted-foreground">členů</div>
                  </div>
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <div className="text-base font-heading font-bold text-foreground">–</div>
                    <div className="text-[11px] text-muted-foreground">garantů</div>
                  </div>
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <div className="text-base font-heading font-bold text-foreground">
                      {ws.has_custom_rules ? "vlastní" : "globální"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">pravidla</div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Vytvořeno {format(new Date(ws.created_at), "d. M. yyyy", { locale: cs })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDetail(ws)}>
                    Detail
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-[#00abbd] hover:bg-[#00abbd]/90 text-white"
                    onClick={() => handleEnter(ws)}
                  >
                    Vstoupit
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Invites section anchor (placeholder for future detail listing) */}
      <div id="workspace-invites-section" />
      {showInvitesAnchor && (pendingInvites?.length ?? 0) > 0 && (
        <Card className="p-4">
          <h3 className="font-heading font-semibold text-foreground mb-3">Čekající pozvánky</h3>
          <div className="space-y-2">
            {pendingInvites!.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium text-foreground">{inv.full_name ?? inv.email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{inv.email}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  vyprší {format(new Date(inv.expires_at), "d. M. yyyy", { locale: cs })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
