import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { Plus, Minus, ZoomIn, ZoomOut, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

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
  /** When set, the tree focuses on this person (expands their line) */
  focusUserId?: string;
  /** Called when a clickable person is clicked (only BV/Vedoucí can click) */
  onPersonClick?: (userId: string, profile: ProfileNode) => void;
  /** The role of the logged-in user — controls who can click */
  viewerRole?: string;
  /** ISO date strings for the selected production period */
  periodStart?: string;
  periodEnd?: string;
}

const roleBadgeConfig: Record<string, { label: string }> = {
  vedouci: { label: "Vedoucí" },
  budouci_vedouci: { label: "Budoucí vedoucí" },
  garant: { label: "Garant" },
  ziskatel: { label: "Získatel" },
  novacek: { label: "Nováček" },
};

const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  budouci_vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  ziskatel: { bg: "#eeebf7", color: "#7c6fcd" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

const statusDotColor: Record<string, { bg: string; glow: string }> = {
  vedouci: { bg: "#45AABD", glow: "rgba(69, 170, 189, 0.25)" },
  budouci_vedouci: { bg: "#45AABD", glow: "rgba(69, 170, 189, 0.25)" },
  garant: { bg: "#3FC55D", glow: "rgba(63, 197, 93, 0.25)" },
  ziskatel: { bg: "#7c6fcd", glow: "rgba(124, 111, 205, 0.25)" },
  novacek: { bg: "#F39E0A", glow: "rgba(243, 158, 10, 0.25)" },
};

const LINE_COLOR = "var(--orgchart-line, #c8d8dc)";

const progressBarColor: Record<string, string> = {
  vedouci: "#45AABD",
  budouci_vedouci: "#45AABD",
  garant: "#3FC55D",
  ziskatel: "#7c6fcd",
  novacek: "#F39E0A",
};

function NodeCard({ node, onClick, isClickable, isFocused, progress, bjInfo, onViewAs }: { node: ProfileNode; onClick?: () => void; isClickable: boolean; isFocused?: boolean; progress?: number; bjInfo?: { value: number; isTeam: boolean }; onViewAs?: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const initials = node.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = avatarColors[node.role] || avatarColors.novacek;
  const dot = statusDotColor[node.role] || { bg: "#89ADB4", glow: "rgba(137,173,180,0.25)" };
  const pct = progress != null ? Math.min(Math.max(progress, 0), 100) : undefined;
  const barColor = progressBarColor[node.role] || "#89ADB4";
  const roleLabel = roleBadgeConfig[node.role]?.label || node.role;

  return (
    <div
      className={`relative flex flex-col items-center transition-shadow flex-shrink-0 ${isClickable ? "cursor-pointer hover:shadow-md" : ""}`}
      onClick={isClickable ? onClick : undefined}
      style={{
        width: 160,
        minHeight: 105,
        background: isFocused
          ? (isDark ? "rgba(0,171,189,0.18)" : "#e0f4f7")
          : (isDark ? "rgba(255,255,255,0.05)" : "#F6F8F9"),
        border: isFocused
          ? "2px solid #00abbd"
          : (isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #E1E9EB"),
        borderRadius: 12,
        boxShadow: isFocused
          ? (isDark ? "0 0 0 3px rgba(0,171,189,0.25), 0 2px 8px rgba(0,0,0,0.4)" : "0 0 0 3px rgba(0,171,189,0.2), 0 2px 8px rgba(0,0,0,0.08)")
          : (isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.08)"),
        paddingTop: 10,
        paddingBottom: 14,
        opacity: isClickable || isFocused ? 1 : 0.7,
        overflow: "hidden",
      }}
    >
      {/* Role chip */}
      <div
        className="absolute"
        style={{
          top: 8, left: 8,
          padding: "2px 8px",
          borderRadius: 20,
          background: dot.bg,
          fontSize: 9,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: 0.3,
          lineHeight: "16px",
          whiteSpace: "nowrap",
        }}
      >
        {roleLabel}
      </div>
      {onViewAs && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewAs(); }}
          title="Zobrazit pohled uživatele"
          className="absolute cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          style={{ top: 8, right: 8, padding: 0, background: "transparent", border: "none", lineHeight: 0 }}
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
      <div style={{ marginTop: 14 }}>
        {node.avatar_url ? (
          <img
            src={node.avatar_url}
            alt={node.full_name}
            loading="lazy"
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
      <p className="font-heading font-semibold text-center leading-tight" style={{ fontSize: 13, color: isDark ? "#e6f1f3" : "#0A2126", marginTop: 8, paddingInline: 8 }}>
        {node.full_name}
      </p>
      {bjInfo != null && (
        <p className="text-center font-heading font-semibold" style={{ fontSize: 11, color: barColor, marginTop: 2, lineHeight: "14px" }}>
          {bjInfo.value.toLocaleString("cs-CZ")} BJ{bjInfo.isTeam ? " tým" : ""}
        </p>
      )}

      {/* Progress bar at bottom edge */}
      {pct != null && (
        <div
          className="absolute"
          style={{
            bottom: 0, left: 0, right: 0, height: 3,
            background: "rgba(0,0,0,0.12)",
            borderRadius: "0 0 12px 12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barColor,
              borderRadius: "0 0 12px 0",
              transition: "width 0.4s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}

function VerticalLine({ height = 24 }: { height?: number }) {
  return (
    <div style={{ width: 2, height, background: LINE_COLOR, margin: "0 auto", flexShrink: 0 }} />
  );
}

function ToggleButton({ expanded, count, onClick }: { expanded: boolean; count: number; onClick: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const Icon = expanded ? Minus : Plus;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center justify-center rounded-full transition-all hover:scale-110"
      style={{
        width: 36, height: 36,
        background: isDark
          ? (expanded ? "rgba(0,171,189,0.25)" : "rgba(255,255,255,0.08)")
          : (expanded ? "#d1e8ec" : "#E1E9EB"),
        border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #c8d8dc",
        cursor: "pointer",
      }}
      title={expanded ? "Sbalit" : `Zobrazit ${count} podřízených`}
    >
      <Icon className="h-4 w-4" style={{ color: isDark ? "#4dd8e8" : "#00555f" }} />
    </button>
  );
}

function ChildrenBranch({
  children,
  childrenMap,
  collapsedIds,
  toggleCollapse,
  onSelect,
  depth,
  focusUserId,
  isClickableFn,
  progressMap,
  bjMap,
  onViewAsFn,
}: {
  children: ProfileNode[];
  childrenMap: Map<string, ProfileNode[]>;
  collapsedIds: Set<string>;
  toggleCollapse: (id: string) => void;
  onSelect: (node: ProfileNode) => void;
  depth: number;
  focusUserId?: string;
  isClickableFn: (node: ProfileNode) => boolean;
  progressMap: Map<string, number>;
  bjMap: Map<string, { value: number; isTeam: boolean }>;
  onViewAsFn?: (node: ProfileNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const childRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lineStyle, setLineStyle] = useState({ left: 0, width: 0 });

  const recalcLines = useCallback(() => {
    const container = containerRef.current;
    if (!container || children.length < 2) return;
    const first = childRefs.current[0];
    const last = childRefs.current[children.length - 1];
    if (!first || !last) return;
    const cRect = container.getBoundingClientRect();
    const fRect = first.getBoundingClientRect();
    const lRect = last.getBoundingClientRect();
    const firstCenter = fRect.left + fRect.width / 2 - cRect.left;
    const lastCenter = lRect.left + lRect.width / 2 - cRect.left;
    setLineStyle({ left: firstCenter, width: lastCenter - firstCenter });
  }, [children.length]);

  // Recalculate on mount, collapse changes, and layout shifts
  useLayoutEffect(() => { recalcLines(); }, [recalcLines, collapsedIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recalcLines());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recalcLines]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-center">
      {children.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: lineStyle.left,
            width: lineStyle.width,
            height: 2,
            background: LINE_COLOR,
          }}
        />
      )}
      <div className="flex" style={{ gap: 24 }}>
        {children.map((child, i) => (
          <div
            key={child.id}
            ref={(el) => { childRefs.current[i] = el; }}
            className="flex flex-col items-center"
          >
            {children.length > 1 && <VerticalLine height={16} />}
            <TreeNode
              node={child}
              childrenMap={childrenMap}
              collapsedIds={collapsedIds}
              toggleCollapse={toggleCollapse}
              onSelect={onSelect}
              depth={depth}
              focusUserId={focusUserId}
              isClickableFn={isClickableFn}
              progressMap={progressMap}
              bjMap={bjMap}
              onViewAsFn={onViewAsFn}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  childrenMap,
  collapsedIds,
  toggleCollapse,
  onSelect,
  depth = 0,
  focusUserId,
  isClickableFn,
  progressMap,
  bjMap,
  onViewAsFn,
}: {
  node: ProfileNode;
  childrenMap: Map<string, ProfileNode[]>;
  collapsedIds: Set<string>;
  toggleCollapse: (id: string) => void;
  onSelect: (node: ProfileNode) => void;
  depth?: number;
  focusUserId?: string;
  isClickableFn: (node: ProfileNode) => boolean;
  progressMap: Map<string, number>;
  bjMap: Map<string, { value: number; isTeam: boolean }>;
  onViewAsFn?: (node: ProfileNode) => void;
}) {
  const children = childrenMap.get(node.id) || [];
  const isCollapsed = collapsedIds.has(node.id);
  const isFocused = node.id === focusUserId;
  const isClickable = isClickableFn(node);

  return (
    <div className="flex flex-col items-center">
      <NodeCard
        node={node}
        onClick={() => onSelect(node)}
        isClickable={isClickable}
        isFocused={isFocused}
        progress={progressMap.get(node.id)}
        bjInfo={bjMap.get(node.id)}
        onViewAs={onViewAsFn ? () => onViewAsFn(node) : undefined}
      />
      {children.length > 0 && (
        <>
          <VerticalLine />
          {isCollapsed ? (
            <ToggleButton expanded={false} count={children.length} onClick={() => toggleCollapse(node.id)} />
          ) : (
            <>
              {depth > 0 && (
                <>
                  <ToggleButton expanded={true} count={children.length} onClick={() => toggleCollapse(node.id)} />
                  <VerticalLine />
                </>
              )}
              <ChildrenBranch
                children={children}
                childrenMap={childrenMap}
                collapsedIds={collapsedIds}
                toggleCollapse={toggleCollapse}
                onSelect={onSelect}
                depth={depth + 1}
                focusUserId={focusUserId}
                isClickableFn={isClickableFn}
                progressMap={progressMap}
                bjMap={bjMap}
                onViewAsFn={onViewAsFn}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Find all ancestor IDs of a given user in the tree */
function findAncestorPath(profiles: ProfileNode[], targetId: string): Set<string> {
  const parentMap = new Map<string, string>();
  profiles.forEach((p) => {
    if (p.ziskatel_id) parentMap.set(p.id, p.ziskatel_id);
  });
  const path = new Set<string>();
  let current = targetId;
  while (parentMap.has(current)) {
    current = parentMap.get(current)!;
    path.add(current);
  }
  return path;
}

export function OrgChart({ currentUserId, focusUserId, onPersonClick, viewerRole, periodStart, periodEnd }: OrgChartProps) {
  const { profile, setViewingAsUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const navigate = useNavigate();

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
  // Fetch cumulative BJ for all users (for progress bars)
  const { data: bjData = [] } = useQuery({
    queryKey: ["org_cumulative_bj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_records")
        .select("user_id, bj");
      if (error) throw error;
      return data || [];
    },
    enabled: profiles.length > 0,
  });

  // Also fetch meeting BJ (podepsane_bj) for accurate totals (all-time, used for progress bars)
  const { data: meetingBjData = [] } = useQuery({
    queryKey: ["org_meeting_bj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("user_id, podepsane_bj")
        .eq("cancelled", false);
      if (error) throw error;
      return data || [];
    },
    enabled: profiles.length > 0,
  });

  // Fetch period-filtered meeting BJ for display in cards
  const { data: periodMeetingBj = [] } = useQuery({
    queryKey: ["org_period_meeting_bj", periodStart, periodEnd],
    queryFn: async () => {
      let q = supabase
        .from("client_meetings")
        .select("user_id, podepsane_bj")
        .eq("cancelled", false);
      if (periodStart) q = q.gte("date", periodStart);
      if (periodEnd) q = q.lte("date", periodEnd);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: profiles.length > 0,
  });

  // Compute structure count per user (recursive)
  const structureCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    function countBelow(nodeId: string): number {
      const kids = childrenMap.get(nodeId) || [];
      let total = kids.length;
      kids.forEach((k) => { total += countBelow(k.id); });
      counts.set(nodeId, total);
      return total;
    }
    profiles.forEach((p) => { if (!counts.has(p.id)) countBelow(p.id); });
    return counts;
  }, [profiles, childrenMap]);

  // Compute cumulative BJ per user (activity_records + client_meetings)
  const cumulativeBjMap = useMemo(() => {
    const map = new Map<string, number>();
    bjData.forEach((r: any) => {
      map.set(r.user_id, (map.get(r.user_id) || 0) + (r.bj || 0));
    });
    meetingBjData.forEach((r: any) => {
      map.set(r.user_id, (map.get(r.user_id) || 0) + (Number(r.podepsane_bj) || 0));
    });
    return map;
  }, [bjData, meetingBjData]);

  // Progress: Získatel → composite (BJ 75% + people 25%), Garant → people/5, BV → people/10, Vedoucí → 100%
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    profiles.forEach((p) => {
      let pct: number | undefined;
      if (p.role === "ziskatel") {
        const bjPct = Math.min((cumulativeBjMap.get(p.id) || 0) / 1000, 1) * 75;
        const peoplePct = Math.min((structureCountMap.get(p.id) || 0) / 2, 1) * 25;
        pct = Math.round((bjPct + peoplePct) * 10) / 10;
      } else if (p.role === "garant") {
        pct = ((structureCountMap.get(p.id) || 0) / 5) * 100;
      } else if (p.role === "budouci_vedouci") {
        pct = ((structureCountMap.get(p.id) || 0) / 10) * 100;
      } else if (p.role === "vedouci") {
        pct = 100;
      }
      if (pct != null) map.set(p.id, pct);
    });
    return map;
  }, [profiles, cumulativeBjMap, structureCountMap]);

  // Compute period BJ per user (personal) from client_meetings
  const periodPersonalBjMap = useMemo(() => {
    const map = new Map<string, number>();
    periodMeetingBj.forEach((r: any) => {
      map.set(r.user_id, (map.get(r.user_id) || 0) + (Number(r.podepsane_bj) || 0));
    });
    return map;
  }, [periodMeetingBj]);

  // Build bjMap for NodeCard display: personal for Nov/Zís/Gar, team for BV/Ved
  const bjMap = useMemo(() => {
    const map = new Map<string, { value: number; isTeam: boolean }>();

    // Recursive sum of personal BJ for subtree (including self)
    function subtreeBj(nodeId: string): number {
      let total = periodPersonalBjMap.get(nodeId) || 0;
      const kids = childrenMap.get(nodeId) || [];
      kids.forEach((k) => { total += subtreeBj(k.id); });
      return total;
    }

    profiles.forEach((p) => {
      if (p.role === "vedouci" || p.role === "budouci_vedouci") {
        map.set(p.id, { value: Math.round(subtreeBj(p.id)), isTeam: true });
      } else {
        map.set(p.id, { value: Math.round(periodPersonalBjMap.get(p.id) || 0), isTeam: false });
      }
    });
    return map;
  }, [profiles, periodPersonalBjMap, childrenMap]);

  // Compute which nodes should be collapsed by default
  // If focusUserId is set, expand the path to that person + their direct children
  const computeCollapsed = useMemo(() => {
    const set = new Set<string>();
    const root = profiles.find((p) => p.id === currentUserId);
    if (!root) return set;

    // Collect IDs on the path to focusUserId
    const focusPath = focusUserId ? findAncestorPath(profiles, focusUserId) : new Set<string>();
    // Also include focusUserId itself (expand their children)
    if (focusUserId) focusPath.add(focusUserId);
    // And include root
    focusPath.add(root.id);

    function walk(nodeId: string, depth: number) {
      const kids = childrenMap.get(nodeId) || [];
      if (kids.length > 0 && depth >= 1 && !focusPath.has(nodeId)) {
        set.add(nodeId);
      }
      kids.forEach((k) => walk(k.id, depth + 1));
    }
    walk(root.id, 0);
    return set;
  }, [profiles, childrenMap, currentUserId, focusUserId]);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const prevFocusRef = useRef<string | undefined>(undefined);

  // Re-compute collapsed when focusUserId changes
  useEffect(() => {
    if (profiles.length === 0) return;
    if (prevFocusRef.current !== focusUserId) {
      setCollapsedIds(computeCollapsed);
      prevFocusRef.current = focusUserId;
    }
  }, [focusUserId, computeCollapsed, profiles.length]);

  // Initialize on first load
  const [initialized, setInitialized] = useState(false);
  if (profiles.length > 0 && !initialized) {
    setCollapsedIds(computeCollapsed);
    setInitialized(true);
  }

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Determine if clicking is allowed — only BV and Vedoucí can click
  const canClick = viewerRole === "vedouci" || viewerRole === "budouci_vedouci";
  const isClickableFn = (node: ProfileNode) => {
    if (!canClick) return false;
    // Can click anyone except yourself
    return node.id !== (focusUserId || currentUserId);
  };

  const handleSelect = (node: ProfileNode) => {
    if (!isClickableFn(node)) return;
    onPersonClick?.(node.id, node);
  };

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const didDrag = useRef(false);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.15, 2)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.15, 0.4)), []);

  // Mouse drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    isDragging.current = true;
    didDrag.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      el.scrollLeft = dragStart.current.scrollLeft - dx;
      el.scrollTop = dragStart.current.scrollTop - dy;
    };

    const onMouseUp = () => {
      isDragging.current = false;
      el.style.cursor = "grab";
      el.style.userSelect = "";
    };

    // Pinch zoom on touch
    let lastPinchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastPinchDist > 0) {
          const scale = dist / lastPinchDist;
          setZoom((z) => Math.min(Math.max(z * scale, 0.4), 2));
        }
        lastPinchDist = dist;
      }
    };
    const onTouchEnd = () => { lastPinchDist = 0; };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <p className="font-body text-[13px]" style={{ color: "var(--text-muted)" }}>Načítání struktury...</p>
      </div>
    );
  }

  if (!profile) return null;

  const currentUser = profiles.find((p) => p.id === currentUserId);
  if (!currentUser) {
    return (
      <p className="font-body text-[13px]" style={{ color: "var(--text-muted)" }}>Žádná struktura k zobrazení.</p>
    );
  }

  return (
    <div
      className="relative"
      style={{
        width: "100%",
        height: "100%",
        ["--orgchart-line" as any]: isDark ? "rgba(255,255,255,0.18)" : "#c8d8dc",
      }}
    >
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ width: "100%", height: "100%", cursor: "grab" }}
        onMouseDown={onMouseDown}
      >
        <div
          className="flex flex-col items-center py-4 px-4 min-w-fit"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            transition: "transform 0.15s ease-out",
          }}
        >
          <TreeNode
            node={currentUser}
            childrenMap={childrenMap}
            collapsedIds={collapsedIds}
            toggleCollapse={toggleCollapse}
            onSelect={handleSelect}
            depth={0}
            focusUserId={focusUserId || currentUserId}
            isClickableFn={isClickableFn}
            progressMap={progressMap}
            bjMap={bjMap}
          />
        </div>
      </div>

      {/* Zoom buttons — bottom right */}
      <div
        className="absolute flex flex-col gap-1.5"
        style={{ bottom: 12, right: 12, zIndex: 10 }}
      >
        <button
          onClick={zoomIn}
          className="flex items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
          style={{
            width: 36, height: 36,
            background: isDark ? "rgba(20,40,44,0.85)" : "rgba(255,255,255,0.9)",
            backdropFilter: "blur(8px)",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #E1E9EB",
            boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.10)",
            cursor: "pointer",
          }}
          title="Přiblížit"
        >
          <ZoomIn className="h-4 w-4" style={{ color: isDark ? "#4dd8e8" : "#00555f" }} />
        </button>
        <button
          onClick={zoomOut}
          className="flex items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
          style={{
            width: 36, height: 36,
            background: isDark ? "rgba(20,40,44,0.85)" : "rgba(255,255,255,0.9)",
            backdropFilter: "blur(8px)",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #E1E9EB",
            boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.10)",
            cursor: "pointer",
          }}
          title="Oddálit"
        >
          <ZoomOut className="h-4 w-4" style={{ color: isDark ? "#4dd8e8" : "#00555f" }} />
        </button>
      </div>
    </div>
  );
}
