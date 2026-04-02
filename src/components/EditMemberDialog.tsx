import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
}

interface EditMemberDialogProps {
  member: Profile | null;
  onClose: () => void;
}

const roleBadge: Record<string, string> = {
  vedouci: "Vedoucí",
  garant: "Garant",
  novacek: "Nováček",
};

export function EditMemberDialog({ member, onClose }: EditMemberDialogProps) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(member?.full_name || "");

  // Reset when member changes
  if (member && fullName !== member.full_name && fullName === "") {
    setFullName(member.full_name);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Profil byl aktualizován.");
      onClose();
    },
    onError: () => {
      toast.error("Nepodařilo se aktualizovat profil.");
    },
  });

  const handleClose = () => {
    setFullName("");
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
            <div className="flex items-center gap-2">
              <Input value={roleBadge[member?.role || "novacek"]} disabled className="bg-muted" />
            </div>
          </div>
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
