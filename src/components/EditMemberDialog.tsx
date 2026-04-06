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

const ALL_ROLES = [
  { value: "novacek", label: "Nováček" },
  { value: "ziskatel", label: "Získatel" },
  { value: "garant", label: "Garant" },
  { value: "budouci_vedouci", label: "Budoucí vedoucí" },
  { value: "vedouci", label: "Vedoucí" },
];

// First Monday of December 2025 – the historical BJ slot
const HISTORICAL_WEEK_START = "2025-12-01";

export function EditMemberDialog({ member, onClose }: EditMemberDialogProps) {
  const { profile, isAdmin, godMode } = useAuth();
  const isGodMode = isAdmin && godMode;
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [ziskatelId, setZiskatelId] = useState("");
  const [osobniId, setOsobniId] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ role: string; label: string } | null>(null);

  // God Mode extra fields
  const [godRole, setGodRole] = useState("");
  const [godVedouciId, setGodVedouciId] = useState("");
  const [godGarantId, setGodGarantId] = useState("");
  const [godZiskatelId, setGodZiskatelId] = useState("");
  const [godHistorickyBj, setGodHistorickyBj] = useState("");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const isVedouci = profile?.role === "vedouci";
  const isGarant = profile?.role === "garant";
  const canEditOsobniId = isVedouci || isGarant || isGodMode;

  // Normal ziskatel options (for vedoucí)
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
    enabled: !!member && (isVedouci || isGodMode),
  });

  // God Mode: all profiles for vedoucí/garant/ziskatel pickers
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["all_profiles_for_god"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string; role: string }[];
    },
    enabled: isGodMode,
  });

  // God Mode: fetch historical BJ for this member (Dec 2025)
  const { data: historicalRecord } = useQuery({
    queryKey: ["historical_bj", member?.id],
    queryFn: async () => {
      if (!member?.id) return null;
      const { data } = await supabase
        .from("activity_records")
        .select("id, bj")
        .eq("user_id", member.id)
        .eq("week_start", HISTORICAL_WEEK_START)
        .maybeSingle();
      return data;
    },
    enabled: isGodMode && !!member?.id,
  });

  useEffect(() => {
    if (member) {
      setFullName(member.full_name);
      setZiskatelId(member.ziskatel_id || "");
      setOsobniId(member.osobni_id || "");
      setConfirmDeactivate(false);
      setConfirmRoleChange(null);
      setShowRoleDropdown(false);

      if (isGodMode) {
        setGodRole(member.role);
        setGodVedouciId(member.vedouci_id || "");
        setGodGarantId(member.garant_id || "");
        setGodZiskatelId(member.ziskatel_id || "");
      }
    }
  }, [member, isGodMode]);

  // Sync historical BJ once loaded
  useEffect(() => {
    if (historicalRecord) {
      setGodHistorickyBj(String(historicalRecord.bj ?? ""));
    } else {
      setGodHistorickyBj("");
    }
  }, [historicalRecord]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const updateData: Record<string, unknown> = { full_name: fullName };

      if (isVedouci && !isGodMode && ziskatelId) {
        updateData.ziskatel_id = ziskatelId;
      }
      if (canEditOsobniId) {
        updateData.osobni_id = osobniId.trim() || null;
      }

      // God Mode: update all editable fields
      if (isGodMode) {
        updateData.role = godRole;
        updateData.vedouci_id = godVedouciId || null;
        updateData.garant_id = godGarantId || null;
        updateData.ziskatel_id = godZiskatelId || null;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", member.id);
      if (error) throw error;

      // God Mode: upsert historical BJ
      if (isGodMode) {
        const bjVal = parseFloat(godHistorickyBj);
        if (!isNaN(bjVal) && bjVal >= 0) {
          await supabase
            .from("activity_records")
            .upsert(
              { user_id: member.id, week_start: HISTORICAL_WEEK_START, bj: bjVal },
              { onConflict: "user_id,week_start" }
            );
          queryClient.invalidateQueries({ queryKey: ["historical_bj", member.id] });
        }
      }
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
    setGodRole("");
    setGodVedouciId("");
    setGodGarantId("");
    setGodZiskatelId("");
    setGodHistorickyBj("");
    setShowRoleDropdown(false);
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

  const allProfileOptions = allProfiles.map((p) => ({
    id: p.id,
    label: `${p.full_name} (${roleBadge[p.role] || p.role})`,
  }));

  return (
    <Dialog open={!!member} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            Upravit člena
            {isGodMode && (
              <span className="text-xs font-body font-normal px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#d97706" }}>
                God Mode
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Celé jméno</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          {/* Role field: editable in God Mode, read-only otherwise */}
          <div>
            <label className="text-sm font-body font-medium text-foreground mb-1 block">Role</label>
            {isGodMode ? (
              <div className="relative">
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm font-body bg-background"
                  style={{ border: "1px solid hsl(var(--border))" }}
                  onClick={() => setShowRoleDropdown((v) => !v)}
                >
                  {roleBadge[godRole] || godRole}
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {showRoleDropdown && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
                    style={{ border: "1px solid hsl(var(--border))" }}
                  >
                    {ALL_ROLES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm font-body hover:bg-accent"
                        onClick={() => {
                          setGodRole(opt.value);
                          setShowRoleDropdown(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Input value={roleBadge[member?.role || "novacek"]} disabled className="bg-muted" />
            )}
          </div>

          {/* God Mode: Vedoucí picker */}
          {isGodMode && (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Vedoucí</label>
              <PersonPicker
                value={godVedouciId}
                onChange={setGodVedouciId}
                options={allProfileOptions}
                placeholder="Hledat vedoucího..."
                emptyLabel="Bez vedoucího"
              />
            </div>
          )}

          {/* God Mode: Garant picker */}
          {isGodMode && (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Garant</label>
              <PersonPicker
                value={godGarantId}
                onChange={setGodGarantId}
                options={allProfileOptions}
                placeholder="Hledat garanta..."
                emptyLabel="Bez garanta"
              />
            </div>
          )}

          {/* Získatel: normal vedoucí can edit their own members; God Mode uses all profiles */}
          {(isVedouci || isGodMode) && (
            <div>
              <label className="text-sm font-body font-medium text-foreground mb-1 block">Získatel</label>
              {isGodMode ? (
                <PersonPicker
                  value={godZiskatelId}
                  onChange={setGodZiskatelId}
                  options={allProfileOptions}
                  placeholder="Hledat získatele..."
                  emptyLabel="Bez získatele"
                />
              ) : (
                <PersonPicker
                  value={ziskatelId}
                  onChange={setZiskatelId}
                  options={potentialZiskatele.map((p) => ({
                    id: p.id,
                    label: `${p.full_name} (${roleBadge[p.role] || p.role})${p.id === profile?.id ? " (Já)" : ""}`,
                  }))}
                  placeholder="Hledat získatele..."
                  emptyLabel="Bez získatele"
                />
              )}
            </div>
          )}

          {/* Osobní ID */}
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

          {/* God Mode: Historický výkon BJ */}
          {isGodMode && (
            <div className="border-t border-border pt-4">
              <label className="text-sm font-body font-medium text-foreground mb-1 block">
                Historický výkon (BJ — Prosinec 2025)
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={godHistorickyBj}
                onChange={(e) => setGodHistorickyBj(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1 font-body">
                Celkové BJ přičtené za Prosinec 2025. Upravit může pouze God Mode.
              </p>
            </div>
          )}

          {/* Role change & deactivate section — only for normal vedoucí, not God Mode (God Mode edits role directly above) */}
          {!isGodMode && (roleActions.length > 0 || isVedouci) && (
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

          {/* God Mode: deactivate still available */}
          {isGodMode && (
            <div className="border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeactivate(true)}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                Deaktivovat účet
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Zrušit</Button>
          <Button onClick={() => updateMutation.mutate()} className="bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
