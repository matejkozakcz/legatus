import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ArrowLeft, BarChart3, ChevronDown, TrendingUp } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { OrgChart } from "@/components/OrgChart";
import { AddMemberDialog } from "@/components/AddMemberDialog";
import { EditMemberDialog } from "@/components/EditMemberDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  vedouci_id: string | null;
  garant_id: string | null;
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
  total_ziskatels?: number; // computed client-side for vedouci requests
  member?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

const roleBadge: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

function RoleDropdown({
  actions,
  onSelect,
}: {
  actions: { role: string; label: string; variant: "promote" | "demote" }[];
  onSelect: (action: { role: string; label: string; variant: "promote" | "demote" }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-secondary btn-sm flex items-center gap-1"
      >
        Změnit roli <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border bg-white shadow-lg py-1"
          style={{ borderColor: "#E1E9EB" }}
        >
          {actions.map((action) => (
            <button
              key={action.role}
              onClick={() => { onSelect(action); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-body hover:bg-gray-50 transition-colors"
              style={{ color: action.variant === "demote" ? "#e05a50" : "#0A2126" }}
            >
              {action.label}
            </button>
          ))}
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
  const [deactivateMember, setDeactivateMember] = useState<Profile | null>(null);
  const [roleChange, setRoleChange] = useState<{ member: Profile; newRole: string; label: string } | null>(null);

  // --- Promotion requests ---
  const { data: pendingRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["promotion_requests", profile?.id],
    queryFn: async () => {
      if (!profile?.id || profile.role !== "vedouci") return [];
      // Fetch pending requests for members in this vedouci's team
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
        // Garant sees only their own Nováčci
        query = query.eq("garant_id", profile.id);
      } else if (profile.role === "vedouci") {
        // Vedoucí sees everyone in their subtree:
        // Garanté (vedouci_id = me) + Nováčci (vedouci_id = me)
        query = query.eq("vedouci_id", profile.id);
      }
      // Nováček has no team — returns empty (shouldn't reach this page anyway)

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!profile?.id,
  });

  // Get all profiles for name lookup
  const profileMap = new Map(members.map((m) => [m.id, m]));
  if (profile) profileMap.set(profile.id, profile as unknown as Profile);

  // Enrich pending requests with member data + computed total_ziskatels for vedouci requests
  const enrichedRequests: PromotionRequest[] = pendingRequests
    .filter((req) => profileMap.has(req.user_id))
    .map((req) => ({
      ...req,
      member: profileMap.get(req.user_id) as PromotionRequest["member"],
      // For vedouci requests, cumulative_bj was repurposed to store totalZiskatels
      total_ziskatels: req.requested_role === "vedouci" ? (req.cumulative_bj ?? undefined) : undefined,
    }));

  // Auto-check promotion conditions for the team
  const checkPromotions = useCallback(async () => {
    if (profile?.role !== "vedouci" || members.length === 0) return;

    // ── Získatel → Garant: BJ >= 1 000 ────────────────────────────────────────
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
        if (cumulativeBj >= 1000) {
          await supabase.from("promotion_requests").upsert(
            { user_id: candidate.id, requested_role: "garant", status: "pending", cumulative_bj: cumulativeBj },
            { onConflict: "user_id,requested_role", ignoreDuplicates: true }
          );
        }
      }
    }

    // ── Garant → Vedoucí: celkem >= 10 Získatelů ve struktuře + min. 3 přímí ─
    const garanty = members.filter((m) => m.role === "garant");
    if (garanty.length > 0) {
      const memberMap = new Map(members.map((m) => [m.id, m]));

      // Build parent→children map by ziskatel_id
      const childrenMap = new Map<string, string[]>();
      members.forEach((m) => {
        const parentId = (m as any).ziskatel_id;
        if (parentId) {
          if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
          childrenMap.get(parentId)!.push(m.id);
        }
      });

      // BFS: count ALL Získatelé in the subtree of rootId
      const countTotalZiskatels = (rootId: string): number => {
        let total = 0;
        const queue = [...(childrenMap.get(rootId) || [])];
        while (queue.length > 0) {
          const id = queue.shift()!;
          const m = memberMap.get(id);
          if (m?.role === "ziskatel") total++;
          queue.push(...(childrenMap.get(id) || []));
        }
        return total;
      };

      for (const candidate of garanty) {
        // Direct Získatelé = children with role ziskatel
        const directZiskatels = (childrenMap.get(candidate.id) || [])
          .filter((id) => memberMap.get(id)?.role === "ziskatel").length;

        const totalZiskatels = countTotalZiskatels(candidate.id);

        if (totalZiskatels >= 10 && directZiskatels >= 3) {
          await supabase.from("promotion_requests").upsert(
            {
              user_id: candidate.id,
              requested_role: "vedouci",
              status: "pending",
              direct_ziskatels: directZiskatels,
              cumulative_bj: totalZiskatels, // reuse field to store total count
            },
            { onConflict: "user_id,requested_role", ignoreDuplicates: true }
          );
        }
      }
    }

    refetchRequests();
  }, [profile, members, refetchRequests]);

  useEffect(() => {
    if (!isLoading && members.length > 0) checkPromotions();
  }, [isLoading, members.length]);

  const promoteMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const updateData: Record<string, unknown> = { role: newRole };
      // When promoting to vedoucí, clear parent references — they become independent
      if (newRole === "vedouci") {
        updateData.vedouci_id = null;
      }
      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", userId);
      if (error) throw error;
      return newRole;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["team_profiles"] });
      const roleLabels: Record<string, string> = { vedouci: "Vedoucího", garant: "Garanta", ziskatel: "Získatele", novacek: "Nováčka" };
      toast.success(`Role změněna na ${roleLabels[variables.newRole] || variables.newRole}.`);
      if (variables.newRole !== "novacek") {
        fireConfetti();
      }
      setRoleChange(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      setDeactivateMember(null);
      toast.success("Člen byl deaktivován.");
    },
  });

  const getRoleActions = (member: Profile) => {
    const actions: { role: string; label: string; variant: "promote" | "demote" }[] = [];
    if (profile?.role === "vedouci") {
      if (member.vedouci_id !== profile.id) return actions;
      // novacek → ziskatel: fallback (normálně přes Osobní ID trigger)
      if (member.role === "novacek") {
        actions.push({ role: "ziskatel", label: "Povýšit na Získatele", variant: "promote" });
      }
      // Demotions only — garant/vedouci promotions jdou přes approval flow
      if (member.role === "ziskatel") {
        actions.push({ role: "novacek", label: "Ponížit na Nováčka", variant: "demote" });
      }
      if (member.role === "garant") {
        actions.push({ role: "ziskatel", label: "Ponížit na Získatele", variant: "demote" });
      }
    }
    return actions;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" style={{ color: "#0c2226" }} />
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>SPRÁVA TÝMU</h1>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn btn-primary btn-md flex items-center gap-2">
          <Plus className="h-4 w-4" /> Přidat člena
        </button>
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

      {/* Čekající povýšení — only for vedoucí when there are pending requests */}
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
                          `Kumulativní BJ: ${req.cumulative_bj}`}
                        {req.requested_role === "vedouci" && req.direct_ziskatels != null &&
                          `${req.direct_ziskatels} přímých · ${req.total_ziskatels ?? "?"} celkem Získatelů`}
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
        <div className="space-y-3">
          {isLoading ? (
            <div className="legatus-card p-8 text-center">
              <p className="font-body animate-pulse" style={{ color: "#8aadb3" }}>Načítání členů...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="legatus-card p-8 text-center">
              <p className="font-body" style={{ color: "#8aadb3" }}>Zatím nemáte žádné členy v týmu.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {members.map((member) => {
                const badge = roleBadge[member.role] || roleBadge.novacek;
                const roleActions = getRoleActions(member);
                const vedouciName = member.vedouci_id ? profileMap.get(member.vedouci_id)?.full_name : null;
                const garantName = member.garant_id ? profileMap.get(member.garant_id)?.full_name : null;
                const initials = member.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <div
                    key={member.id}
                    className="legatus-card legatus-card-sm flex items-center gap-4 flex-wrap"
                  >
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-border flex items-center justify-center">
                        <span className="text-xs font-heading font-semibold">{initials}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-body font-medium text-foreground">{member.full_name}</p>
                        <span className={badge.className}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground font-body mt-0.5">
                        {vedouciName && <span>Vedoucí: {vedouciName}</span>}
                        {garantName && <span>Garant: {garantName}</span>}
                        {(() => {
                          const ziskatelName = (member as any).ziskatel_id ? profileMap.get((member as any).ziskatel_id)?.full_name : null;
                          return ziskatelName ? <span>Získatel: {ziskatelName}</span> : null;
                        })()}
                        {member.created_at && (
                          <span>Přidán: {format(new Date(member.created_at), "d. M. yyyy", { locale: cs })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Link
                        to={`/tym/${member.id}/aktivity`}
                        className="btn btn-ghost btn-sm"
                      >
                        Zobrazit aktivity
                      </Link>
                      <button
                        onClick={() => setEditMember(member)}
                        className="btn btn-ghost btn-sm"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => setDeactivateMember(member)}
                        className="btn btn-danger btn-sm"
                      >
                        Deaktivovat
                      </button>
                      {roleActions.length > 0 && (
                        <RoleDropdown
                          actions={roleActions}
                          onSelect={(action) => setRoleChange({ member, newRole: action.role, label: action.label })}
                        />
                      )}
                    </div>
                  </div>
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
      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditMemberDialog member={editMember} onClose={() => setEditMember(null)} />

      {/* Deactivate confirmation */}
      <Dialog open={!!deactivateMember} onOpenChange={(open) => { if (!open) setDeactivateMember(null); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading">Deaktivovat člena</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš deaktivovat {deactivateMember?.full_name}? Jejich data zůstanou zachována.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeactivateMember(null)}>
              Zrušit
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deactivateMember && deactivateMutation.mutate(deactivateMember.id)}
              disabled={deactivateMutation.isPending}
            >
              Deaktivovat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirmation */}
      <Dialog open={!!roleChange} onOpenChange={(open) => { if (!open) setRoleChange(null); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading">Změna role</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš změnit roli člena {roleChange?.member.full_name}?{" "}
              Akce: <strong>{roleChange?.label}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRoleChange(null)}>
              Zrušit
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (roleChange) {
                  promoteMutation.mutate({ userId: roleChange.member.id, newRole: roleChange.newRole });
                }
              }}
              disabled={promoteMutation.isPending}
            >
              Potvrdit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpravaTeam;
