import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Search, User, Briefcase, Calendar, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface SearchResult {
  type: "person" | "case" | "meeting";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export default function Hledani() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const navigate = useNavigate();
  const { profile } = useAuth();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["global-search", query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const q = query.toLowerCase();
      const allResults: SearchResult[] = [];

      // Search profiles by name or email
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .ilike("full_name", `%${q}%`)
        .limit(20);

      // Also search by email via auth — use a second query on profiles matching osobni_id as fallback
      // Since we can't query auth.users, search osobni_id field which may contain email-like identifiers
      let emailProfiles: typeof profiles = [];
      if (q.includes("@") || q.includes(".")) {
        const { data: byEmail } = await supabase
          .from("profiles")
          .select("id, full_name, role")
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

      const addProfile = (p: { id: string; full_name: string; role: string }) => {
        if (seenIds.has(p.id)) return;
        seenIds.add(p.id);
        allResults.push({
          type: "person",
          id: p.id,
          title: p.full_name,
          subtitle: roleLabels[p.role] || p.role,
          url: `/tym/${p.id}/aktivity`,
        });
      };

      profiles?.forEach(addProfile);
      emailProfiles?.forEach(addProfile);

      // Search cases
      const { data: cases } = await supabase
        .from("cases")
        .select("id, nazev_pripadu, status, user_id")
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
          })
        );
      }

      // Search meetings by case_name or poznamka
      const { data: meetings } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_type, case_name, poznamka, user_id")
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
          })
        );
      }

      return allResults;
    },
    enabled: query.length >= 2,
  });

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
    case: "Byznys případy",
    meeting: "Schůzky",
  };

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <Search className="h-6 w-6 text-foreground" />
        <h1 className="font-heading font-bold text-[28px] text-foreground">
          Výsledky hledání
        </h1>
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
        <p className="text-muted-foreground text-sm font-body text-center py-12">
          Žádné výsledky pro „{query}".
        </p>
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
                      onClick={() => navigate(item.url)}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-accent/10 transition-colors flex items-center gap-3 group bg-card/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="font-body text-xs text-muted-foreground truncate mt-0.5">
                            {item.subtitle}
                          </p>
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
    </div>
  );
}
