import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ArrowLeft, BarChart3, ChevronDown } from "lucide-react";
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
      // Vedoucí can only act on members who belong to their subtree
      if (member.vedouci_id !== profile.id) return actions;
      if (member.role === "novacek") {
        actions.push({ role: "ziskatel", label: "Povýšit na Získatele", variant: "promote" });
      }
      if (member.role === "ziskatel") {
        actions.push({ role: "garant", label: "Povýšit na Garanta", variant: "promote" });
        actions.push({ role: "novacek", label: "Ponížit na Nováčka", variant: "demote" });
      }
      if (member.role === "garant") {
        actions.push({ role: "vedouci", label: "Povýšit na Vedoucího", variant: "promote" });
        actions.push({ role: "ziskatel", label: "Ponížit na Získatele", variant: "demote" });
      }
    }
    if (profile?.role === "garant") {
      // Garant can only act on their own Nováčci
      if (member.role === "novacek" && member.garant_id === profile.id) {
        actions.push({ role: "garant", label: "Povýšit na Garanta", variant: "promote" });
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
      <Dialog open={!!deactivateMember} onOpenChange={() => setDeactivateMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Deaktivovat člena</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš deaktivovat {deactivateMember?.full_name}? Jejich data zůstanou zachována.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="btn btn-ghost btn-md" onClick={() => setDeactivateMember(null)}>
              Zrušit
            </button>
            <button
              className="btn btn-danger btn-md"
              onClick={() => deactivateMember && deactivateMutation.mutate(deactivateMember.id)}
            >
              Deaktivovat
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirmation */}
      <Dialog open={!!roleChange} onOpenChange={() => setRoleChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Změna role</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš změnit roli člena {roleChange?.member.full_name}?{" "}
              Akce: <strong>{roleChange?.label}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="btn btn-ghost btn-md" onClick={() => setRoleChange(null)}>
              Zrušit
            </button>
            <button
              className="btn btn-primary btn-md"
              onClick={() => roleChange && promoteMutation.mutate({ userId: roleChange.member.id, newRole: roleChange.newRole })}
            >
              Potvrdit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpravaTeam;
