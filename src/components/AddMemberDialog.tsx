import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
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

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({ open, onOpenChange }: AddMemberDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedGarant, setSelectedGarant] = useState("");
  const [selectedZiskatel, setSelectedZiskatel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // Get garanté for Vedoucí to select from (include self)
  const { data: garanti = [] } = useQuery({
    queryKey: ["garanti", profile?.id],
    queryFn: async () => {
      if (!profile?.id || profile.role !== "vedouci") return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "garant")
        .eq("vedouci_id", profile.id)
        .eq("is_active", true);
      if (error) throw error;
      // Include the Vedoucí themselves as a garant option
      const list = data || [];
      const selfInList = list.some((g) => g.id === profile.id);
      if (!selfInList) {
        list.unshift({ id: profile.id, full_name: profile.full_name });
      }
      return list;
    },
    enabled: !!profile?.id && profile?.role === "vedouci",
  });

  // Get vedoucí name for Garant users
  const { data: vedouciProfile } = useQuery({
    queryKey: ["vedouci_profile", profile?.vedouci_id],
    queryFn: async () => {
      if (!profile?.vedouci_id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", profile.vedouci_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.vedouci_id && profile?.role === "garant",
  });

  // Get possible získatel candidates (self + people in subtree)
  const { data: ziskatelCandidates = [] } = useQuery({
    queryKey: ["ziskatel_candidates", profile?.id, profile?.role],
    queryFn: async () => {
      if (!profile?.id) return [];
      const vedouciId = profile.role === "vedouci" ? profile.id : profile.vedouci_id;
      // Fetch all active members under this vedoucí
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, garant_id")
        .eq("is_active", true)
        .eq("vedouci_id", vedouciId);
      if (error) throw error;
      const list = (data || []) as { id: string; full_name: string; role: string; garant_id: string | null }[];

      if (profile.role === "vedouci") {
        // Vedoucí can assign to self or anyone in subtree
        const selfInList = list.some((p) => p.id === profile.id);
        if (!selfInList) list.unshift({ id: profile.id, full_name: profile.full_name, role: profile.role });
        return list;
      } else {
        // Garant can assign to self or their own subordinates
        const myPeople = list.filter((p) => p.id === profile.id || p.garant_id === profile.id);
        const selfInList = myPeople.some((p) => p.id === profile.id);
        if (!selfInList) myPeople.unshift({ id: profile.id, full_name: profile.full_name, role: profile.role });
        return myPeople;
      }
    },
    enabled: !!profile?.id,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);

    try {
      const password = Math.random().toString(36).slice(-10) + "A1!";

      const vedouciId = profile.role === "vedouci" ? profile.id : profile.vedouci_id;
      const garantId = profile.role === "garant" ? profile.id : selectedGarant;

      if (!garantId) {
        toast.error("Vyberte garanta.");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.functions.invoke("create-user", {
        body: {
          email,
          password,
          full_name: fullName,
          role: "novacek",
          vedouci_id: vedouciId,
          garant_id: garantId,
          ziskatel_id: profile.id, // whoever creates the member is the získatel
        },
      });

      if (error) throw error;

      setGeneratedPassword(password);
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Člen byl úspěšně přidán.");
      fireConfetti();
    } catch (err: any) {
      toast.error(err.message || "Nepodařilo se vytvořit uživatele.");
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setFullName("");
    setEmail("");
    setSelectedGarant("");
    setGeneratedPassword(null);
    onOpenChange(false);
  };

  if (generatedPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Člen byl vytvořen</DialogTitle>
            <DialogDescription className="font-body">
              Vygenerované heslo (zobrazen pouze jednou):
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-3 rounded-input font-mono text-sm text-foreground select-all">
            {generatedPassword}
          </div>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard.writeText(generatedPassword); toast.success("Heslo zkopírováno."); }}>
              Kopírovat heslo
            </Button>
            <Button variant="ghost" onClick={handleClose}>Zavřít</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Přidat člena</DialogTitle>
          <DialogDescription className="font-body">
            Nový člen bude přidán jako Nováček.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Celé jméno</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jan Novák" />
          </div>
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">E-mail</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jan@email.cz" />
          </div>

          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Role</label>
            <Input value="Nováček" disabled className="bg-muted" />
          </div>

          {profile?.role === "vedouci" ? (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Garant</label>
              <select
                value={selectedGarant}
                onChange={(e) => setSelectedGarant(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-input border border-input bg-background text-foreground font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Vyberte garanta...</option>
                {garanti.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}{g.id === profile?.id ? " (Já)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Garant</label>
              <Input value={`${profile?.full_name || ""} (Já)`} disabled className="bg-muted" />
            </div>
          )}

          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Vedoucí</label>
            <Input
              value={
                profile?.role === "vedouci"
                  ? `${profile?.full_name || ""} (Já)`
                  : vedouciProfile?.full_name || "(načítání...)"
              }
              disabled
              className="bg-muted"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>Zrušit</Button>
            <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground">
              {submitting ? "Vytvářím..." : "Vytvořit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
