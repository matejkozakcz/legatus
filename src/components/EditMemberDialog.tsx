import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  ziskatel_id?: string | null;
  osobni_id?: string | null;
}

interface EditMemberDialogProps {
  member: Profile | null;
  onClose: () => void;
}

const roleBadge: Record<string, string> = {
  vedouci: "Vedoucí",
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

  const isVedouci = profile?.role === "vedouci";
  const isGarant = profile?.role === "garant";
  const canEditOsobniId = isVedouci || isGarant;

  // Fetch potential získatelé (everyone in vedoucí's subtree)
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
      // Include self
      const list = (data || []) as { id: string; full_name: string; role: string }[];
      if (!list.some((p) => p.id === profile.id)) {
        list.unshift({ id: profile.id, full_name: profile.full_name, role: "vedouci" });
      }
      return list;
    },
    enabled: !!member && isVedouci,
  });

  // Reset form when member changes
  useEffect(() => {
    if (member) {
      setFullName(member.full_name);
      setZiskatelId(member.ziskatel_id || "");
      setOsobniId(member.osobni_id || "");
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
      onClose();
    },
    onError: () => {
      toast.error("Nepodařilo se aktualizovat profil.");
    },
  });

  const handleClose = () => {
    setFullName("");
    setZiskatelId("");
    setOsobniId("");
    onClose();
  };

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
            <>
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
            </>
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
