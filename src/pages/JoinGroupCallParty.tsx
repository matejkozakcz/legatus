import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Users, ArrowRight } from "lucide-react";

export default function JoinGroupCallParty() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [party, setParty] = useState<{ id: string; name: string; status: string; allow_external: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Fetch public party info
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase
        .from("group_call_parties")
        .select("id, name, status, allow_external")
        .eq("join_token", token)
        .maybeSingle();
      if (error || !data) {
        setError("Tato party neexistuje nebo byl odkaz zneplatněn.");
        return;
      }
      setParty(data);
    })();
  }, [token]);

  const handleJoin = async () => {
    if (!token) return;
    setJoining(true);
    const { data, error } = await supabase.functions.invoke("group-call-party-action", {
      body: { action: "join_via_link", token },
    });
    setJoining(false);
    if (error || data?.error) {
      setError(data?.error || error?.message || "Chyba připojení");
      return;
    }
    nav(`/call-party?party=${data.party_id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#00abbd" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg, #f5f9fa)" }}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mx-auto" style={{ background: "rgba(0,171,189,0.1)" }}>
          <Users className="h-7 w-7" style={{ color: "#00abbd" }} />
        </div>
        <h1 className="font-heading font-bold text-2xl" style={{ color: "var(--text-primary, #00555f)" }}>
          {party ? "Pozvánka na Call Party" : "Načítání…"}
        </h1>

        {error && <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>}

        {party && !error && (
          <>
            <div>
              <p className="text-lg font-semibold">{party.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {party.status === "live" ? "🔴 Právě běží" : party.status === "scheduled" ? "📅 Naplánováno" : "Ukončeno"}
              </p>
            </div>

            {!user ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Pro připojení se nejdřív přihlas.</p>
                <Link to={`/login?redirect=${encodeURIComponent(`/call-party/join/${token}`)}`}>
                  <Button className="w-full" style={{ background: "#fc7c71", color: "#fff" }}>
                    Přihlásit se a připojit
                  </Button>
                </Link>
              </div>
            ) : party.status === "ended" ? (
              <Button onClick={() => nav("/call-party")} variant="outline" className="w-full">
                Tato party už skončila
              </Button>
            ) : (
              <Button
                onClick={handleJoin}
                disabled={joining}
                className="w-full gap-1.5"
                style={{ background: "#fc7c71", color: "#fff" }}
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Připojit se <ArrowRight className="h-4 w-4" /></>}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
