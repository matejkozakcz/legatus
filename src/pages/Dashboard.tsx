import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ChevronLeft, ChevronRight, Plus, Minus, Bell, Pencil, Check } from "lucide-react";
import { GaugeIndicator } from "@/components/GaugeIndicator";
import { startOfWeek, endOfWeek, subWeeks, addWeeks, format, isSameWeek } from "date-fns";
import { getProductionPeriodStart, getProductionPeriodEnd, daysRemainingInPeriod } from "@/lib/productionPeriod";
import { cs } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { OrgChart } from "@/components/OrgChart";
import { fireConfetti } from "@/lib/confetti";
import { PromotionModal } from "@/components/PromotionModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { toVocative } from "@/lib/vocative";
import { toast } from "sonner";

type TimeFilter = "this_week" | "last_week" | "this_month";

// ─── Deadlines section (incoming notifications) ───────────────────────────────
function DeadlinesSection({ userId }: { userId?: string }) {
  const { data: notifications = [] } = useQuery({
    queryKey: ["my_notifications", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("notifications" as any)
        .select("id, title, message, deadline, read, created_at")
        .eq("recipient_id", userId)
        .order("deadline", { ascending: true })
        .limit(10);
      return (data || []) as any[];
    },
    enabled: !!userId,
  });

  const markRead = async (id: string) => {
    await supabase
      .from("notifications" as any)
      .update({ read: true })
      .eq("id", id);
  };

  if (notifications.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          paddingTop: 8,
        }}
      >
        <Bell size={18} color="#00abbd" />
        <span
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 700,
            fontSize: 16,
            color: "#0c2226",
          }}
        >
          Upozornění
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notifications.map((n: any) => {
          const isOverdue = new Date(n.deadline) < new Date();
          return (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                background: n.read ? "#f5f8f9" : "white",
                borderRadius: 14,
                padding: "12px 16px",
                border: `1px solid ${isOverdue ? "#fc7c71" : "#e1e9eb"}`,
                opacity: n.read ? 0.7 : 1,
                cursor: n.read ? "default" : "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    color: "#0c2226",
                  }}
                >
                  {n.title}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isOverdue ? "#fc7c71" : "#00abbd",
                  }}
                >
                  {n.deadline}
                </span>
              </div>
              {n.message && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#8aadb3",
                    marginTop: 4,
                    fontFamily: "Open Sans, sans-serif",
                  }}
                >
                  {n.message}
                </div>
              )}
              {!n.read && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#00abbd",
                    marginTop: 6,
                    fontFamily: "Open Sans, sans-serif",
                  }}
                >
                  Klepni pro označení jako přečtené
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mobile editable stat card ────────────────────────────────────────────────

function MobileStatCard({
  label,
  actual,
  planned,
  sublabel,
  editable,
  onIncrement,
  onDecrement,
}: {
  label: string;
  actual: number;
  planned: number;
  sublabel: string;
  editable: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const [pressed, setPressed] = useState<"plus" | "minus" | null>(null);

  const handlePress = (side: "plus" | "minus", action: () => void) => {
    if (!editable) return;
    setPressed(side);
    action();
    setTimeout(() => setPressed(null), 150);
  };

  return (
    <div
      className="mobile-stat-card"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
    >
      <div style={{ flex: 1 }}>
        <div className="mobile-stat-label">{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 800,
              fontSize: 36,
              color: "#00555f",
              lineHeight: 1,
            }}
          >
            {actual}
          </span>
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 500,
              fontSize: 22,
              color: "#b8cfd4",
              lineHeight: 1,
            }}
          >
            /
          </span>
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              fontSize: 28,
              color: "#00abbd",
              lineHeight: 1,
            }}
          >
            {planned}
          </span>
        </div>
        <div className="mobile-stat-sublabel" style={{ marginTop: 5 }}>
          {sublabel}
        </div>
      </div>
      {/* +/- buttons stacked vertically */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginLeft: 10,
        }}
      >
        <button
          disabled={!editable}
          onPointerDown={() => handlePress("plus", onIncrement)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: pressed === "plus" ? "#b8cfd4" : "#dde8ea",
            border: "none",
            cursor: editable ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: editable ? 1 : 0.35,
            transition: "background 0.1s",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Plus size={16} color="#00555f" strokeWidth={2.5} />
        </button>
        <button
          disabled={!editable}
          onPointerDown={() => handlePress("minus", onDecrement)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: pressed === "minus" ? "#b8cfd4" : "#dde8ea",
            border: "none",
            cursor: editable ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: editable ? 1 : 0.35,
            transition: "background 0.1s",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Minus size={16} color="#00555f" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { profile, user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("this_week");
  const [promotionRole, setPromotionRole] = useState<string | null>(null);
  const prevRoleRef = useRef<string | null>(null);
  const hasCheckedFirstLogin = useRef(false);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const now = new Date();

  // Mobile week navigation
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const mobileWeekStart = useMemo(
    () => addWeeks(startOfWeek(now, { weekStartsOn: 1 }), mobileWeekOffset),
    [mobileWeekOffset],
  );
  const mobileWeekEnd = endOfWeek(mobileWeekStart, { weekStartsOn: 1 });
  const mobileWeekStr = format(mobileWeekStart, "yyyy-MM-dd");
  const isMobileWeekEditable = isSameWeek(mobileWeekStart, now, { weekStartsOn: 1 });

  // Local values for optimistic updates
  const [localValues, setLocalValues] = useState<Record<string, number>>({});
  const localValuesRef = useRef<Record<string, number>>({});

  // First login confetti
  useEffect(() => {
    if (!user || !profile || hasCheckedFirstLogin.current) return;
    hasCheckedFirstLogin.current = true;
    const key = `legatus_first_login_${user.id}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "true");
      fireConfetti();
    }
  }, [user, profile]);

  useEffect(() => {
    if (!profile) return;
    const prev = prevRoleRef.current;
    prevRoleRef.current = profile.role;
    if (prev && prev !== profile.role) {
      const roleOrder: Record<string, number> = { novacek: 0, ziskatel: 1, garant: 2, budouci_vedouci: 3, vedouci: 4 };
      if ((roleOrder[profile.role] ?? 0) > (roleOrder[prev] ?? 0)) {
        fireConfetti();
        setPromotionRole(profile.role);
      }
    }
  }, [profile?.role]);

  // ── Desktop date range ──────────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    switch (timeFilter) {
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week":
        return {
          from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
          to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        };
      case "this_month":
        return { from: getProductionPeriodStart(now), to: getProductionPeriodEnd(now) };
    }
  }, [timeFilter]);

  const { data: records = [] } = useQuery({
    queryKey: ["activity_records", profile?.id, dateRange],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", profile.id)
        .gte("week_start", format(dateRange.from, "yyyy-MM-dd"))
        .lte("week_start", format(dateRange.to, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const stats = useMemo(() => {
    const sum = (key: string) => records.reduce((acc: number, r: any) => acc + (r[key] || 0), 0);
    return {
      fsa: { actual: sum("fsa_actual"), planned: sum("fsa_planned") },
      poh: { actual: sum("poh_actual"), planned: sum("poh_planned") },
      ser: { actual: sum("ser_actual"), planned: sum("ser_planned") },
      ref: { actual: sum("ref_actual"), planned: sum("ref_planned") },
    };
  }, [records]);

  // ── Queries for Stav byznysu card (all roles, desktop + mobile) ───────────

  // All-time cumulative BJ (for promotion progress gauge)
  const { data: allBjData = [] } = useQuery({
    queryKey: ["bj_all_time", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase.from("activity_records").select("bj").eq("user_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id && profile?.role !== "vedouci" && profile?.role !== "novacek",
  });
  const totalBjAllTime = useMemo(() => allBjData.reduce((acc: number, r: any) => acc + (r.bj || 0), 0), [allBjData]);

  // Direct subordinates count (for Garant and BV promotion progress)
  const { data: directSubordinateCount = 0 } = useQuery({
    queryKey: ["direct_subordinate_count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("vedouci_id", profile.id)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!profile?.id && (profile?.role === "garant" || profile?.role === "budouci_vedouci"),
  });

  // Total structure count (people under me via garant_id or vedouci_id)
  const { data: structureCount = 0 } = useQuery({
    queryKey: ["structure_count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      // Count people where garant_id = me OR vedouci_id = me
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .or(`garant_id.eq.${profile.id},vedouci_id.eq.${profile.id}`)
        .eq("is_active", true)
        .neq("id", profile.id);
      return count || 0;
    },
    enabled: !!profile?.id && (profile?.role === "garant" || profile?.role === "budouci_vedouci"),
  });

  // Vedoucí: monthly BJ for entire subtree
  const periodStart = getProductionPeriodStart(now);
  const periodEnd = getProductionPeriodEnd(now);

  // Vedoucí: monthly BJ for entire subtree (team)
  const { data: vedouciMonthlyBj = 0 } = useQuery({
    queryKey: ["vedouci_monthly_bj", profile?.id, format(periodStart, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { data } = await supabase
        .from("activity_records")
        .select("bj")
        .gte("week_start", format(periodStart, "yyyy-MM-dd"))
        .lte("week_start", format(periodEnd, "yyyy-MM-dd"));
      return (data || []).reduce((acc: number, r: any) => acc + (r.bj || 0), 0);
    },
    enabled: !!profile?.id && profile?.role === "vedouci",
  });

  // Personal monthly BJ (current production period)
  const { data: personalMonthlyBj = 0 } = useQuery({
    queryKey: ["personal_monthly_bj", profile?.id, format(periodStart, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { data } = await supabase
        .from("activity_records")
        .select("bj")
        .eq("user_id", profile.id)
        .gte("week_start", format(periodStart, "yyyy-MM-dd"))
        .lte("week_start", format(periodEnd, "yyyy-MM-dd"));
      return (data || []).reduce((acc: number, r: any) => acc + (r.bj || 0), 0);
    },
    enabled: !!profile?.id,
  });

  // Vedoucí: monthly_bj_goal from profile
  const monthlyBjGoal = profile?.monthly_bj_goal || 0;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInputValue, setGoalInputValue] = useState("");

  const updateGoalMutation = useMutation({
    mutationFn: async (newGoal: number) => {
      if (!profile?.id) throw new Error("No user");
      const { error } = await supabase
        .from("profiles")
        .update({ monthly_bj_goal: newGoal } as any)
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingGoal(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Refetch profile in auth context
      window.location.reload();
    },
  });

  // Mobile week record query
  const { data: mobileWeekRecords = [] } = useQuery({
    queryKey: ["activity_records", profile?.id, mobileWeekStr],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("activity_records")
        .select("*")
        .eq("user_id", profile.id)
        .eq("week_start", mobileWeekStr);
      return data || [];
    },
    enabled: !!profile?.id && isMobile,
  });

  const mobileRecord = mobileWeekRecords[0] as any;

  // Sync local values from server
  useEffect(() => {
    const rec = mobileRecord;
    const fresh: Record<string, number> = {
      fsa_actual: rec?.fsa_actual || 0,
      fsa_planned: rec?.fsa_planned || 0,
      poh_actual: rec?.poh_actual || 0,
      poh_planned: rec?.poh_planned || 0,
      ser_actual: rec?.ser_actual || 0,
      ser_planned: rec?.ser_planned || 0,
      ref_actual: rec?.ref_actual || 0,
      ref_planned: rec?.ref_planned || 0,
    };
    localValuesRef.current = fresh;
    setLocalValues(fresh);
  }, [mobileWeekStr, mobileRecord]);

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async (record: { week_start: string; [key: string]: any }) => {
      if (!profile?.id) throw new Error("No user");
      const { error } = await supabase
        .from("activity_records")
        .upsert({ user_id: profile.id, ...record }, { onConflict: "user_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_records"] });
      queryClient.invalidateQueries({ queryKey: ["bj_all_time"] });
    },
    onError: () => {
      toast.error("Nepodařilo se uložit změny.");
    },
  });

  // Mobile change handler
  const handleMobileChange = useCallback(
    (key: string, newVal: number) => {
      const updated = { ...localValuesRef.current, [key]: newVal };
      localValuesRef.current = updated;
      setLocalValues({ ...updated });

      const timerKey = "dashboard-save-" + mobileWeekStr;
      if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
      debounceTimers.current[timerKey] = setTimeout(() => {
        const existing = mobileRecord;
        const record: any = { ...(existing || {}), week_start: mobileWeekStr, ...localValuesRef.current };
        upsertMutation.mutate(record);
      }, 800);
    },
    [mobileWeekStr, mobileRecord, upsertMutation],
  );

  // ── Desktop filter pills ────────────────────────────────────────────────────
  const filterPills: { key: TimeFilter; label: string }[] = [
    { key: "this_week", label: "Tento týden" },
    { key: "last_week", label: "Minulý týden" },
    { key: "this_month", label: "Tento měsíc" },
  ];

  // ── Mobile render ───────────────────────────────────────────────────────────
  if (isMobile) {
    const firstName = toVocative(profile?.full_name?.split(" ")[0] ?? "");
    const daysRemaining = daysRemainingInPeriod(now);

    const role = profile?.role ?? "novacek";

    return (
      <div className="mobile-page" style={{ paddingBottom: 160 }}>
        {/* ── HEADER ── */}
        <div style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div
            style={{
              fontFamily: "Open Sans, sans-serif",
              fontSize: 22,
              fontWeight: 400,
              color: "#0c2226",
              lineHeight: 1.2,
            }}
          >
            Ahoj,
          </div>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 34,
              fontWeight: 800,
              color: "#0c2226",
              lineHeight: 1.1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {firstName}!{" "}
            <span role="img" aria-label="wave">
              👋
            </span>
          </div>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: "#0c2226",
              marginTop: 10,
            }}
          >
            Zbývá {daysRemaining} dní a takhle vypadá tvůj byznys:
          </div>
        </div>

        {/* ── STAV BYZNYSU GAUGES ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
            borderRadius: 20,
            padding: "16px 12px 14px",
            marginBottom: 12,
            color: "white",
            boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
            display: "flex",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {role === "novacek" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder dark />
              </div>
            </>
          ) : role === "vedouci" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 2 }}>Týmové BJ</span>
                <GaugeIndicator
                  value={vedouciMonthlyBj}
                  max={monthlyBjGoal || 100}
                  label=""
                  sublabel="vs. měsíční cíl"
                  dark
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 2 }}>Osobní BJ</span>
                <GaugeIndicator
                  value={personalMonthlyBj}
                  max={monthlyBjGoal || 100}
                  label=""
                  sublabel="tento měsíc"
                  dark
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 2 }}>Osobní BJ</span>
                <GaugeIndicator
                  value={personalMonthlyBj}
                  max={monthlyBjGoal || 100}
                  label=""
                  sublabel="tento měsíc"
                  dark
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 2 }}>
                  {role === "ziskatel" ? "Progress k Garantovi" : role === "garant" ? "Progress k BV" : "Progress k Vedoucímu"}
                </span>
                {role === "ziskatel" ? (
                  <GaugeIndicator
                    value={totalBjAllTime}
                    max={1000}
                    label=""
                    sublabel={`${Math.max(0, 1000 - totalBjAllTime)} BJ zbývá`}
                    dark
                  />
                ) : role === "garant" ? (
                  <GaugeIndicator
                    value={structureCount}
                    max={5}
                    label=""
                    sublabel={`${structureCount} z 5 lidí`}
                    dark
                  />
                ) : (
                  <GaugeIndicator
                    value={structureCount}
                    max={10}
                    label=""
                    sublabel={`${structureCount} z 10 lidí`}
                    dark
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── 2×2 STAT GRID (this week, editable) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <MobileStatCard
            label="Analýzy"
            actual={localValues.fsa_actual || 0}
            planned={localValues.fsa_planned || 0}
            sublabel="proběhlých / doml."
            editable={isMobileWeekEditable}
            onIncrement={() => handleMobileChange("fsa_actual", (localValuesRef.current.fsa_actual || 0) + 1)}
            onDecrement={() =>
              handleMobileChange("fsa_actual", Math.max(0, (localValuesRef.current.fsa_actual || 0) - 1))
            }
          />
          <MobileStatCard
            label="Pohovory"
            actual={localValues.poh_actual || 0}
            planned={localValues.poh_planned || 0}
            sublabel="proběhlých / naplán."
            editable={isMobileWeekEditable}
            onIncrement={() => handleMobileChange("poh_actual", (localValuesRef.current.poh_actual || 0) + 1)}
            onDecrement={() =>
              handleMobileChange("poh_actual", Math.max(0, (localValuesRef.current.poh_actual || 0) - 1))
            }
          />
          <MobileStatCard
            label="Poradka"
            actual={localValues.ser_actual || 0}
            planned={localValues.ser_planned || 0}
            sublabel="proběhlých / naplán."
            editable={isMobileWeekEditable}
            onIncrement={() => handleMobileChange("ser_actual", (localValuesRef.current.ser_actual || 0) + 1)}
            onDecrement={() =>
              handleMobileChange("ser_actual", Math.max(0, (localValuesRef.current.ser_actual || 0) - 1))
            }
          />
          <MobileStatCard
            label="Doporučení"
            actual={localValues.ref_actual || 0}
            planned={localValues.ref_planned || 0}
            sublabel="vybraných / naplán."
            editable={isMobileWeekEditable}
            onIncrement={() => handleMobileChange("ref_actual", (localValuesRef.current.ref_actual || 0) + 1)}
            onDecrement={() =>
              handleMobileChange("ref_actual", Math.max(0, (localValuesRef.current.ref_actual || 0) - 1))
            }
          />
        </div>

        {/* ── WEEK NAVIGATOR (fixed above bottom nav) ── */}
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: 16,
            right: 16,
            zIndex: 40,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            borderRadius: 16,
            padding: "10px 16px",
            border: "1px solid rgba(225,233,235,0.8)",
            boxShadow: "0 -2px 16px rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => setMobileWeekOffset((o) => o - 1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "#dde8ea",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft size={15} color="#00555f" />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#00abbd", fontWeight: 600 }}>
              {isMobileWeekEditable ? "Aktuální týden" : format(mobileWeekStart, "MMMM yyyy", { locale: cs })}
            </div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: "#0c2226" }}>
              {format(mobileWeekStart, "d.M.", { locale: cs })} – {format(mobileWeekEnd, "d.M.", { locale: cs })}
            </div>
          </div>
          <button
            onClick={() => setMobileWeekOffset((o) => Math.min(0, o + 1))}
            disabled={mobileWeekOffset >= 0}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "#dde8ea",
              border: "none",
              cursor: mobileWeekOffset >= 0 ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: mobileWeekOffset >= 0 ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} color="#00555f" />
          </button>
        </div>

        {/* Autosave indicator */}
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#8aadb3",
            padding: "6px 0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fc55d", flexShrink: 0 }} />
          Automaticky ukládáno
        </div>

        {/* Upcoming deadlines */}
        <DeadlinesSection userId={profile?.id} />

        <PromotionModal open={!!promotionRole} onClose={() => setPromotionRole(null)} newRole={promotionRole || ""} />
      </div>
    );
  }

  // ── DESKTOP render ──────────────────────────────────────────────────────────
  const role = profile?.role ?? "novacek";

  const renderStavByznysu = () => {
    if (role === "novacek") {
      return (
        <>
          <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder />
          <GaugeIndicator value={0} max={0} label="Brzy dostupné" placeholder />
        </>
      );
    }

    if (role === "vedouci") {
      return (
        <>
          <div style={{ position: "relative" }}>
            <GaugeIndicator
              value={vedouciMonthlyBj}
              max={monthlyBjGoal || 100}
              label="Týmové BJ"
              sublabel="vs. měsíční cíl"
            />
            {!editingGoal ? (
              <button
                onClick={() => {
                  setGoalInputValue(String(monthlyBjGoal || ""));
                  setEditingGoal(true);
                }}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#e6f7f9",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Nastavit cíl"
              >
                <Pencil size={14} color="#00abbd" />
              </button>
            ) : (
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <input
                  type="number"
                  value={goalInputValue}
                  onChange={(e) => setGoalInputValue(e.target.value)}
                  style={{
                    width: 64,
                    height: 28,
                    borderRadius: 6,
                    border: "1.5px solid #00abbd",
                    padding: "0 6px",
                    fontFamily: "Poppins, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#00555f",
                    outline: "none",
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateGoalMutation.mutate(Number(goalInputValue) || 0);
                    if (e.key === "Escape") setEditingGoal(false);
                  }}
                />
                <button
                  onClick={() => updateGoalMutation.mutate(Number(goalInputValue) || 0)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "#00abbd",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={14} color="white" />
                </button>
              </div>
            )}
          </div>
          <GaugeIndicator
            value={personalMonthlyBj}
            max={monthlyBjGoal || 100}
            label="Osobní BJ"
            sublabel="tento měsíc"
          />
        </>
      );
    }

    // Získatel, Garant, Budoucí vedoucí — Gauge 1: Osobní BJ, Gauge 2: Progress k cíli
    const promotionGauge = (() => {
      if (role === "ziskatel") {
        return (
          <GaugeIndicator
            value={totalBjAllTime}
            max={1000}
            label="Progress k Garantovi"
            sublabel={`${Math.max(0, 1000 - totalBjAllTime)} BJ zbývá`}
          />
        );
      }
      if (role === "garant") {
        return (
          <GaugeIndicator
            value={structureCount}
            max={5}
            label="Progress k BV"
            sublabel={`${structureCount} z 5 lidí ve struktuře`}
          />
        );
      }
      // budouci_vedouci
      return (
        <GaugeIndicator
          value={structureCount}
          max={10}
          label="Progress k Vedoucímu"
          sublabel={`${structureCount} z 10 lidí ve struktuře`}
        />
      );
    })();

    return (
      <>
        <GaugeIndicator
          value={personalMonthlyBj}
          max={monthlyBjGoal || 100}
          label="Osobní BJ"
          sublabel="tento měsíc"
        />
        {promotionGauge}
      </>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6" style={{ color: "#0c2226" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "#0c2226" }}>
          DASHBOARD
        </h1>
      </div>

      <section className="space-y-4">
        <div className="flex gap-6" style={{ alignItems: "stretch", minHeight: 350 }}>
          {/* Stav byznysu — 1/4 */}
          <div style={{ width: "25%", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226", marginBottom: 16 }}>
              Stav byznysu
            </h2>
            <div
              className="legatus-card"
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
                alignItems: "center",
                flex: 1,
                overflowY: "auto",
              }}
            >
              {renderStavByznysu()}
            </div>
          </div>
          {/* Moje struktura — 3/5 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226", marginBottom: 16 }}>
              Moje struktura
            </h2>
            <div
              className="legatus-card"
              style={{
                padding: 24,
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                <OrgChart currentUserId={profile?.id || ""} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading font-semibold" style={{ fontSize: 22, color: "#0c2226" }}>
          Přehled aktivit
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {filterPills.map((pill) => (
            <button
              key={pill.key}
              onClick={() => setTimeFilter(pill.key)}
              className={`chip ${timeFilter === pill.key ? "chip-teal-active" : "chip-neutral"}`}
            >
              {pill.label}
            </button>
          ))}
          <span className="font-body text-xs text-muted-foreground ml-1">Období od</span>
          <span className="chip chip-neutral" style={{ cursor: "default" }}>
            {format(dateRange.from, "d. M. yyyy", { locale: cs })}
          </span>
          <span className="font-body text-xs text-muted-foreground">do</span>
          <span className="chip chip-neutral" style={{ cursor: "default" }}>
            {format(dateRange.to, "d. M. yyyy", { locale: cs })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Analýzy"
            actual={stats.fsa.actual}
            planned={stats.fsa.planned}
            actualLabel="proběhlých"
            plannedLabel="domluvenných"
          />
          <StatCard
            label="Pohovory"
            actual={stats.poh.actual}
            planned={stats.poh.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Poradka"
            actual={stats.ser.actual}
            planned={stats.ser.planned}
            actualLabel="proběhlých"
            plannedLabel="naplánovaných"
          />
          <StatCard
            label="Doporučení"
            actual={stats.ref.actual}
            planned={stats.ref.planned}
            actualLabel="vybraných"
            plannedLabel="naplánovaných"
          />
        </div>
      </section>

      <DeadlinesSection userId={profile?.id} />

      <PromotionModal open={!!promotionRole} onClose={() => setPromotionRole(null)} newRole={promotionRole || ""} />
    </div>
  );
};

export default Dashboard;
