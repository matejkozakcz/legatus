import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Check, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProfile = profiles.find((p) => p.id === userId);

  const sortedProfiles = useMemo(
    () => profiles.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedProfiles;
    return sortedProfiles.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [sortedProfiles, search]);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  useEffect(() => {
    if (pickerOpen) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [pickerOpen]);

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
          <div ref={wrapperRef} className="relative">
            <Label>Uživatel *</Label>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm flex items-center justify-between hover:border-ring transition-colors"
            >
              <span className={selectedProfile ? "" : "text-muted-foreground"}>
                {selectedProfile?.full_name || "Vyberte uživatele…"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>

            {pickerOpen && (
              <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Hledat…"
                    className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setPickerOpen(false);
                        setSearch("");
                      }
                    }}
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                      Nenalezeno
                    </div>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setUserId(p.id);
                          setPickerOpen(false);
                          setSearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center ${
                          userId === p.id ? "bg-accent/50 font-medium" : ""
                        }`}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${userId === p.id ? "opacity-100" : "opacity-0"}`}
                        />
                        {p.full_name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
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
