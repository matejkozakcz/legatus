import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MemberDetailModal } from "./MemberDetailModal";
import { Plus } from "lucide-react";

interface ProfileNode {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
}

interface OrgChartProps {
  currentUserId: string;
}

const roleBadgeConfig: Record<string, { label: string }> = {
  vedouci: { label: "Vedoucí" },
  garant: { label: "Garant" },
  novacek: { label: "Nováček" },
};

const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

const statusDotColor: Record<string, { bg: string; glow: string }> = {
  vedouci: { bg: "#45AABD", glow: "rgba(69, 170, 189, 0.25)" },
  garant: { bg: "#3FC55D", glow: "rgba(63, 197, 93, 0.25)" },
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
      className="relative flex flex-col items-center cursor-pointer transition-shadow hover:shadow-md flex-shrink-0"
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
      <div
        className="absolute"
        style={{
          top: 12, left: 12, width: 7, height: 7,
          borderRadius: "50%", background: dot.bg,
          boxShadow: `0 0 0 4px ${dot.glow}`,
        }}
      />
      <div style={{ marginTop: 5 }}>
        {node.avatar_url ? (
          <img
            src={node.avatar_url}
            alt={node.full_name}
            className="rounded-full object-cover"
            style={{ width: 56, height: 56, border: "2px solid white", boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }}
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center"
            style={{ width: 56, height: 56, background: colors.bg, color: colors.color, border: "2px solid white", boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }}
          >
            <span className="font-heading font-semibold" style={{ fontSize: 18 }}>{initials}</span>
          </div>
        )}
      </div>
      <p className="font-heading font-semibold text-center leading-tight" style={{ fontSize: 13, color: "#0A2126", marginTop: 8, paddingInline: 8 }}>
        {node.full_name}
      </p>
      <p className="font-body text-center" style={{ fontSize: 11, color: "#89ADB4", marginTop: 2 }}>
        {roleBadgeConfig[node.role]?.label || node.role}
      </p>
    </div>
  );
}

function ExpandButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center justify-center rounded-full transition-all hover:scale-110"
      style={{
        width: 36, height: 36,
        background: "#E1E9EB",
        border: "1px solid #c8d8dc",
        cursor: "pointer",
      }}
      title={`Zobrazit ${count} podřízených`}
    >
      <Plus className="h-4 w-4" style={{ color: "#00555f" }} />
    </button>
  );
}

function Connector() {
  return (
    <svg width="2" height="24" className="mx-auto flex-shrink-0">
      <line x1="1" y1="0" x2="1" y2="24" stroke="#c8d8dc" strokeWidth="1.5" />
    </svg>
  );
}

function TreeNode({
  node,
  childrenMap,
  expandedIds,
  toggleExpand,
  onSelect,
}: {
  node: ProfileNode;
  childrenMap: Map<string, ProfileNode[]>;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (node: ProfileNode) => void;
}) {
  const children = childrenMap.get(node.id) || [];
  const isExpanded = expandedIds.has(node.id);

  return (
    <div className="flex flex-col items-center gap-2">
      <NodeCard node={node} onClick={() => onSelect(node)} />
      {children.length > 0 && (
        <>
          <Connector />
          {isExpanded ? (
            <div className="flex gap-6 flex-wrap justify-center">
              {children.map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  childrenMap={childrenMap}
                  expandedIds={expandedIds}
                  toggleExpand={toggleExpand}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <ExpandButton count={children.length} onClick={() => toggleExpand(node.id)} />
          )}
        </>
      )}
    </div>
  );
}

export function OrgChart({ currentUserId }: OrgChartProps) {
  const { profile } = useAuth();
  const [selectedMember, setSelectedMember] = useState<ProfileNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["team_profiles", currentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url, vedouci_id, garant_id, ziskatel_id")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as ProfileNode[];
    },
    enabled: !!currentUserId,
  });

  // Build children map based on ziskatel_id (who acquired whom)
  const childrenMap = useMemo(() => {
    const map = new Map<string, ProfileNode[]>();
    profiles.forEach((p) => {
      if (p.ziskatel_id) {
        const siblings = map.get(p.ziskatel_id) || [];
        siblings.push(p);
        map.set(p.ziskatel_id, siblings);
      }
    });
    return map;
  }, [profiles]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <p className="font-body text-[13px]" style={{ color: "#8aadb3" }}>Načítání struktury...</p>
      </div>
    );
  }

  if (!profile) return null;

  const currentUser = profiles.find((p) => p.id === currentUserId);
  if (!currentUser) {
    return (
      <p className="font-body text-[13px]" style={{ color: "#8aadb3" }}>Žádná struktura k zobrazení.</p>
    );
  }

  // Find root: walk up ziskatel_id chain from current user
  let rootNode = currentUser;
  const visited = new Set<string>();
  while (rootNode.ziskatel_id && !visited.has(rootNode.id)) {
    visited.add(rootNode.id);
    const parent = profiles.find((p) => p.id === rootNode.ziskatel_id);
    if (parent) rootNode = parent;
    else break;
  }

  return (
    <>
      <div
        className="overflow-auto"
        style={{ maxHeight: 520 }}
      >
        <div className="flex flex-col items-center gap-2 py-4 px-4 min-w-fit">
          <TreeNode
            node={rootNode}
            childrenMap={childrenMap}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            onSelect={setSelectedMember}
          />
        </div>
      </div>

      {selectedMember && (
        <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </>
  );
}
