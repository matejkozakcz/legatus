import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { ChevronDown } from "lucide-react";
import { PersonPicker } from "@/components/PersonPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  vedouci_id?: string | null;
  garant_id?: string | null;
  ziskatel_id?: string | null;
  osobni_id?: string | null;
  is_active?: boolean | null;
}

interface EditMemberDialogProps {
  member: Profile | null;
  onClose: () => void;
}

const roleBadge: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

export function EditMemberDialog({ member, onClose }: EditMemberDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [ziskatelId, setZiskatelId] = useState("");
  const [osobniId, setOsobniId] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ role: string; label: string } | null>(null);

  const isVedouci = profile?.role === "vedouci";
  const isGarant = profile?.role === "garant";
  const canEditOsobniId = isVedouci || isGarant;

  const { data: potentialZiskatele = [] } = useQuery({
    queryKey: ["potential_ziskatele", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .eq("vedouci_id", profile.id);
      if (error) throw error;
      const list = (data || []) as { id: string; full_name: string; role: string }[];
      if (!list.some((p) => p.id === profile.id)) {
        list.unshift({ id: profile.id, full_name: profile.full_name, role: "vedouci" });
      }
      return list;
    },
    enabled: !!member && isVedouci,
  });

  useEffect(() => {
    if (member) {
      setFullName(member.full_name);
      setZiskatelId(member.ziskatel_id || "");
      setOsobniId(member.osobni_id || "");
      setConfirmDeactivate(false);
      setConfirmRoleChange(null);
    }
  }, [member]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const updateData: Record<string, unknown> = { full_name: fullName };
      if (isVedouci && ziskatelId) {
        updateData.ziskatel_id = ziskatelId;
      }
      if (canEditOsobniId) {
        updateData.osobni_id = osobniId.trim() || null;
      }
      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["team_profiles"] });
      toast.success("Profil byl aktualizován.");
      handleClose();
    },
    onError: () => toast.error("Nepodařilo se aktualizovat profil."),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Člen byl deaktivován.");
      handleClose();
    },
    onError: () => toast.error("Nepodařilo se deaktivovat člena."),
  });

  const promoteMutation = useMutation({
    mutationFn: async (newRole: string) => {
      if (!member) return;
      const updateData: Record<string, unknown> = { role: newRole };
      if (newRole === "vedouci") {
        updateData.vedouci_id = null;
      }
      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", member.id);
      if (error) throw error;
      return newRole;
    },
    onSuccess: (_data, newRole) => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["team_profiles"] });
      const labels: Record<string, string> = { vedouci: "Vedoucího", garant: "Garanta", ziskatel: "Získatele", novacek: "Nováčka" };
      toast.success(`Role změněna na ${labels[newRole] || newRole}.`);
      if (newRole !== "novacek") fireConfetti();
      handleClose();
    },
    onError: () => toast.error("Nepodařilo se změnit roli."),
  });

  const getRoleActions = () => {
    if (!member || !profile || profile.role !== "vedouci") return [];
    if (member.vedouci_id !== profile.id) return [];
    const actions: { role: string; label: string; variant: "promote" | "demote" }[] = [];
    if (member.role === "novacek") {
      actions.push({ role: "ziskatel", label: "Povýšit na Získatele", variant: "promote" });
    }
    if (member.role === "ziskatel") {
      actions.push({ role: "garant", label: "Povýšit na Garanta", variant: "promote" });
      actions.push({ role: "novacek", label: "Ponížit na Nováčka", variant: "demote" });
    }
    if (member.role === "garant") {
      actions.push({ role: "budouci_vedouci", label: "Povýšit na Budoucího vedoucího", variant: "promote" });
      actions.push({ role: "ziskatel", label: "Ponížit na Získatele", variant: "demote" });
    }
    if (member.role === "budouci_vedouci") {
      actions.push({ role: "vedouci", label: "Povýšit na Vedoucího", variant: "promote" });
      actions.push({ role: "garant", label: "Ponížit na Garanta", variant: "demote" });
    }
    return actions;
  };

  const handleClose = () => {
    setFullName("");
    setZiskatelId("");
    setOsobniId("");
    setConfirmDeactivate(false);
    setConfirmRoleChange(null);
    onClose();
  };

  const roleActions = getRoleActions();

  // Confirm deactivate sub-view
  if (confirmDeactivate && member) {
    return (
      <Dialog open={!!member} onOpenChange={handleClose}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading">Deaktivovat člena</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš deaktivovat {member.full_name}? Jejich data zůstanou zachována.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>Zpět</Button>
            <Button variant="destructive" onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending}>
              Deaktivovat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Confirm role change sub-view
  if (confirmRoleChange && member) {
    return (
      <Dialog open={!!member} onOpenChange={handleClose}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading">Změna role</DialogTitle>
            <DialogDescription className="font-body">
              Opravdu chceš změnit roli člena {member.full_name}?{" "}
              Akce: <strong>{confirmRoleChange.label}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRoleChange(null)}>Zpět</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => promoteMutation.mutate(confirmRoleChange.role)}
              disabled={promoteMutation.isPending}
            >
              Potvrdit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={!!member} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Upravit člena</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Celé jméno</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Role</label>
            <Input value={roleBadge[member?.role || "novacek"]} disabled className="bg-muted" />
          </div>
          {isVedouci && (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Získatel</label>
              <select
                value={ziskatelId}
                onChange={(e) => setZiskatelId(e.target.value)}
                className="w-full h-10 px-3 rounded-input border border-input bg-background text-foreground font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Bez získatele</option>
                {potentialZiskatele.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({roleBadge[p.role] || p.role})
                    {p.id === profile?.id ? " (Já)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {canEditOsobniId && (
            <div className="border-t border-border pt-4">
              <label className="text-sm font-body font-medium text-foreground mb-1 block">
                Osobní ID
              </label>
              <Input
                value={osobniId}
                onChange={(e) => setOsobniId(e.target.value)}
                placeholder="např. 122258"
              />
              <p className="text-xs text-muted-foreground mt-1 font-body">
                Osobní ID z Partners platformy. Po přidělení dojde k automatickému povýšení na Získatele.
              </p>
            </div>
          )}

          {/* Role change & deactivate section */}
          {(roleActions.length > 0 || isVedouci) && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm font-body font-medium text-foreground mb-2">Akce</p>
              <div className="flex flex-wrap gap-2">
                {roleActions.map((action) => (
                  <Button
                    key={action.role}
                    variant={action.variant === "demote" ? "outline" : "default"}
                    size="sm"
                    onClick={() => setConfirmRoleChange({ role: action.role, label: action.label })}
                    className={action.variant === "demote" ? "text-destructive border-destructive/30 hover:bg-destructive/10" : "bg-primary text-primary-foreground"}
                  >
                    {action.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeactivate(true)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  Deaktivovat
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Zrušit</Button>
          <Button onClick={() => updateMutation.mutate()} className="bg-primary text-primary-foreground">
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
