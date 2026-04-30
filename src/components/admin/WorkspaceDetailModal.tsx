import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { X, Plus, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceInviteLinkCard } from "@/components/WorkspaceInviteLinkCard";

interface OrgUnit {
  id: string;
  name: string;
  owner_id: string | null;
  parent_unit_id: string | null;
  is_active: boolean;
}

interface Props {
  orgUnit: OrgUnit;
  open: boolean;
  onClose: () => void;
}

type Transition = "ziskatel_to_garant" | "garant_to_bv" | "bv_to_vedouci";

const TRANSITION_LABELS: Record<Transition, string> = {
  ziskatel_to_garant: "Získatel → Garant",
  garant_to_bv: "Garant → BV",
  bv_to_vedouci: "BV → Vedoucí",
};

const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

const ROLE_COLORS: Record<string, string> = {
  vedouci: "#00555f",
  budouci_vedouci: "#22c55e",
  garant: "#7c5cff",
  ziskatel: "#00abbd",
  novacek: "#94a3b8",
};

const ROLE_ORDER: Record<string, number> = {
  vedouci: 0,
  budouci_vedouci: 1,
  garant: 2,
  ziskatel: 3,
  novacek: 4,
};

interface RuleFields {
  min_bj?: number | null;
  min_structure?: number | null;
  min_direct?: number | null;
}

export function WorkspaceDetailModal({ orgUnit, open, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(orgUnit.name);
  const [parentId, setParentId] = useState<string | null>(orgUnit.parent_unit_id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  // Local rule state (per transition) — partial, only set fields override
  const [ruleEdits, setRuleEdits] = useState<Record<Transition, RuleFields>>({
    ziskatel_to_garant: {},
    garant_to_bv: {},
    bv_to_vedouci: {},
  });

  useEffect(() => {
    if (open) {
      setName(orgUnit.name);
      setParentId(orgUnit.parent_unit_id);
    }
  }, [open, orgUnit.id]);

  // ── All other workspaces (for parent select) ──
  const { data: otherUnits } = useQuery({
    queryKey: ["org_units_others", orgUnit.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_units")
        .select("id, name")
        .neq("id", orgUnit.id)
        .order("name");
      return data ?? [];
    },
    enabled: open,
  });

  // ── Members of this workspace (all roles) ──
  const { data: members } = useQuery({
    queryKey: ["org_unit_members", orgUnit.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("org_unit_id", orgUnit.id)
        .eq("is_active", true)
        .order("full_name");
      const rows = data ?? [];
      return rows.sort((a: any, b: any) => {
        const ra = ROLE_ORDER[a.role] ?? 99;
        const rb = ROLE_ORDER[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "", "cs");
      });
    },
    enabled: open,
  });

  // ── Available leaders/garants without org_unit_id ──
  const { data: availableMembers } = useQuery({
    queryKey: ["available_members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .is("org_unit_id", null)
        .in("role", ["vedouci", "budouci_vedouci", "garant", "ziskatel", "novacek"])
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
    enabled: open && addPickerOpen,
  });

  // ── Effective and custom rules ──
  const { data: effectiveRules } = useQuery({
    queryKey: ["effective_rules", orgUnit.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_effective_promotion_rules", {
        _org_unit_id: orgUnit.id,
      });
      return (data ?? []) as Array<{
        transition: string;
        min_bj: number | null;
        min_structure: number | null;
        min_direct: number | null;
      }>;
    },
    enabled: open,
  });

  const { data: customRules } = useQuery({
    queryKey: ["custom_rules", orgUnit.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("promotion_rules")
        .select("*")
        .eq("org_unit_id", orgUnit.id);
      return data ?? [];
    },
    enabled: open,
  });

  const customByTransition = useMemo(() => {
    const map = new Map<string, any>();
    (customRules ?? []).forEach((r: any) => map.set(r.transition, r));
    return map;
  }, [customRules]);

  const effectiveByTransition = useMemo(() => {
    const map = new Map<string, any>();
    (effectiveRules ?? []).forEach((r: any) => map.set(r.transition, r));
    return map;
  }, [effectiveRules]);

  // Reset local edits when rules reload
  useEffect(() => {
    setRuleEdits({
      ziskatel_to_garant: {},
      garant_to_bv: {},
      bv_to_vedouci: {},
    });
  }, [customRules, open]);

  const addMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ org_unit_id: orgUnit.id })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Člen přidán");
      qc.invalidateQueries({ queryKey: ["org_unit_members", orgUnit.id] });
      qc.invalidateQueries({ queryKey: ["available_members"] });
      qc.invalidateQueries({ queryKey: ["org_units"] });
      setAddPickerOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ org_unit_id: null })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Člen odebrán");
      qc.invalidateQueries({ queryKey: ["org_unit_members", orgUnit.id] });
      qc.invalidateQueries({ queryKey: ["org_units"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      // 1. Update org_unit basics
      const { error: ouErr } = await supabase
        .from("org_units")
        .update({
          name: name.trim(),
          parent_unit_id: parentId,
        })
        .eq("id", orgUnit.id);
      if (ouErr) throw ouErr;

      // 2. Sync promotion rules per transition
      const transitions: Transition[] = [
        "ziskatel_to_garant",
        "garant_to_bv",
        "bv_to_vedouci",
      ];

      for (const t of transitions) {
        const existing = customByTransition.get(t);
        const edits = ruleEdits[t];
        // Compute proposed values: edited > existing custom > undefined
        const proposed: RuleFields = {
          min_bj: edits.min_bj !== undefined ? edits.min_bj : existing?.min_bj ?? null,
          min_structure:
            edits.min_structure !== undefined
              ? edits.min_structure
              : existing?.min_structure ?? null,
          min_direct:
            edits.min_direct !== undefined ? edits.min_direct : existing?.min_direct ?? null,
        };

        // Determine if there's any meaningful value (>0 or non-null) for this transition
        const fieldsForTransition: (keyof RuleFields)[] =
          t === "ziskatel_to_garant"
            ? ["min_bj", "min_structure"]
            : ["min_structure", "min_direct"];

        const hasAnyValue = fieldsForTransition.some(
          (f) => proposed[f] !== null && proposed[f] !== undefined && Number(proposed[f]) > 0
        );

        if (!hasAnyValue) {
          if (existing) {
            const { error } = await supabase
              .from("promotion_rules")
              .delete()
              .eq("id", existing.id);
            if (error) throw error;
          }
          continue;
        }

        const payload: any = {
          org_unit_id: orgUnit.id,
          transition: t,
          min_bj: t === "ziskatel_to_garant" ? proposed.min_bj ?? null : null,
          min_structure: proposed.min_structure ?? null,
          min_direct: t === "ziskatel_to_garant" ? null : proposed.min_direct ?? null,
        };

        const { error } = await supabase
          .from("promotion_rules")
          .upsert(payload, { onConflict: "org_unit_id,transition" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Změny uloženy");
      qc.invalidateQueries({ queryKey: ["org_units"] });
      qc.invalidateQueries({ queryKey: ["custom_rules", orgUnit.id] });
      qc.invalidateQueries({ queryKey: ["effective_rules", orgUnit.id] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba ukládání"),
  });

  const deleteWorkspace = useMutation({
    mutationFn: async () => {
      // Detach members
      const { error: detachErr } = await supabase
        .from("profiles")
        .update({ org_unit_id: null })
        .eq("org_unit_id", orgUnit.id);
      if (detachErr) throw detachErr;

      // Delete custom rules
      await supabase.from("promotion_rules").delete().eq("org_unit_id", orgUnit.id);

      // Delete workspace
      const { error } = await supabase.from("org_units").delete().eq("id", orgUnit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workspace smazán");
      qc.invalidateQueries({ queryKey: ["org_units"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba mazání"),
  });

  const parentName = useMemo(() => {
    if (!orgUnit.parent_unit_id) return "Globální nastavení";
    return otherUnits?.find((u) => u.id === orgUnit.parent_unit_id)?.name ?? "Globální nastavení";
  }, [orgUnit.parent_unit_id, otherUnits]);

  const renderRuleBlock = (t: Transition) => {
    const existing = customByTransition.get(t);
    const effective = effectiveByTransition.get(t);
    const edits = ruleEdits[t];
    const isCustom = !!existing;
    const borderColor = isCustom ? "#00abbd" : "hsl(var(--border))";
    const valueColor = isCustom ? "#00abbd" : "hsl(var(--foreground))";

    const getVal = (field: keyof RuleFields): string => {
      if (edits[field] !== undefined) return edits[field] === null ? "" : String(edits[field]);
      if (existing?.[field] != null) return String(existing[field]);
      if (effective?.[field] != null) return String(effective[field]);
      return "";
    };

    const setVal = (field: keyof RuleFields, v: string) => {
      const num = v === "" ? null : Number(v);
      setRuleEdits((prev) => ({ ...prev, [t]: { ...prev[t], [field]: num } }));
    };

    return (
      <div
        key={t}
        className="rounded-xl p-4 space-y-3"
        style={{ border: `1.5px solid ${borderColor}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: isCustom ? "#00abbd" : "#9ca3af" }}
          />
          <h4 className="font-heading font-semibold text-sm text-foreground">
            {TRANSITION_LABELS[t]}
          </h4>
        </div>

        <div className="space-y-2">
          {t === "ziskatel_to_garant" ? (
            <>
              <div>
                <Label className="text-xs">Min. BJ</Label>
                <Input
                  type="number"
                  value={getVal("min_bj")}
                  onChange={(e) => setVal("min_bj", e.target.value)}
                  style={{ color: valueColor, borderColor }}
                />
              </div>
              <div>
                <Label className="text-xs">Min. struktura</Label>
                <Input
                  type="number"
                  value={getVal("min_structure")}
                  onChange={(e) => setVal("min_structure", e.target.value)}
                  style={{ color: valueColor, borderColor }}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs">Min. struktura</Label>
                <Input
                  type="number"
                  value={getVal("min_structure")}
                  onChange={(e) => setVal("min_structure", e.target.value)}
                  style={{ color: valueColor, borderColor }}
                />
              </div>
              <div>
                <Label className="text-xs">Min. přímých</Label>
                <Input
                  type="number"
                  value={getVal("min_direct")}
                  onChange={(e) => setVal("min_direct", e.target.value)}
                  style={{ color: valueColor, borderColor }}
                />
              </div>
            </>
          )}
        </div>

        {!isCustom && (
          <p className="text-[11px] text-muted-foreground">↑ dědí z globálního</p>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="legatus-modal-glass max-w-3xl p-0 gap-0 overflow-hidden shadow-2xl border-0"
          style={{ borderRadius: 28 }}
        >
          {/* Header */}
          <div
            className="px-6 py-5 flex items-start justify-between text-white"
            style={{ background: "#00555f" }}
          >
            <div>
              <h2 className="font-heading font-bold text-xl">{orgUnit.name}</h2>
              <p className="text-sm opacity-80 mt-0.5">
                Workspace · Dědí z: {parentName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Zavřít"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
            {/* Basic info */}
            <section className="space-y-3">
              <h3 className="font-heading font-semibold text-foreground">Základní údaje</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Název workspace</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Nadřazený workspace</Label>
                  <Select
                    value={parentId ?? "__global__"}
                    onValueChange={(v) => setParentId(v === "__global__" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__global__">Globální</SelectItem>
                      {(otherUnits ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Invite link */}
            <section className="space-y-3">
              <h3 className="font-heading font-semibold text-foreground">Pozvánkový odkaz</h3>
              <WorkspaceInviteLinkCard orgUnitId={orgUnit.id} canRotate variant="admin" />
            </section>

            {/* Members */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold text-foreground">
                  Členové workspace{" "}
                  <span className="text-muted-foreground font-normal text-sm">
                    · {members?.length ?? 0}
                  </span>
                </h3>
                <Popover open={addPickerOpen} onOpenChange={setAddPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      className="rounded-full bg-[#00abbd] hover:bg-[#00abbd]/90 text-white"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Přidat
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-72" align="end">
                    <Command>
                      <CommandInput placeholder="Hledat…" />
                      <CommandList>
                        <CommandEmpty>Žádní volní členové</CommandEmpty>
                        <CommandGroup>
                          {(availableMembers ?? []).map((m) => (
                            <CommandItem
                              key={m.id}
                              onSelect={() => addMember.mutate(m.id)}
                              className="flex items-center justify-between"
                            >
                              <span>{m.full_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {ROLE_LABELS[m.role] ?? m.role}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                {(members ?? []).map((m: any) => {
                  const isOwner = m.id === orgUnit.owner_id;
                  const color = ROLE_COLORS[m.role] ?? "#94a3b8";
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                          style={{ background: color }}
                        >
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm flex items-center gap-1.5">
                            {m.full_name}
                            {isOwner && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ROLE_LABELS[m.role] ?? m.role}
                            {isOwner && " · zakladatel workspace"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: color, color }}
                          className="text-[11px]"
                        >
                          {isOwner ? "zakladatel" : ROLE_LABELS[m.role] ?? m.role}
                        </Badge>
                        {!isOwner && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMember.mutate(m.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(members?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground italic">Žádní členové</p>
                )}
              </div>
            </section>

            {/* Promotion rules */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold text-foreground">Pravidla povýšení</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#00abbd" }} />
                    vlastní
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                    dědí
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {renderRuleBlock("ziskatel_to_garant")}
                {renderRuleBlock("garant_to_bv")}
                {renderRuleBlock("bv_to_vedouci")}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-background/50">
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Smazat workspace
            </Button>
            <Button
              onClick={() => saveAll.mutate()}
              disabled={saveAll.isPending}
              className="bg-[#fc7c71] hover:bg-[#fc7c71]/90 text-white"
            >
              {saveAll.isPending ? "Ukládání…" : "Uložit změny"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat workspace „{orgUnit.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Všichni členové budou odpojeni a vlastní pravidla povýšení smazána. Tuto akci nelze vrátit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWorkspace.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
