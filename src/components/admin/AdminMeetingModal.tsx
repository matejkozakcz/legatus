import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Check, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

export interface MeetingRecord {
  id: string;
  user_id: string;
  date: string;
  meeting_type: string;
  case_name: string | null;
  podepsane_bj: number;
  potencial_bj: number | null;
  cancelled: boolean;
  poznamka: string | null;
  doporuceni_fsa: number;
  doporuceni_poradenstvi: number;
  doporuceni_pohovor: number;
  has_poradenstvi: boolean;
  has_pohovor: boolean;
}

interface ProfileLite {
  id: string;
  full_name: string;
  is_active?: boolean | null;
}

const MEETING_TYPES = [
  { value: "FSA", label: "FSA — Analýza" },
  { value: "POR", label: "POR — Poradenství" },
  { value: "SER", label: "SER — Servis" },
  { value: "POH", label: "POH — Pohovor" },
  { value: "INFO", label: "INFO" },
  { value: "POST", label: "POST — Postinfo" },
  { value: "NAB", label: "NAB — Nábor" },
];

export function AdminMeetingModal({
  meeting,
  profiles,
  onClose,
}: {
  meeting: MeetingRecord | null; // null = create
  profiles: ProfileLite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!meeting;

  const [userId, setUserId] = useState(meeting?.user_id || "");
  const [date, setDate] = useState(meeting?.date || format(new Date(), "yyyy-MM-dd"));
  const [meetingType, setMeetingType] = useState(meeting?.meeting_type || "FSA");
  const [caseName, setCaseName] = useState(meeting?.case_name || "");
  const [podepsane, setPodepsane] = useState(String(meeting?.podepsane_bj ?? "0"));
  const [potencial, setPotencial] = useState(String(meeting?.potencial_bj ?? ""));
  const [cancelled, setCancelled] = useState(meeting?.cancelled || false);
  const [poznamka, setPoznamka] = useState(meeting?.poznamka || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    if (pickerOpen) setTimeout(() => inputRef.current?.focus(), 30);
  }, [pickerOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Vyberte uživatele");
      if (!date) throw new Error("Vyberte datum");
      const podepsaneNum = Number(podepsane);
      if (isNaN(podepsaneNum) || podepsaneNum < 0) throw new Error("Neplatné podepsané BJ");
      const potencialNum = potencial.trim() === "" ? null : Number(potencial);
      if (potencialNum !== null && (isNaN(potencialNum) || potencialNum < 0))
        throw new Error("Neplatný potenciál BJ");

      const payload = {
        user_id: userId,
        date,
        meeting_type: meetingType,
        case_name: caseName.trim() || null,
        podepsane_bj: podepsaneNum,
        potencial_bj: potencialNum,
        cancelled,
        poznamka: poznamka.trim() || null,
      };

      if (isEdit && meeting) {
        const { error } = await supabase
          .from("client_meetings")
          .update(payload)
          .eq("id", meeting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meetings").insert({
          ...payload,
          week_start: date, // overwritten by trigger
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["transakce_meetings"] });
      toast.success(isEdit ? "Schůzka aktualizována" : "Schůzka přidána");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!meeting) return;
      const { error } = await supabase.from("client_meetings").delete().eq("id", meeting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_meetings"] });
      queryClient.invalidateQueries({ queryKey: ["transakce_meetings"] });
      toast.success("Schůzka smazána");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Upravit schůzku" : "Přidat schůzku"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Úprava admin záznamu schůzky. Změny ovlivní BJ daného uživatele."
              : "Vytvořte schůzku jménem libovolného uživatele."}
          </DialogDescription>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="m-date">Datum *</Label>
              <Input
                id="m-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Typ schůzky *</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="m-case">Název byznys případu</Label>
            <Input
              id="m-case"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder="Volitelné…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="m-bj">Podepsané BJ</Label>
              <Input
                id="m-bj"
                type="number"
                step="0.1"
                min="0"
                value={podepsane}
                onChange={(e) => setPodepsane(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="m-pot">Potenciál BJ</Label>
              <Input
                id="m-pot"
                type="number"
                step="0.1"
                min="0"
                value={potencial}
                onChange={(e) => setPotencial(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cancelled}
              onChange={(e) => setCancelled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Zrušená schůzka
          </label>

          <div>
            <Label htmlFor="m-note">Poznámka</Label>
            <Textarea
              id="m-note"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Volitelné…"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEdit && (
            <div className="mr-auto flex gap-2">
              {confirmDelete ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleteMutation.isPending}
                  >
                    Zrušit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Mažu…" : "Potvrdit smazání"}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Smazat
                </Button>
              )}
            </div>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
            Zrušit
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !userId || !date}
            style={{ background: "#fc7c71", color: "#fff" }}
            className="hover:opacity-90"
          >
            {saveMutation.isPending ? "Ukládám…" : isEdit ? "Uložit změny" : "Přidat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
