import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MemberDetailModal } from "./MemberDetailModal";

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

const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

// Status dot color per role (maps to SVG spec: green=garant, teal=vedouci, orange=novacek)
const statusDotColor: Record<string, { bg: string; glow: string }> = {
  vedouci: { bg: "#45AABD", glow: "rgba(69, 170, 189, 0.25)" },
  garant:  { bg: "#3FC55D", glow: "rgba(63, 197, 93, 0.25)" },
  novacek: { bg: "#F39E0A", glow: "rgba(243, 158, 10, 0.25)" },
};

function NodeCard({ node, onClick }: { node: ProfileNode; onClick?: () => void }) {
  const initials = node.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = avatarColors[node.role] || avatarColors.novacek;
  const dot = statusDotColor[node.role] || { bg: "#89ADB4", glow: "rgba(137,173,180,0.25)" };

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
      style={{
        width: 160,
        minHeight: 105,
        background: "#F6F8F9",
        border: "1px solid #E1E9EB",
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        paddingTop: 10,
        paddingBottom: 14,
      }}
    >
      {/* Status dot — top-left per Figma SVG spec */}
      <div
        className="absolute"
        style={{
          top: 12,
          left: 12,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dot.bg,
          boxShadow: `0 0 0 4px ${dot.glow}`,
        }}
      />

      {/* Avatar */}
      <div style={{ marginTop: 5 }}>
        {node.avatar_url ? (
          <img
            src={node.avatar_url}
            alt={node.full_name}
            className="rounded-full object-cover"
            style={{
              width: 56,
              height: 56,
              border: "2px solid white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
            }}
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: colors.bg,
              color: colors.color,
              border: "2px solid white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
            }}
          >
            <span className="font-heading font-semibold" style={{ fontSize: 18 }}>
              {initials}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <p
        className="font-heading font-semibold text-center leading-tight"
        style={{ fontSize: 13, color: "#0A2126", marginTop: 8, paddingInline: 8 }}
      >
        {node.full_name}
      </p>

      {/* Role */}
      <p
        className="font-body text-center"
        style={{ fontSize: 11, color: "#89ADB4", marginTop: 2 }}
      >
        {roleBadgeConfig[node.role]?.label || node.role}
      </p>
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
  const [selectedMember, setSelectedMember] = useState<ProfileNode | null>(null);

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
  // All direct reports at second level: garanti + vedoucí who belong to this team
  let secondLevelNodes: ProfileNode[] = [];
  let novacekMap: Map<string, ProfileNode[]> = new Map();
  let directNovacci: ProfileNode[] = [];

  if (profile.role === "vedouci") {
    rootNode = currentUser;
    const garantNodes = profiles.filter((p) => p.role === "garant" && p.vedouci_id === currentUser.id);
    // Also include vedoucí members promoted from within this team (different from currentUser)
    const vedouciMembers = profiles.filter(
      (p) => p.role === "vedouci" && p.vedouci_id === currentUser.id && p.id !== currentUser.id
    );
    // Direct nováčci whose garant is the vedoucí himself (no separate garant)
    directNovacci = profiles.filter(
      (p) =>
        p.role === "novacek" &&
        p.vedouci_id === currentUser.id &&
        (p.garant_id === currentUser.id || !garantNodes.some((g) => g.id === p.garant_id))
    );
    // All direct reports at the same level: garanti, promoted vedoucí, and direct nováčci
    secondLevelNodes = [...garantNodes, ...vedouciMembers, ...directNovacci].filter(
      (n) => n.id !== rootNode.id
    );

    garantNodes.forEach((g) => {
      novacekMap.set(g.id, profiles.filter((p) => p.role === "novacek" && p.garant_id === g.id));
    });
  } else if (profile.role === "garant") {
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    if (vedouci && vedouci.id !== currentUser.id) {
      rootNode = vedouci;
      secondLevelNodes = [currentUser];
    } else {
      rootNode = currentUser;
      secondLevelNodes = [];
    }
    const myNovacci = profiles.filter((p) => p.role === "novacek" && p.garant_id === currentUser.id);
    if (myNovacci.length > 0) {
      novacekMap.set(currentUser.id, myNovacci);
    }
  } else {
    // Nováček view: show chain upwards
    const garant = profiles.find((p) => p.id === currentUser.garant_id);
    const vedouci = profiles.find((p) => p.id === currentUser.vedouci_id);
    return (
      <>
        <div className="flex flex-col items-center gap-2">
          {vedouci && (
            <>
              <NodeCard node={vedouci} onClick={() => setSelectedMember(vedouci)} />
              <Connector />
            </>
          )}
          {garant && (
            <>
              <NodeCard node={garant} onClick={() => setSelectedMember(garant)} />
              <Connector />
            </>
          )}
          <NodeCard node={currentUser} onClick={() => setSelectedMember(currentUser)} />
        </div>
        {selectedMember && (
          <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 overflow-x-auto py-2">
        <NodeCard node={rootNode} onClick={() => setSelectedMember(rootNode)} />

        {secondLevelNodes.length > 0 && (
          <>
            <Connector />
            <div className="flex gap-6 flex-wrap justify-center">
              {secondLevelNodes.map((node) => {
                const novacci = novacekMap.get(node.id) || [];
                return (
                  <div key={node.id} className="flex flex-col items-center gap-2">
                    <NodeCard node={node} onClick={() => setSelectedMember(node)} />
                    {novacci.length > 0 && (
                      <>
                        <Connector />
                        <div className="flex gap-6 flex-wrap justify-center">
                          {novacci.map((n) => (
                            <NodeCard key={n.id} node={n} onClick={() => setSelectedMember(n)} />
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

      {selectedMember && (
        <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </>
  );
}
