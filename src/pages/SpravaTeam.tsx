import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, ArrowLeft, BarChart3 } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
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
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

const SpravaTeam = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"seznam" | "orgchart">("seznam");
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Profile | null>(null);
  const [deactivateMember, setDeactivateMember] = useState<Profile | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .neq("id", profile.id);
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
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Člen byl povýšen.");
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

  const canPromote = (member: Profile) => {
    if (profile?.role === "vedouci") {
      if (member.role === "novacek") return "garant";
      if (member.role === "garant") return "vedouci";
    }
    if (profile?.role === "garant" && member.role === "novacek" && member.garant_id === profile.id) {
      return "garant";
    }
    return null;
  };

  const promotionLabel: Record<string, string> = {
    garant: "Povýšit na Garanta",
    vedouci: "Povýšit na Vedoucího",
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
            <div className="bg-card rounded-card shadow-card p-8 text-center">
              <p className="text-muted-foreground font-body animate-pulse">Načítání členů...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="bg-card rounded-card shadow-card p-8 text-center">
              <p className="text-muted-foreground font-body">Zatím nemáte žádné členy v týmu.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {members.map((member) => {
                const badge = roleBadge[member.role] || roleBadge.novacek;
                const promotion = canPromote(member);
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
                    className="bg-card rounded-panel shadow-card p-4 flex items-center gap-4 flex-wrap"
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
                        <span className={`px-2 py-0.5 text-[10px] font-heading font-semibold rounded-pill ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground font-body mt-0.5">
                        {vedouciName && <span>Vedoucí: {vedouciName}</span>}
                        {garantName && <span>Garant: {garantName}</span>}
                        {member.created_at && (
                          <span>Přidán: {format(new Date(member.created_at), "d. M. yyyy", { locale: cs })}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Link
                        to={`/tym/${member.id}/aktivity`}
                        className="px-3 py-1.5 rounded-input text-xs font-body font-medium bg-secondary/20 text-secondary hover:bg-secondary/30 transition-colors"
                      >
                        Zobrazit aktivity
                      </Link>
                      <button
                        onClick={() => setEditMember(member)}
                        className="px-3 py-1.5 rounded-input text-xs font-body font-medium bg-muted text-foreground hover:bg-border transition-colors"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => setDeactivateMember(member)}
                        className="px-3 py-1.5 rounded-input text-xs font-body font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        Deaktivovat
                      </button>
                      {promotion && (
                        <button
                          onClick={() => promoteMutation.mutate({ userId: member.id, newRole: promotion })}
                          className="px-3 py-1.5 rounded-input text-xs font-body font-medium bg-legatus-teal/10 text-legatus-teal hover:bg-legatus-teal/20 transition-colors"
                        >
                          {promotionLabel[promotion]}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-card shadow-card p-6">
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
            <Button variant="ghost" onClick={() => setDeactivateMember(null)}>
              Zrušit
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => deactivateMember && deactivateMutation.mutate(deactivateMember.id)}
            >
              Deaktivovat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpravaTeam;
