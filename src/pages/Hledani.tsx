import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Search, User, Briefcase, Calendar, ArrowLeft, X } from "lucide-react";
import { format } from "date-fns";
import { MemberDetailModal } from "@/components/MemberDetailModal";
import { MeetingDetailModal, type MeetingDetailData } from "@/components/MeetingDetailModal";
import { toast } from "sonner";

interface SearchResult {
  type: "person" | "case" | "meeting";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  raw?: any;
}

export default function Hledani() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Modal states
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    full_name: string;
    role: string;
    avatar_url: string | null;
  } | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetailData | null>(null);
  const [selectedCase, setSelectedCase] = useState<{
    id: string;
    nazev_pripadu: string;
    status: string;
    poznamka: string | null;
  } | null>(null);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["global-search", query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const q = query.toLowerCase();
      const allResults: SearchResult[] = [];

      // Search profiles by name
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url")
        .eq("is_active", true)
        .ilike("full_name", `%${q}%`)
        .limit(20);

      // Also search by osobni_id for email-like queries
      let emailProfiles: typeof profiles = [];
      if (q.includes("@") || q.includes(".")) {
        const { data: byEmail } = await supabase
          .from("profiles")
          .select("id, full_name, role, avatar_url")
          .eq("is_active", true)
          .ilike("osobni_id", `%${q}%`)
          .limit(20);
        emailProfiles = byEmail || [];
      }

      const seenIds = new Set<string>();
      const roleLabels: Record<string, string> = {
        vedouci: "Vedoucí",
        budouci_vedouci: "Budoucí vedoucí",
        garant: "Garant",
        ziskatel: "Získatel",
        novacek: "Nováček",
      };

      const addProfile = (p: { id: string; full_name: string; role: string; avatar_url: string | null }) => {
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        allResults.push({
          type: "person",
          id: p.id,
          title: p.full_name,
          subtitle: roleLabels[p.role] || p.role,
          url: `/tym/${p.id}/aktivity`,
          raw: p,
        });
      };

      profiles?.forEach(addProfile);
      emailProfiles?.forEach(addProfile);

      // Search cases
      const { data: cases } = await supabase
        .from("cases")
        .select("id, nazev_pripadu, status, poznamka, user_id")
        .ilike("nazev_pripadu", `%${q}%`)
        .limit(20);

      if (cases) {
        cases.forEach((c) =>
          allResults.push({
            type: "case",
            id: c.id,
            title: c.nazev_pripadu,
            subtitle: c.status === "aktivni" ? "Aktivní" : c.status === "uzavreny" ? "Uzavřený" : c.status,
            url: "/obchodni-pripady",
            raw: c,
          }),
        );
      }

      // Search meetings by case_name or poznamka
      const { data: meetings } = await supabase
        .from("client_meetings")
        .select(
          "id, date, meeting_type, case_name, case_id, poznamka, user_id, meeting_time, duration_minutes, location_type, location_detail, cancelled, doporuceni_fsa, podepsane_bj, doporuceni_poradenstvi, pohovor_jde_dal, doporuceni_pohovor, outcome_recorded",
        )
        .or(`case_name.ilike.%${q}%,poznamka.ilike.%${q}%`)
        .order("date", { ascending: false })
        .limit(20);

      if (meetings) {
        const typeLabels: Record<string, string> = { FSA: "FSA", SER: "Servis", POH: "Pohovor" };
        meetings.forEach((m) =>
          allResults.push({
            type: "meeting",
            id: m.id,
            title: m.case_name || `${typeLabels[m.meeting_type] || m.meeting_type}`,
            subtitle: `${typeLabels[m.meeting_type] || m.meeting_type} · ${format(new Date(m.date), "d. M. yyyy")}`,
            url: "/kalendar",
            raw: m,
          }),
        );
      }

      return allResults;
    },
    enabled: query.length >= 2,
  });

  // Outcome mutation for meeting detail
  const outcomeMutation = useMutation({
    mutationFn: async ({ meetingId, data }: { meetingId: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from("client_meetings").update(data).eq("id", meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-search"] });
      toast.success("Výsledek uložen");
    },
    onError: (err: any) => toast.error(err.message || "Chyba"),
  });

  const handleResultClick = (item: SearchResult) => {
    if (item.type === "person" && item.raw) {
      setSelectedMember(item.raw);
    } else if (item.type === "meeting" && item.raw) {
      setSelectedMeeting(item.raw as MeetingDetailData);
    } else if (item.type === "case" && item.raw) {
      setSelectedCase(item.raw);
    } else {
      navigate(item.url);
    }
  };

  const grouped = {
    person: results.filter((r) => r.type === "person"),
    case: results.filter((r) => r.type === "case"),
    meeting: results.filter((r) => r.type === "meeting"),
  };

  const iconMap = {
    person: User,
    case: Briefcase,
    meeting: Calendar,
  };
  const sectionLabels = {
    person: "Lidé",
    case: "Můj byznys",
    meeting: "Schůzky",
  };

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <Search className="h-6 w-6 text-foreground" />
        <h1 className="font-heading font-bold text-[28px] text-foreground">Výsledky hledání</h1>
      </div>

      {/* Search input */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setSearchParams({ q: e.target.value })}
          placeholder="Hledat lidi, případy, schůzky…"
          autoFocus
          className="w-full h-12 pl-12 pr-4 rounded-2xl border border-border bg-card text-foreground font-body text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {query.length < 2 && (
        <p className="text-muted-foreground text-sm font-body text-center py-12">
          Zadejte alespoň 2 znaky pro vyhledávání.
        </p>
      )}

      {isLoading && query.length >= 2 && (
        <p className="text-muted-foreground text-sm font-body text-center py-12">Hledám…</p>
      )}

      {!isLoading && query.length >= 2 && results.length === 0 && (
        <p className="text-muted-foreground text-sm font-body text-center py-12">Žádné výsledky pro „{query}".</p>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-6">
          {(["person", "case", "meeting"] as const).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const Icon = iconMap[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    {sectionLabels[type]}
                  </h2>
                  <span className="text-xs text-muted-foreground font-body">({items.length})</span>
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleResultClick(item)}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-accent/10 transition-colors flex items-center gap-3 group bg-card/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-medium text-foreground truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="font-body text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                        )}
                      </div>
                      <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Member detail modal */}
      {selectedMember && <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />}

      {/* Meeting detail modal */}
      <MeetingDetailModal
        open={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
        onEdit={() => setSelectedMeeting(null)}
        onSaveOutcome={(meetingId, data) => outcomeMutation.mutate({ meetingId, data })}
        savingOutcome={outcomeMutation.isPending}
      />

      {/* Case detail modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedCase(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedCase(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <Briefcase className="h-5 w-5" style={{ color: "#00abbd" }} />
              <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {selectedCase.nazev_pripadu}
              </h2>
            </div>
            <div className="space-y-0">
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {selectedCase.status === "aktivni" ? "Aktivní" : "Uzavřený"}
                </span>
              </div>
              {selectedCase.poznamka && (
                <div className="flex justify-between py-1.5 border-b border-border">
                  <span className="text-xs text-muted-foreground">Poznámka</span>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {selectedCase.poznamka}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedCase(null);
                navigate("/obchodni-pripady");
              }}
              className="btn btn-primary btn-md w-full mt-4"
            >
              Zobrazit v Byznys případech
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
