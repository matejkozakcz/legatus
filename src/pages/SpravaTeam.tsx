import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ChevronDown, ChevronRight, TrendingUp, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { OrgChart } from "@/components/OrgChart";
import { CreateNotificationDialog } from "@/components/CreateNotificationDialog";
import { AddMemberDialog } from "@/components/AddMemberDialog";
import { EditMemberDialog } from "@/components/EditMemberDialog";
import { Button } from "@/components/ui/button";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
  osobni_id?: string | null;
}

interface PromotionRequest {
  id: string;
  user_id: string;
  requested_role: string;
  status: string;
  cumulative_bj: number | null;
  direct_ziskatels: number | null;
  total_ziskatels?: number;
  member?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

const roleBadge: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  budouci_vedouci: { label: "Budoucí vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

function MemberCard({
  member,
  onClick,
  onNotify,
  depth = 0,
}: {
  member: Profile;
  onClick: () => void;
  onNotify: () => void;
  depth?: number;
}) {
  const badge = roleBadge[member.role] || roleBadge.novacek;
  const initials = member.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="legatus-card legatus-card-sm flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{ marginLeft: depth * 24 }}
      onClick={onClick}
    >
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-border flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-heading font-semibold">{initials}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-body font-medium text-foreground">{member.full_name}</p>
          <span className={badge.className}>{badge.label}</span>
        </div>
        {member.created_at && (
          <p className="text-xs text-muted-foreground font-body mt-0.5">
            Přidán: {format(new Date(member.created_at), "d. M. yyyy", { locale: cs })}
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onNotify(); }}
          className="btn btn-ghost btn-sm"
          title="Odeslat upozornění"
        >
          <Bell className="h-4 w-4" />
        </button>
        <Link
          to={`/tym/${member.id}/aktivity`}
          onClick={(e) => e.stopPropagation()}
          className="btn btn-ghost btn-sm"
        >
          Aktivity
        </Link>
      </div>
    </div>
  );
}

function HierarchyGroup({
  parent,
  children,
  childrenMap,
  onEdit,
  onNotify,
  depth,
}: {
  parent: Profile;
  children: Profile[];
  childrenMap: Map<string, Profile[]>;
  onEdit: (m: Profile) => void;
  onNotify: (m: Profile) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(depth >= 2);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div className="flex items-center gap-1">
        {hasChildren && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
        {!hasChildren && <div style={{ width: 28 }} />}
        <div className="flex-1">
          <MemberCard
            member={parent}
            onClick={() => onEdit(parent)}
            onNotify={() => onNotify(parent)}
            depth={0}
          />
        </div>
      </div>
      {hasChildren && !collapsed && (
        <div className="ml-6 mt-1 space-y-1 border-l-2 border-border pl-2">
          {children.map((child) => {
            const grandchildren = childrenMap.get(child.id) || [];
            return (
              <HierarchyGroup
                key={child.id}
                parent={child}
                children={grandchildren}
                childrenMap={childrenMap}
                onEdit={onEdit}
                onNotify={onNotify}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const SpravaTeam = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"seznam" | "orgchart">("seznam");
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Profile | null>(null);
  const [notifyMember, setNotifyMember] = useState<Profile | null>(null);

  // --- Promotion requests ---
  const { data: pendingRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["promotion_requests", profile?.id],
    queryFn: async () => {
      if (!profile?.id || profile.role !== "vedouci") return [];
      const { data, error } = await supabase
        .from("promotion_requests")
        .select("id, user_id, requested_role, status, cumulative_bj, direct_ziskatels")
        .eq("status", "pending");
      if (error) throw error;
      return (data || []) as PromotionRequest[];
    },
    enabled: !!profile?.id && profile?.role === "vedouci",
  });

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, userId, newRole }: { requestId: string; userId: string; newRole: string }) => {
      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);
      if (roleError) throw roleError;
      const { error: reqError } = await supabase
        .from("promotion_requests")
        .update({ status: "approved", reviewed_by: profile!.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (reqError) throw reqError;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["promotion_requests"] });
      const label = roleBadge[vars.newRole]?.label || vars.newRole;
      toast.success(`Povýšení na ${label} schváleno`);
      fireConfetti();
    },
    onError: () => toast.error("Nepodařilo se schválit povýšení"),
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("promotion_requests")
        .update({ status: "rejected", reviewed_by: profile!.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion_requests"] });
      toast.success("Žádost zamítnuta");
    },
    onError: () => toast.error("Nepodařilo se zamítnout žádost"),
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members", profile?.id, profile?.role],
    queryFn: async () => {
      if (!profile?.id || !profile?.role) return [];

      let query = supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .neq("id", profile.id);

      if (profile.role === "garant") {
        query = query.eq("garant_id", profile.id);
      } else if (profile.role === "vedouci") {
        query = query.eq("vedouci_id", profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!profile?.id,
  });

  const profileMap = new Map(members.map((m) => [m.id, m]));
  if (profile) profileMap.set(profile.id, profile as unknown as Profile);

  // Build children map by ziskatel_id for hierarchy
  const childrenMap = useMemo(() => {
    const map = new Map<string, Profile[]>();
    members.forEach((m) => {
      const parentId = m.ziskatel_id;
      if (parentId) {
        const list = map.get(parentId) || [];
        list.push(m);
        map.set(parentId, list);
      }
    });
    return map;
  }, [members]);

  // Root members: those whose ziskatel_id is the current user or not in the members list
  const rootMembers = useMemo(() => {
    return members.filter((m) => {
      if (!m.ziskatel_id) return true;
      if (m.ziskatel_id === profile?.id) return true;
      if (!profileMap.has(m.ziskatel_id) || m.ziskatel_id === m.id) return true;
      // Check if parent is not in members (meaning parent is the current user)
      return !members.some((other) => other.id === m.ziskatel_id);
    });
  }, [members, profile?.id]);

  const enrichedRequests: PromotionRequest[] = pendingRequests
    .filter((req) => profileMap.has(req.user_id))
    .map((req) => ({
      ...req,
      member: profileMap.get(req.user_id) as PromotionRequest["member"],
      total_ziskatels: req.requested_role === "vedouci" ? (req.cumulative_bj ?? undefined) : undefined,
    }));

  const checkPromotions = useCallback(async () => {
    if (profile?.role !== "vedouci" || members.length === 0) return;

    // Build child map for structure counting
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const childMap = new Map<string, string[]>();
    members.forEach((m) => {
      const parentId = m.ziskatel_id;
      if (parentId) {
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId)!.push(m.id);
      }
    });

    const countStructure = (rootId: string): number => {
      let total = 0;
      const queue = [...(childMap.get(rootId) || [])];
      while (queue.length > 0) {
        const id = queue.shift()!;
        total++;
        queue.push(...(childMap.get(id) || []));
      }
      return total;
    };

    const countDirectSubordinates = (id: string): number => {
      return (childMap.get(id) || []).length;
    };

    // Získatel → Garant: 2 people in structure + 1000 BJ personal
    const ziskatels = members.filter((m) => m.role === "ziskatel");
    if (ziskatels.length > 0) {
      const ziskatelIds = ziskatels.map((m) => m.id);
      const { data: bjData } = await supabase
        .from("activity_records")
        .select("user_id, bj")
        .in("user_id", ziskatelIds);

      const bjByUser = new Map<string, number>();
      (bjData || []).forEach((r: any) => {
        bjByUser.set(r.user_id, (bjByUser.get(r.user_id) || 0) + (r.bj || 0));
      });

      for (const candidate of ziskatels) {
        const cumulativeBj = bjByUser.get(candidate.id) || 0;
        const structureCount = countStructure(candidate.id);
        if (cumulativeBj >= 1000 && structureCount >= 2) {
          await supabase.from("promotion_requests").upsert(
            { user_id: candidate.id, requested_role: "garant", status: "pending", cumulative_bj: cumulativeBj, direct_ziskatels: structureCount },
            { onConflict: "user_id,requested_role", ignoreDuplicates: true }
          );
        }
      }
    }

    // Garant → Budoucí vedoucí: 5 people in structure, min 3 direct
    const garanty = members.filter((m) => m.role === "garant");
    for (const candidate of garanty) {
      const directCount = countDirectSubordinates(candidate.id);
      const structureCount = countStructure(candidate.id);
      if (structureCount >= 5 && directCount >= 3) {
        await supabase.from("promotion_requests").upsert(
          {
            user_id: candidate.id,
            requested_role: "budouci_vedouci",
            status: "pending",
            direct_ziskatels: directCount,
            cumulative_bj: structureCount,
          },
          { onConflict: "user_id,requested_role", ignoreDuplicates: true }
        );
      }
    }

    // Budoucí vedoucí → Vedoucí: 10 people in structure, min 6 direct
    const bvs = members.filter((m) => m.role === "budouci_vedouci");
    for (const candidate of bvs) {
      const directCount = countDirectSubordinates(candidate.id);
      const structureCount = countStructure(candidate.id);
      if (structureCount >= 10 && directCount >= 6) {
        await supabase.from("promotion_requests").upsert(
          {
            user_id: candidate.id,
            requested_role: "vedouci",
            status: "pending",
            direct_ziskatels: directCount,
            cumulative_bj: structureCount,
          },
          { onConflict: "user_id,requested_role", ignoreDuplicates: true }
        );
      }
    }

    refetchRequests();
  }, [profile, members, refetchRequests]);

  useEffect(() => {
    if (!isLoading && members.length > 0) checkPromotions();
  }, [isLoading, members.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" style={{ color: "#0c2226" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>SPRÁVA TÝMU</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["seznam", "orgchart"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`chip ${tab === t ? "chip-teal-active" : "chip-neutral"}`}
          >
            {t === "seznam" ? "Seznam" : "Org chart"}
          </button>
        ))}
      </div>

      {/* Čekající povýšení */}
      {profile?.role === "vedouci" && enrichedRequests.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" style={{ color: "#00abbd" }} />
            <h2 className="font-heading font-semibold" style={{ fontSize: 16, color: "#0c2226" }}>
              Čekající povýšení
            </h2>
          </div>
          <div className="grid gap-3">
            {enrichedRequests.map((req) => {
              if (!req.member) return null;
              const currentBadge = roleBadge[req.member.role] || roleBadge.novacek;
              const targetBadge = roleBadge[req.requested_role] || roleBadge.novacek;
              const initials = req.member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              return (
                <div key={req.id} className="legatus-card legatus-card-sm flex items-center gap-4 flex-wrap"
                  style={{ borderLeft: "3px solid #00abbd" }}>
                  {req.member.avatar_url ? (
                    <img src={req.member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-border flex items-center justify-center">
                      <span className="text-xs font-heading font-semibold">{initials}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-medium text-foreground">{req.member.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={currentBadge.className}>{currentBadge.label}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className={targetBadge.className}>{targetBadge.label}</span>
                      <span className="text-xs font-body" style={{ color: "#8aadb3" }}>
                        {req.requested_role === "garant" && req.cumulative_bj != null &&
                          `Kumulativní BJ: ${req.cumulative_bj} · ${req.direct_ziskatels ?? "?"} ve struktuře`}
                        {req.requested_role === "budouci_vedouci" && req.direct_ziskatels != null &&
                          `${req.direct_ziskatels} přímých · ${req.cumulative_bj ?? "?"} ve struktuře`}
                        {req.requested_role === "vedouci" && req.direct_ziskatels != null &&
                          `${req.direct_ziskatels} přímých · ${req.cumulative_bj ?? "?"} ve struktuře`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate({ requestId: req.id, userId: req.user_id, newRole: req.requested_role })}
                      className="btn btn-primary btn-sm"
                      disabled={approveMutation.isPending}
                    >
                      Schválit
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(req.id)}
                      className="btn btn-ghost btn-sm"
                      disabled={rejectMutation.isPending}
                    >
                      Zamítnout
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "seznam" ? (
        <div className="space-y-1">
          {isLoading ? (
            <div className="legatus-card p-8 text-center">
              <p className="font-body animate-pulse" style={{ color: "#8aadb3" }}>Načítání členů...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="legatus-card p-8 text-center">
              <p className="font-body" style={{ color: "#8aadb3" }}>Zatím nemáte žádné členy v týmu.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {rootMembers.map((member) => {
                const children = childrenMap.get(member.id) || [];
                return (
                  <HierarchyGroup
                    key={member.id}
                    parent={member}
                    children={children}
                    childrenMap={childrenMap}
                    onEdit={setEditMember}
                    onNotify={setNotifyMember}
                    depth={0}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="legatus-card">
          <OrgChart currentUserId={profile?.id || ""} />
        </div>
      )}

      {/* Dialogs */}
      <EditMemberDialog member={editMember} onClose={() => setEditMember(null)} />
      {notifyMember && (
        <CreateNotificationDialog
          open={!!notifyMember}
          onOpenChange={(open) => { if (!open) setNotifyMember(null); }}
          recipientId={notifyMember.id}
          recipientName={notifyMember.full_name}
        />
      )}
    </div>
  );
};

export default SpravaTeam;
