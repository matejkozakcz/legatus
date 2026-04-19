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
import { PersonPicker } from "@/components/PersonPicker";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const roleLabels: Record<string, string> = {
  vedouci: "Vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({ open, onOpenChange }: AddMemberDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [selectedGarant, setSelectedGarant] = useState("");
  const [selectedZiskatel, setSelectedZiskatel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Get garanté for Vedoucí to select from (include self)
  const { data: garanti = [] } = useQuery({
    queryKey: ["garanti", profile?.id],
    queryFn: async () => {
      if (!profile?.id || !["vedouci", "budouci_vedouci"].includes(profile.role)) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "garant")
        .eq("vedouci_id", profile.id)
        .eq("is_active", true);
      if (error) throw error;
      // Include the Vedoucí (nebo BV) themselves as a garant option
      const list = data || [];
      const selfInList = list.some((g) => g.id === profile.id);
      if (!selfInList) {
        list.unshift({ id: profile.id, full_name: profile.full_name });
      }
      return list;
    },
    enabled: !!profile?.id && (profile?.role === "vedouci" || profile?.role === "budouci_vedouci"),
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
      const vedouciId = ["vedouci", "budouci_vedouci"].includes(profile.role) ? profile.id : profile.vedouci_id;
      // Fetch all active members under this vedoucí
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, garant_id")
        .eq("is_active", true)
        .eq("vedouci_id", vedouciId);
      if (error) throw error;
      const list = (data || []) as { id: string; full_name: string; role: string; garant_id: string | null }[];

      if (["vedouci", "budouci_vedouci"].includes(profile.role)) {
        const selfInList = list.some((p) => p.id === profile.id);
        if (!selfInList) list.unshift({ id: profile.id, full_name: profile.full_name, role: profile.role, garant_id: null });
        return list;
      } else {
        const myPeople = list.filter((p) => p.id === profile.id || p.garant_id === profile.id);
        const selfInList = myPeople.some((p) => p.id === profile.id);
        if (!selfInList) myPeople.unshift({ id: profile.id, full_name: profile.full_name, role: profile.role, garant_id: null });
        return myPeople;
      }
    },
    enabled: !!profile?.id,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    // Client-side email validation (mirrors server)
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailError("Neplatný formát e-mailu.");
      return;
    }
    setEmailError(null);

    setSubmitting(true);

    try {
      const vedouciId = ["vedouci", "budouci_vedouci"].includes(profile.role) ? profile.id : profile.vedouci_id;
      const garantId = profile.role === "garant" ? profile.id : selectedGarant;
      const ziskatelId = selectedZiskatel || profile.id;

      if (!garantId) {
        toast.error("Vyberte garanta.");
        setSubmitting(false);
        return;
      }
      if (!ziskatelId) {
        toast.error("Vyberte získatele.");
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: normalizedEmail,
          full_name: fullName.trim(),
          role: "novacek",
          vedouci_id: vedouciId,
          garant_id: garantId,
          ziskatel_id: ziskatelId,
        },
      });

      // FunctionsHttpError carries status on error.context
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status;
        let serverMsg: string | null = null;
        try {
          const ctxRes = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
          if (ctxRes?.json) {
            const body = await ctxRes.json();
            serverMsg = body?.error ?? null;
          }
        } catch {
          // ignore
        }

        if (status === 409) {
          toast.error(serverMsg || "Tento e-mail už je registrován.");
        } else if (status === 429) {
          toast.error(serverMsg || "Překročil jsi limit pozvánek, zkus to za hodinu.");
        } else if (status === 400 && serverMsg?.toLowerCase().includes("e-mail")) {
          setEmailError(serverMsg);
        } else {
          toast.error(serverMsg || error.message || "Nepodařilo se odeslat pozvánku.");
        }
        setSubmitting(false);
        return;
      }

      // Server may also return { error } in 2xx body — handle defensively
      if (data && typeof data === "object" && "error" in data && data.error) {
        toast.error(String(data.error));
        setSubmitting(false);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      toast.success(`Pozvánka byla odeslána na ${normalizedEmail}`);
      fireConfetti();
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nepodařilo se odeslat pozvánku.";
      toast.error(message);
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setFullName("");
    setEmail("");
    setEmailError(null);
    setSelectedGarant("");
    setSelectedZiskatel("");
    onOpenChange(false);
  };


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

          {profile?.role === "vedouci" || profile?.role === "budouci_vedouci" ? (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Garant</label>
              <PersonPicker
                value={selectedGarant}
                onChange={setSelectedGarant}
                options={garanti.map((g) => ({
                  id: g.id,
                  label: `${g.full_name}${g.id === profile?.id ? " (Já)" : ""}`,
                }))}
                placeholder="Vyberte garanta..."
                required
              />
            </div>
          ) : (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Garant</label>
              <Input value={`${profile?.full_name || ""} (Já)`} disabled className="bg-muted" />
            </div>
          )}

          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Získatel (pod koho bude patřit)</label>
            <PersonPicker
              value={selectedZiskatel}
              onChange={setSelectedZiskatel}
              options={ziskatelCandidates.map((z) => ({
                id: z.id,
                label: `${z.full_name}${z.id === profile?.id ? " (Já)" : ""} — ${roleLabels[z.role] || z.role}`,
              }))}
              placeholder="Vyberte získatele..."
              required
            />
          </div>

          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Vedoucí</label>
            <Input
              value={
                profile?.role === "vedouci" || profile?.role === "budouci_vedouci"
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
