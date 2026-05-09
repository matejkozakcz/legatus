import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { format } from "date-fns";
import { getCurrentProductionPeriod } from "@/lib/productionPeriod";

import { AddMemberDialog } from "@/components/AddMemberDialog";
import { EditMemberDialog } from "@/components/EditMemberDialog";
import { MemberDetailModal } from "@/components/MemberDetailModal";
import { WorkspaceInviteLinkCard } from "@/components/WorkspaceInviteLinkCard";

import { checkPromotions as runCheckPromotions, logPromotionHistory } from "@/lib/checkPromotions";
import { sendNotification } from "@/lib/notifications";

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

const ROLE_BORDER_COLOR: Record<string, string> = {
  vedouci: "#00555f",
  budouci_vedouci: "#00555f",
  garant: "#8b5cf6",
  ziskatel: "#f97316",
  novacek: "#3b82f6",
};

// Same palette as OrgChart progress bar
const PROGRESS_BAR_COLOR: Record<string, string> = {
  vedouci: "#45AABD",
  budouci_vedouci: "#45AABD",
  garant: "#3FC55D",
  ziskatel: "#7c6fcd",
  novacek: "#F39E0A",
};

const ROLE_ORDER: Record<string, number> = {
  vedouci: 0,
  budouci_vedouci: 1,
  garant: 2,
  ziskatel: 3,
  novacek: 4,
};

function MemberCard({
  member,
  onClick,
  depth = 0,
  readOnly = false,
  bjInfo,
  progress,
}: {
  member: Profile;
  onClick: () => void;
  depth?: number;
  readOnly?: boolean;
  bjInfo?: { value: number; isTeam: boolean; nove: number; servisni: number };
  progress?: number;
}) {
  const badge = roleBadge[member.role] || roleBadge.novacek;
  const borderColor = ROLE_BORDER_COLOR[member.role] || ROLE_BORDER_COLOR.novacek;
  const barColor = PROGRESS_BAR_COLOR[member.role] || "#89ADB4";
  const pct = progress != null ? Math.min(Math.max(progress, 0), 100) : undefined;
  const initials = member.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="legatus-card flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden"
      style={{ marginLeft: depth * 24, borderLeft: `3px solid ${borderColor}`, padding: "8px 12px", paddingBottom: pct != null ? 11 : 8 }}
      onClick={onClick}
    >
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-border flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-heading font-semibold">{initials}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-body font-medium text-foreground text-sm leading-tight">{member.full_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`${badge.className}`} style={{ fontSize: 10 }}>{badge.label}</span>
          {bjInfo != null && (
            <span className="font-heading font-semibold" style={{ fontSize: 10, color: borderColor }}>
              {bjInfo.value.toLocaleString("cs-CZ")} BJ{bjInfo.isTeam ? " tým" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar at bottom edge — same style as OrgChart */}
      {pct != null && (
        <div
          className="absolute"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barColor,
              transition: "width 0.4s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}

function HierarchyGroup({
  parent,
  children,
  childrenMap,
  onEdit,
  depth,
  readOnly = false,
  bjMap,
  progressMap,
}: {
  parent: Profile;
  children: Profile[];
  childrenMap: Map<string, Profile[]>;
  onEdit: (m: Profile) => void;
  depth: number;
  readOnly?: boolean;
  bjMap?: Map<string, { value: number; isTeam: boolean }>;
  progressMap?: Map<string, number>;
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
            depth={0}
            readOnly={readOnly}
            bjInfo={bjMap?.get(parent.id)}
            progress={progressMap?.get(parent.id)}
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
                depth={depth + 1}
                readOnly={readOnly}
                bjMap={bjMap}
                progressMap={progressMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const SpravaTeam = () => {
  const { effectiveProfile: profile, isAdmin, godMode, isViewingAsWorkspace } = useAuth();
  // While "viewing as workspace", behave as the workspace owner — never god mode.
  const isGodMode = isAdmin && godMode && !isViewingAsWorkspace;
  const isReadOnly = (profile?.role === "garant" || profile?.role === "ziskatel") && !isGodMode;
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Profile | null>(null);
  // notifyMember state removed — notification system was reset.
  const [detailMember, setDetailMember] = useState<Profile | null>(null);

  // --- Promotion requests ---
  const { data: pendingRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["promotion_requests", profile?.id],
    queryFn: async () => {
      if (!profile?.id || !["vedouci", "budouci_vedouci"].includes(profile.role)) return [];
      const { data, error } = await supabase
        .from("promotion_requests")
        .select("id, user_id, requested_role, status, cumulative_bj, direct_ziskatels")
        .eq("status", "pending");
      if (error) throw error;
      return (data || []) as PromotionRequest[];
    },
    enabled: !!profile?.id && (profile?.role === "vedouci" || profile?.role === "budouci_vedouci"),
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

      // When promoting to garant, reassign garant_id for entire ziskatel subtree
      // but skip subtrees under another garant
      if (newRole === "garant") {
        const allMembers = members.length > 0 ? members : [];
        const childMap = new Map<string, string[]>();
        allMembers.forEach((m) => {
          if (m.ziskatel_id) {
            const list = childMap.get(m.ziskatel_id) || [];
            list.push(m.id);
            childMap.set(m.ziskatel_id, list);
          }
        });
        const memberMap = new Map(allMembers.map((m) => [m.id, m]));
        const subtreeIds: string[] = [];
        const queue = [...(childMap.get(userId) || [])];
        while (queue.length > 0) {
          const id = queue.shift()!;
          const member = memberMap.get(id);
          // Skip subtrees under another garant (they have their own garant)
          if (member && member.role === "garant" && id !== userId) continue;
          subtreeIds.push(id);
          queue.push(...(childMap.get(id) || []));
        }
        if (subtreeIds.length > 0) {
          await supabase
            .from("profiles")
            .update({ garant_id: userId })
            .in("id", subtreeIds);
        }
      }

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
      }

      // Log history
      await logPromotionHistory(userId, newRole, "approved", undefined, undefined, `Schváleno vedoucím ${profile!.full_name}`);

      // Fire promotion_approved trigger
      sendNotification("promotion_approved", {
        subjectUserId: userId,
        senderUserId: profile!.id,
        variables: { new_role: newRole, sender_name: profile!.full_name },
      });
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

      // Fire promotion_rejected trigger
      sendNotification("promotion_rejected", {
        subjectUserId: userId,
        senderUserId: profile!.id,
        variables: { new_role: requestedRole, sender_name: profile!.full_name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotion_requests"] });
      toast.success("Žádost zamítnuta");
    },
    onError: () => toast.error("Nepodařilo se zamítnout žádost"),
  });

  // Fetch all visible profiles, then filter to ziskatel subtree client-side
  const { data: allVisible = [], isLoading } = useQuery({
    queryKey: ["team_members", profile?.id, profile?.role, isGodMode, (profile as any)?.org_unit_id],
    queryFn: async () => {
      if (!profile?.id || !profile?.role) return [];
      if (!["vedouci", "budouci_vedouci", "garant", "ziskatel"].includes(profile.role) && !isGodMode) return [];

      let query = supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .neq("id", profile.id);

      // When viewing as a workspace, restrict the dataset to that workspace
      // so the BFS tree can't escape into the admin's own structure.
      const wsId = (profile as any)?.org_unit_id as string | null | undefined;
      if (isViewingAsWorkspace && wsId) {
        query = query.eq("org_unit_id", wsId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!profile?.id,
  });

  // Build ziskatel subtree from current user (BFS)
  const members = useMemo(() => {
    if (isGodMode) return allVisible;
    if (!profile?.id) return [];

    // Build a map of ziskatel_id -> children
    const ziskatelChildren = new Map<string, Profile[]>();
    allVisible.forEach((m) => {
      if (m.ziskatel_id) {
        const list = ziskatelChildren.get(m.ziskatel_id) || [];
        list.push(m);
        ziskatelChildren.set(m.ziskatel_id, list);
      }
    });

    // BFS from current user's id through ziskatel_id hierarchy
    const result: Profile[] = [];
    const queue = [...(ziskatelChildren.get(profile.id) || [])];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const member = queue.shift()!;
      if (visited.has(member.id)) continue;
      visited.add(member.id);
      result.push(member);
      const children = ziskatelChildren.get(member.id) || [];
      queue.push(...children);
    }
    return result;
  }, [allVisible, profile?.id, isGodMode]);

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
    return members
      .filter((m) => {
        if (!m.ziskatel_id) return true;
        if (m.ziskatel_id === profile?.id) return true;
        if (!profileMap.has(m.ziskatel_id) || m.ziskatel_id === m.id) return true;
        return !members.some((other) => other.id === m.ziskatel_id);
      })
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
  }, [members, profile?.id]);

  // Children map including self → root members so the current user can be rendered as the top node
  const childrenMapWithSelf = useMemo(() => {
    const map = new Map(childrenMap);
    if (profile) map.set(profile.id, rootMembers);
    return map;
  }, [childrenMap, rootMembers, profile?.id]);

  const handleMemberClick = useCallback((m: Profile) => {
    setDetailMember(m);
  }, []);

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

  // ── BJ for current production period ──
  const currentPeriod = useMemo(() => getCurrentProductionPeriod(), []);
  const periodStartStr = format(currentPeriod.start, "yyyy-MM-dd");
  const periodEndStr = format(currentPeriod.end, "yyyy-MM-dd");

  const { data: periodMeetingBj = [] } = useQuery({
    queryKey: ["team_period_bj", periodStartStr, periodEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("user_id, podepsane_bj")
        .eq("cancelled", false)
        .gte("date", periodStartStr)
        .lte("date", periodEndStr);
      if (error) throw error;
      return data || [];
    },
    enabled: members.length > 0,
  });

  const bjMap = useMemo(() => {
    const personalMap = new Map<string, number>();
    periodMeetingBj.forEach((r: any) => {
      personalMap.set(r.user_id, (personalMap.get(r.user_id) || 0) + (Number(r.podepsane_bj) || 0));
    });

    function subtreeBj(nodeId: string): number {
      let total = personalMap.get(nodeId) || 0;
      const kids = childrenMap.get(nodeId) || [];
      kids.forEach((k) => { total += subtreeBj(k.id); });
      return total;
    }

    const map = new Map<string, { value: number; isTeam: boolean }>();
    members.forEach((m) => {
      if (m.role === "vedouci" || m.role === "budouci_vedouci") {
        map.set(m.id, { value: Math.round(subtreeBj(m.id)), isTeam: true });
      } else {
        map.set(m.id, { value: Math.round(personalMap.get(m.id) || 0), isTeam: false });
      }
    });
    // Also compute for the logged-in user if they're BV/Ved
    if (profile && (profile.role === "vedouci" || profile.role === "budouci_vedouci")) {
      const selfBj = (personalMap.get(profile.id) || 0);
      let teamTotal = selfBj;
      members.forEach((m) => {
        teamTotal += (personalMap.get(m.id) || 0);
      });
      // Use subtree approach properly
      map.set(profile.id, { value: Math.round(subtreeBj(profile.id)), isTeam: true });
    }
    return map;
  }, [members, periodMeetingBj, childrenMap, profile]);

  // ── Progress (same logic as OrgChart) ──
  // All-time cumulative BJ from activity_records + client_meetings
  const { data: allBjData = [] } = useQuery({
    queryKey: ["team_all_activity_bj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_records")
        .select("user_id, bj");
      if (error) throw error;
      return data || [];
    },
    enabled: members.length > 0,
  });

  const { data: allMeetingBj = [] } = useQuery({
    queryKey: ["team_all_meeting_bj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("user_id, podepsane_bj")
        .eq("cancelled", false);
      if (error) throw error;
      return data || [];
    },
    enabled: members.length > 0,
  });

  // Recursive structure count (entire subtree below each user)
  const structureCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    function countBelow(nodeId: string): number {
      const kids = childrenMap.get(nodeId) || [];
      let total = kids.length;
      kids.forEach((k) => { total += countBelow(k.id); });
      counts.set(nodeId, total);
      return total;
    }
    members.forEach((m) => { if (!counts.has(m.id)) countBelow(m.id); });
    return counts;
  }, [members, childrenMap]);

  const cumulativeBjMap = useMemo(() => {
    const map = new Map<string, number>();
    allBjData.forEach((r: any) => {
      map.set(r.user_id, (map.get(r.user_id) || 0) + (Number(r.bj) || 0));
    });
    allMeetingBj.forEach((r: any) => {
      map.set(r.user_id, (map.get(r.user_id) || 0) + (Number(r.podepsane_bj) || 0));
    });
    return map;
  }, [allBjData, allMeetingBj]);

  // Same thresholds as OrgChart
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    const allUsers: Profile[] = [...members];
    if (profile) allUsers.push(profile as unknown as Profile);
    allUsers.forEach((p) => {
      let pct: number | undefined;
      if (p.role === "ziskatel") {
        const bjPct = Math.min((cumulativeBjMap.get(p.id) || 0) / 1000, 1) * 75;
        const peoplePct = Math.min((structureCountMap.get(p.id) || 0) / 2, 1) * 25;
        pct = Math.round((bjPct + peoplePct) * 10) / 10;
      } else if (p.role === "garant") {
        pct = ((structureCountMap.get(p.id) || 0) / 5) * 100;
      } else if (p.role === "budouci_vedouci") {
        pct = ((structureCountMap.get(p.id) || 0) / 10) * 100;
      } else if (p.role === "vedouci") {
        pct = 100;
      }
      if (pct != null) map.set(p.id, pct);
    });
    return map;
  }, [members, profile, cumulativeBjMap, structureCountMap]);


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
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 180 }}>
          <div style={{ padding: "0 16px" }}>
            {/* Čekající povýšení */}
            {(profile?.role === "vedouci" || profile?.role === "budouci_vedouci") && enrichedRequests.length > 0 && (
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
                            <img src={req.member.avatar_url} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
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
                          {req.requested_role === "ziskatel" && "100 % zapracování dokončeno"}
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
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {profile && (
                  <HierarchyGroup
                    key={profile.id}
                    parent={profile as unknown as Profile}
                    children={rootMembers}
                    childrenMap={childrenMapWithSelf}
                    onEdit={handleMemberClick}
                    depth={0}
                    readOnly={isReadOnly}
                    bjMap={bjMap}
                    progressMap={progressMap}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Fixed: add member button (stejný styl jako "Přidat schůzku" v Byznys › Schůzky) */}
        {!isReadOnly && (profile?.role === "vedouci" || profile?.role === "budouci_vedouci" || profile?.role === "garant" || isGodMode) && (
          <div
            style={{
              position: "fixed",
              bottom: 120,
              left: 16,
              right: 16,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              onClick={() => setAddOpen(true)}
              className="btn btn-primary btn-md flex items-center justify-center gap-2"
              style={{ flex: 1, boxShadow: "0 -2px 16px rgba(0,0,0,0.06)" }}
              aria-label="Pozvat člena"
            >
              <Plus size={18} />
              Pozvat člena
            </button>
          </div>
        )}

        {/* Dialogs */}
        {detailMember && (
          <MemberDetailModal
            member={detailMember}
            onClose={() => setDetailMember(null)}
            onEdit={detailMember.id !== profile?.id && (profile?.role === "vedouci" || profile?.role === "budouci_vedouci" || isGodMode) ? () => { setDetailMember(null); setEditMember(detailMember); } : undefined}
          />
        )}
        <EditMemberDialog member={editMember} onClose={() => setEditMember(null)} />
        <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
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

      {/* Workspace invite link — viditelné pro vedoucí/BV/garant */}
      {profile && (profile as any).org_unit_id &&
        ["vedouci", "budouci_vedouci", "garant"].includes(profile.role) && (
          <WorkspaceInviteLinkCard
            orgUnitId={(profile as any).org_unit_id}
            canRotate={profile.role === "vedouci"}
            variant="team"
          />
        )}

      {/* Čekající povýšení */}
      {(profile?.role === "vedouci" || profile?.role === "budouci_vedouci") && enrichedRequests.length > 0 && (
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
                    <img src={req.member.avatar_url} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover" />
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
                        {req.requested_role === "ziskatel" && "100 % zapracování dokončeno"}
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
        ) : (
          <div className="space-y-1">
            {profile && (
              <HierarchyGroup
                key={profile.id}
                parent={profile as unknown as Profile}
                children={rootMembers}
                childrenMap={childrenMapWithSelf}
                onEdit={handleMemberClick}
                depth={0}
                readOnly={isReadOnly}
                bjMap={bjMap}
                progressMap={progressMap}
              />
            )}
            {members.length === 0 && (
              <div className="legatus-card p-6 text-center" style={{ marginTop: 12 }}>
                <p className="font-body" style={{ color: "var(--text-muted)" }}>Zatím nemáte žádné členy v týmu.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {detailMember && (
        <MemberDetailModal
          member={detailMember}
          onClose={() => setDetailMember(null)}
          onEdit={detailMember.id !== profile?.id && (profile?.role === "vedouci" || profile?.role === "budouci_vedouci" || isGodMode) ? () => { setDetailMember(null); setEditMember(detailMember); } : undefined}
        />
      )}
      <EditMemberDialog member={editMember} onClose={() => setEditMember(null)} />
      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

export default SpravaTeam;
