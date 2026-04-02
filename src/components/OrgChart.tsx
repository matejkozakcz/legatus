import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ProfileNode {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  vedouci_id: string | null;
  garant_id: string | null;
}

interface OrgChartProps {
  currentUserId: string;
}

const roleBadge: Record<string, { label: string; color: string }> = {
  vedouci: { label: "Vedoucí", color: "bg-legatus-deep-teal" },
  garant: { label: "Garant", color: "bg-legatus-teal" },
  novacek: { label: "Nováček", color: "bg-muted text-foreground" },
};

function NodeCard({ node }: { node: ProfileNode }) {
  const initials = node.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const badge = roleBadge[node.role] || roleBadge.novacek;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {node.avatar_url ? (
        <img src={node.avatar_url} alt={node.full_name} className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-border flex items-center justify-center">
          <span className="text-sm font-heading font-semibold text-foreground">{initials}</span>
        </div>
      )}
      <p className="text-sm font-body font-medium text-foreground text-center">{node.full_name}</p>
      <span className={`px-2 py-0.5 text-[10px] font-heading font-semibold rounded-pill text-white ${badge.color}`}>
        {badge.label}
      </span>
    </div>
  );
}

export function OrgChart({ currentUserId }: OrgChartProps) {
  const { profile } = useAuth();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["team_profiles", currentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url, vedouci_id, garant_id")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as ProfileNode[];
    },
    enabled: !!currentUserId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-pulse text-muted-foreground font-body">Načítání struktury...</div>
      </div>
    );
  }

  if (!profile) return null;

  // Build tree based on role
  const currentUser = profiles.find((p) => p.id === currentUserId);
  if (!currentUser) return <p className="text-muted-foreground font-body text-sm">Žádná struktura.</p>;

  // For Vedoucí: show self at root, Garanté below, their Nováčci as leaves
  // For Garant: show their Vedoucí at root, self below, their Nováčci as leaves
  // For Nováček: show their chain

  let rootNode: ProfileNode = currentUser;
  let garantNodes: ProfileNode[] = [];
  let novacekMap: Map<string, ProfileNode[]> = new Map();

  if (profile.role === "vedouci") {
    rootNode = currentUser;
    garantNodes = profiles.filter((p) => p.role === "garant" && p.vedouci_id === currentUser.id);
    garantNodes.forEach((g) => {
      novacekMap.set(g.id, profiles.filter((p) => p.role === "novacek" && p.garant_id === g.id));
    });
  } else if (profile.role === "garant") {
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    rootNode = vedouci || currentUser;
    garantNodes = [currentUser];
    novacekMap.set(
      currentUser.id,
      profiles.filter((p) => p.role === "novacek" && p.garant_id === currentUser.id)
    );
  } else {
    // Nováček: show chain
    const garant = profiles.find((p) => p.id === currentUser.garant_id);
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    return (
      <div className="flex flex-col items-center gap-6">
        {vedouci && (
          <>
            <NodeCard node={vedouci} />
            <div className="w-px h-6 bg-border" />
          </>
        )}
        {garant && (
          <>
            <NodeCard node={garant} />
            <div className="w-px h-6 bg-border" />
          </>
        )}
        <NodeCard node={currentUser} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 overflow-x-auto">
      {/* Root */}
      <NodeCard node={rootNode} />

      {garantNodes.length > 0 && (
        <>
          <div className="w-px h-6 bg-border" />
          {/* Garanté level */}
          <div className="flex gap-8 flex-wrap justify-center">
            {garantNodes.map((garant) => {
              const novacci = novacekMap.get(garant.id) || [];
              return (
                <div key={garant.id} className="flex flex-col items-center gap-4">
                  <NodeCard node={garant} />
                  {novacci.length > 0 && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <div className="flex gap-4 flex-wrap justify-center">
                        {novacci.map((n) => (
                          <NodeCard key={n.id} node={n} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
