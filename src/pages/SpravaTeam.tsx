import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ChevronDown, ChevronRight, TrendingUp, Bell } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";

import { CreateNotificationDialog } from "@/components/CreateNotificationDialog";
import { AddMemberDialog } from "@/components/AddMemberDialog";
import { EditMemberDialog } from "@/components/EditMemberDialog";

import { checkPromotions as runCheckPromotions, logPromotionHistory } from "@/lib/checkPromotions";

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
  const { profile, isAdmin, godMode } = useAuth();
  const isGodMode = isAdmin && godMode;
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const isDark = theme === "dark";
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

      // When promoting to vedouci, reassign the entire subtree under the new vedouci
      if (newRole === "vedouci") {
        // Collect all IDs in the subtree (BFS via ziskatel_id)
        const allMembers = members.length > 0 ? members : [];
        const childMap = new Map<string, string[]>();
        allMembers.forEach((m) => {
          if (m.ziskatel_id) {
            const list = childMap.get(m.ziskatel_id) || [];
            list.push(m.id);
            childMap.set(m.ziskatel_id, list);
          }
        });
        const subtreeIds: string[] = [];
        const queue = [...(childMap.get(userId) || [])];
        while (queue.length > 0) {
          const id = queue.shift()!;
          subtreeIds.push(id);
          queue.push(...(childMap.get(id) || []));
        }
        if (subtreeIds.length > 0) {
          await supabase
            .from("profiles")
            .update({ vedouci_id: userId })
            .in("id", subtreeIds);
        }
        // vedouci_id is kept so the promoted user remains in the hierarchy
      }

      // Log history
      await logPromotionHistory(userId, newRole, "approved", undefined, undefined, `Schváleno vedoucím ${profile!.full_name}`);

      // Send notification to the promoted user
      // Use sender_id = userId so the self-notification RLS policy allows insert
      // (the user may not be a direct subordinate of the current vedouci after subtree reassignment)
      const roleLabel = roleBadge[newRole]?.label || newRole;
      const { data: notifData, error: notifError } = await supabase.from("notifications").insert({
        sender_id: userId,
        recipient_id: userId,
        type: "promotion_approved",
        title: `Gratulujeme! Tvé povýšení na ${roleLabel} bylo schváleno 🎉`,
        body: `Vedoucí ${profile!.full_name} schválil tvé povýšení. Nyní máš roli ${roleLabel}.`,
        deadline: new Date().toISOString().split("T")[0],
      }).select("id").single();

      // Trigger push notification
      if (notifData?.id) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        fetch(`https://${projectId}.supabase.co/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ notification_id: notifData.id }),
        }).catch(() => {});
      }
      if (notifError) {
        console.error("Failed to insert promotion notification:", notifError);
      }
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
    mutationFn: async ({ requestId, userId, requestedRole }: { requestId: string; userId: string; requestedRole: string }) => {
      const { error } = await supabase
        .from("promotion_requests")
        .update({ status: "rejected", reviewed_by: profile!.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      await logPromotionHistory(userId, requestedRole, "rejected", undefined, undefined, `Zamítnuto vedoucím ${profile!.full_name}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion_requests"] });
      toast.success("Žádost zamítnuta");
    },
    onError: () => toast.error("Nepodařilo se zamítnout žádost"),
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members", profile?.id, profile?.role, isGodMode],
    queryFn: async () => {
      if (!profile?.id || !profile?.role) return [];
      if (!["vedouci", "budouci_vedouci", "garant"].includes(profile.role) && !isGodMode) return [];

      let query = supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .neq("id", profile.id);

      // God Mode: see ALL users across all structures
      if (!isGodMode) {
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
    if (!profile) return;
    await runCheckPromotions(profile, members);
    refetchRequests();
  }, [profile, members, refetchRequests]);

  useEffect(() => {
    if (!isLoading && members.length > 0) checkPromotions();
  }, [isLoading, members.length, checkPromotions]);



  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", paddingTop: "max(32px, calc(env(safe-area-inset-top, 32px) + 16px))" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            <h1 className="font-heading font-bold text-foreground" style={{ fontSize: 22 }}>Správa týmu</h1>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 120 }}>
          <div style={{ padding: "0 16px" }}>
            {/* Čekající povýšení */}
            {profile?.role === "vedouci" && enrichedRequests.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                  <TrendingUp className="h-4 w-4" style={{ color: "#00abbd" }} />
                  <h2 className="font-heading font-semibold" style={{ fontSize: 15, color: "var(--text-primary)" }}>
                    Čekající povýšení
                  </h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {enrichedRequests.map((req) => {
                    if (!req.member) return null;
                    const currentBadge = roleBadge[req.member.role] || roleBadge.novacek;
                    const targetBadge = roleBadge[req.requested_role] || roleBadge.novacek;
                    const initials = req.member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={req.id} style={{
                        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)",
                        borderRadius: 16,
                        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e1e9eb",
                        borderLeft: "4px solid #00abbd",
                        padding: "14px 14px",
                      }}>
                        <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                          {req.member.avatar_url ? (
                            <img src={req.member.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-border flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-heading font-semibold">{initials}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-body font-medium text-foreground text-sm truncate">{req.member.full_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={currentBadge.className} style={{ fontSize: 10 }}>{currentBadge.label}</span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className={targetBadge.className} style={{ fontSize: 10 }}>{targetBadge.label}</span>
                            </div>
                          </div>
                        </div>
                        {/* Stats */}
                        <div className="text-xs font-body mb-2" style={{ color: "var(--text-muted)" }}>
                          {req.requested_role === "garant" && req.cumulative_bj != null &&
                            `Kumulativní BJ: ${req.cumulative_bj} · ${req.direct_ziskatels ?? "?"} ve struktuře`}
                          {req.requested_role === "budouci_vedouci" && req.direct_ziskatels != null &&
                            `${req.direct_ziskatels} přímých · ${req.cumulative_bj ?? "?"} ve struktuře`}
                          {req.requested_role === "vedouci" && req.direct_ziskatels != null &&
                            `${req.direct_ziskatels} přímých · ${req.cumulative_bj ?? "?"} ve struktuře`}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate({ requestId: req.id, userId: req.user_id, newRole: req.requested_role })}
                            className="btn btn-primary btn-sm flex-1"
                            disabled={approveMutation.isPending}
                          >
                            Schválit
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate({ requestId: req.id, userId: req.user_id, requestedRole: req.requested_role })}
                            className="btn btn-ghost btn-sm flex-1"
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

            {/* Members list */}
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                <p className="font-body animate-pulse">Načítání členů...</p>
              </div>
            ) : members.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                <Users className="h-10 w-10 mx-auto mb-3" style={{ color: isDark ? "#2a5a62" : "#c4d8db" }} />
                <div className="font-heading font-semibold" style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>
                  Zatím žádní členové
                </div>
                <div className="text-sm">V týmu zatím nemáte žádné členy.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rootMembers.map((member) => {
                  const children = childrenMap.get(member.id) || [];
                  return (
                    <HierarchyGroup
                      key={member.id}
                      parent={member}
                      children={children}
                      childrenMap={childrenMap}
                      onEdit={profile?.role === "vedouci" || isGodMode ? setEditMember : () => {}}
                      onNotify={setNotifyMember}
                      depth={0}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

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
  }

  // ─── Desktop ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>SPRÁVA TÝMU</h1>
        </div>
      </div>

      {/* Čekající povýšení */}
      {profile?.role === "vedouci" && enrichedRequests.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" style={{ color: "#00abbd" }} />
            <h2 className="font-heading font-semibold" style={{ fontSize: 16, color: "var(--text-primary)" }}>
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
                      <span className="text-xs font-body" style={{ color: "var(--text-muted)" }}>
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
                      onClick={() => rejectMutation.mutate({ requestId: req.id, userId: req.user_id, requestedRole: req.requested_role })}
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

      <div className="space-y-1">
        {isLoading ? (
          <div className="legatus-card p-8 text-center">
            <p className="font-body animate-pulse" style={{ color: "var(--text-muted)" }}>Načítání členů...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="legatus-card p-8 text-center">
            <p className="font-body" style={{ color: "var(--text-muted)" }}>Zatím nemáte žádné členy v týmu.</p>
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
                  onEdit={profile?.role === "vedouci" || isGodMode ? setEditMember : () => {}}
                  onNotify={setNotifyMember}
                  depth={0}
                />
              );
            })}
          </div>
        )}
      </div>

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
