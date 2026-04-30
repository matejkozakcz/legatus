import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkspaceModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [parentUnitId, setParentUnitId] = useState<string>("__global__");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setOwnerId("");
      setParentUnitId("__global__");
      setEmail("");
    }
  }, [open]);

  const { data: vedouci } = useQuery({
    queryKey: ["create_ws_vedouci"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, org_unit_id")
        .eq("role", "vedouci")
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: orgUnits } = useQuery({
    queryKey: ["create_ws_units"],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_units")
        .select("id, name")
        .order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const createWs = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Zadej název workspace");
      if (!ownerId) throw new Error("Vyber ownera");

      const { data: newUnit, error: ouErr } = await supabase
        .from("org_units")
        .insert({
          name: name.trim(),
          owner_id: ownerId,
          parent_unit_id: parentUnitId === "__global__" ? null : parentUnitId,
        })
        .select()
        .maybeSingle();
      if (ouErr) throw ouErr;
      if (!newUnit) throw new Error("Workspace nebyl vytvořen");

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ org_unit_id: newUnit.id })
        .eq("id", ownerId);
      if (profErr) throw profErr;

      if (email.trim() && user?.id) {
        const { error: invErr } = await supabase.from("invites").insert({
          org_unit_id: newUnit.id,
          invited_by: user.id,
          role: "vedouci",
          email: email.trim(),
        });
        if (invErr) throw invErr;
      }
    },
    onSuccess: () => {
      toast.success("Workspace vytvořen");
      qc.invalidateQueries({ queryKey: ["org_units"] });
      qc.invalidateQueries({ queryKey: ["invites", "pending"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba vytváření"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="legatus-modal-glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Nový workspace</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Název workspace *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. Pražská pobočka"
            />
          </div>

          <div>
            <Label className="text-xs">Owner (vedoucí) *</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber vedoucího" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[100] max-h-[260px]">
                {(vedouci ?? []).length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Žádní vedoucí
                  </div>
                ) : (
                  vedouci!.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.full_name}
                      {v.org_unit_id ? " · již ve workspace" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Nadřazený workspace</Label>
            <Select value={parentUnitId} onValueChange={setParentUnitId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[100] max-h-[260px]">
                <SelectItem value="__global__">Globální (žádný)</SelectItem>
                {(orgUnits ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Pozvat e-mailem (volitelné)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Vytvoří invite link pro nového vedoucího.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            onClick={() => createWs.mutate()}
            disabled={createWs.isPending || !name.trim() || !ownerId}
            className="bg-[#fc7c71] hover:bg-[#fc7c71]/90 text-white"
          >
            {createWs.isPending ? "Vytváření…" : "Vytvořit workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
