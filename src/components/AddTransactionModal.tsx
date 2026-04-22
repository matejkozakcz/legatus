import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface ProfileLite {
  id: string;
  full_name: string;
  is_active?: boolean | null;
}

export function AddTransactionModal({
  profiles,
  onClose,
}: {
  profiles: ProfileLite[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [bj, setBj] = useState<string>("");
  const [poznamka, setPoznamka] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === userId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Nepřihlášen");
      if (!userId) throw new Error("Vyberte uživatele");
      if (!date) throw new Error("Vyberte datum");
      const bjNum = Number(bj);
      if (isNaN(bjNum) || bjNum < 0) throw new Error("Neplatná hodnota BJ");

      const { data, error } = await supabase
        .from("manual_bj_adjustments")
        .insert({
          user_id: userId,
          date,
          bj: bjNum,
          poznamka: poznamka.trim() || null,
          created_by: user.id,
          week_start: date, // overwritten by trigger
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("bj_audit_log").insert({
        source: "manual",
        source_id: data.id,
        user_id: userId,
        old_bj: null,
        new_bj: bjNum,
        action: "create",
        changed_by: user.id,
        change_reason: poznamka.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transakce_manuals"] });
      toast.success("Záznam přidán");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat ruční BJ záznam</DialogTitle>
          <DialogDescription>Záznam se připíše uživateli k vybranému datu.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Uživatel *</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between mt-1 font-normal">
                  {selectedProfile?.full_name || "Vyberte uživatele…"}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Hledat…" />
                  <CommandList>
                    <CommandEmpty>Nenalezeno</CommandEmpty>
                    <CommandGroup>
                      {profiles
                        .slice()
                        .sort((a, b) => a.full_name.localeCompare(b.full_name))
                        .map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.full_name}
                            onSelect={() => {
                              setUserId(p.id);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${userId === p.id ? "opacity-100" : "opacity-0"}`}
                            />
                            {p.full_name}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="add-date">Datum *</Label>
            <Input
              id="add-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={format(new Date(), "yyyy-MM-dd")}
            />
          </div>

          <div>
            <Label htmlFor="add-bj">Hodnota BJ *</Label>
            <Input
              id="add-bj"
              type="number"
              step="0.1"
              min="0"
              value={bj}
              onChange={(e) => setBj(e.target.value)}
              placeholder="0.0"
            />
          </div>

          <div>
            <Label htmlFor="add-note">Poznámka</Label>
            <Textarea
              id="add-note"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Volitelné…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !userId || !date || !bj}
            style={{ background: "#fc7c71", color: "#fff" }}
            className="hover:opacity-90"
          >
            {mutation.isPending ? "Ukládám…" : "Přidat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
