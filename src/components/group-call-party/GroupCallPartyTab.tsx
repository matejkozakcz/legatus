import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyGroupParties, type GroupParty } from "@/hooks/useGroupParty";
import { Button } from "@/components/ui/button";
import { Plus, Users, Calendar, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { GroupCallPartyCreateModal } from "./GroupCallPartyCreateModal";
import { GroupCallPartyRoom } from "./GroupCallPartyRoom";

export function GroupCallPartyTab() {
  const { profile } = useAuth();
  const { data: parties = [], isLoading } = useMyGroupParties(profile?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);

  if (openPartyId) {
    return <GroupCallPartyRoom partyId={openPartyId} onClose={() => setOpenPartyId(null)} />;
  }

  const live = parties.filter((p) => p.status === "live");
  const scheduled = parties.filter((p) => p.status === "scheduled");
  const ended = parties.filter((p) => p.status === "ended");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Společné call party — pozvi tým, soutěžte v žebříčku, plňte cíle.
        </p>
        <Button
          onClick={() => setCreateOpen(true)}
          style={{ background: "#fc7c71", color: "#fff" }}
          className="gap-1.5 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nová Skupinová Call Party
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00abbd" }} />
        </div>
      ) : parties.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="space-y-5">
          {live.length > 0 && <Section title="🔴 Právě běží" parties={live} onOpen={setOpenPartyId} />}
          {scheduled.length > 0 && <Section title="📅 Naplánované" parties={scheduled} onOpen={setOpenPartyId} />}
          {ended.length > 0 && <Section title="Ukončené" parties={ended.slice(0, 10)} onOpen={setOpenPartyId} />}
        </div>
      )}

      {createOpen && (
        <GroupCallPartyCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenPartyId(id);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, parties, onOpen }: { title: string; parties: GroupParty[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <h3 className="font-heading font-semibold text-sm mb-2" style={{ color: "var(--text-primary, #00555f)" }}>{title}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {parties.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="text-left p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-heading font-semibold text-sm flex-1" style={{ color: "var(--text-primary, #00555f)" }}>
                {p.name}
              </h4>
              <StatusBadge status={p.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {p.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(p.scheduled_at), "d. M. HH:mm", { locale: cs })}
                </span>
              )}
              {p.planned_duration_min && <span>· {p.planned_duration_min} min</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: GroupParty["status"] }) {
  const cfg = {
    live: { bg: "#22c55e", label: "LIVE" },
    scheduled: { bg: "#f59e0b", label: "Naplánováno" },
    ended: { bg: "#94a3b8", label: "Ukončeno" },
  }[status];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: "#fff" }}>
      {cfg.label}
    </span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16 rounded-xl border border-dashed border-border">
      <Users className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "#00abbd" }} />
      <h3 className="font-heading font-semibold text-base mb-1">Žádné skupinové party</h3>
      <p className="text-sm text-muted-foreground mb-4">Začni první společnou call party a vyzvi svůj tým.</p>
      <Button onClick={onCreate} style={{ background: "#fc7c71", color: "#fff" }} className="gap-1.5">
        <Plus className="h-4 w-4" /> Vytvořit
      </Button>
    </div>
  );
}
