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

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

// Auto-assign avatar color variant based on role
const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

function NodeCard({ node, isRoot = false }: { node: ProfileNode; isRoot?: boolean }) {
  const initials = node.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const badge = roleBadgeConfig[node.role] || roleBadgeConfig.novacek;
  const colors = avatarColors[node.role] || avatarColors.novacek;
  const size = isRoot ? 56 : 48;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {node.avatar_url ? (
        <img
          src={node.avatar_url}
          alt={node.full_name}
          className="rounded-full object-cover"
          style={{
            width: size,
            height: size,
            boxShadow: isRoot ? "0 4px 16px rgba(0,85,95,0.15)" : undefined,
          }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: size,
            height: size,
            background: colors.bg,
            color: colors.color,
            boxShadow: isRoot ? "0 4px 16px rgba(0,85,95,0.15)" : undefined,
          }}
        >
          <span className="font-heading font-semibold" style={{ fontSize: isRoot ? 18 : 16 }}>
            {initials}
          </span>
        </div>
      )}
      <p className="font-heading text-[13px] font-semibold text-center" style={{ color: "#0c2226" }}>
        {node.full_name}
      </p>
      <span className={badge.className}>{badge.label}</span>
    </div>
  );
}

function Connector({ vertical = true }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <svg width="2" height="24" className="mx-auto">
        <line x1="1" y1="0" x2="1" y2="24" stroke="#c8d8dc" strokeWidth="1.5" />
      </svg>
    );
  }
  return null;
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
        <p className="font-body text-[13px]" style={{ color: "#8aadb3" }}>
          Načítání struktury...
        </p>
      </div>
    );
  }

  if (!profile) return null;

  const currentUser = profiles.find((p) => p.id === currentUserId);
  if (!currentUser) {
    return (
      <p className="font-body text-[13px]" style={{ color: "#8aadb3" }}>
        Žádná struktura k zobrazení.
      </p>
    );
  }

  let rootNode: ProfileNode = currentUser;
  let garantNodes: ProfileNode[] = [];
  let novacekMap: Map<string, ProfileNode[]> = new Map();
  let directNovacci: ProfileNode[] = [];

  if (profile.role === "vedouci") {
    rootNode = currentUser;
    garantNodes = profiles.filter((p) => p.role === "garant" && p.vedouci_id === currentUser.id);
    // Nováčci under each garant
    garantNodes.forEach((g) => {
      novacekMap.set(g.id, profiles.filter((p) => p.role === "novacek" && p.garant_id === g.id));
    });
    // Nováčci directly under vedoucí (garant_id = vedouci_id, or no garant among garanti)
    directNovacci = profiles.filter(
      (p) => p.role === "novacek" && p.vedouci_id === currentUser.id && 
      (p.garant_id === currentUser.id || !garantNodes.some((g) => g.id === p.garant_id))
    );
  } else if (profile.role === "garant") {
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    rootNode = vedouci || currentUser;
    garantNodes = [currentUser];
    novacekMap.set(
      currentUser.id,
      profiles.filter((p) => p.role === "novacek" && p.garant_id === currentUser.id)
    );
  } else {
    const garant = profiles.find((p) => p.id === currentUser.garant_id);
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    return (
      <div className="flex flex-col items-center gap-2">
        {vedouci && (
          <>
            <NodeCard node={vedouci} isRoot />
            <Connector />
          </>
        )}
        {garant && (
          <>
            <NodeCard node={garant} />
            <Connector />
          </>
        )}
        <NodeCard node={currentUser} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 overflow-x-auto">
      <NodeCard node={rootNode} isRoot />

      {garantNodes.length > 0 && (
        <>
          <Connector />
          <div className="flex gap-10 flex-wrap justify-center">
            {garantNodes.map((garant) => {
              const novacci = novacekMap.get(garant.id) || [];
              return (
                <div key={garant.id} className="flex flex-col items-center gap-2">
                  <NodeCard node={garant} />
                  {novacci.length > 0 && (
                    <>
                      <Connector />
                      <div className="flex gap-6 flex-wrap justify-center">
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
      {directNovacci.length > 0 && (
        <>
          {garantNodes.length === 0 && <Connector />}
          <div className="flex gap-6 flex-wrap justify-center mt-2">
            {directNovacci.map((n) => (
              <NodeCard key={n.id} node={n} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
