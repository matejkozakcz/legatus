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

  // Garant: count direct subordinates (garant_id = me)
  const { data: garantDirectCount = 0 } = useQuery({
    queryKey: ["garant_direct_count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("garant_id", profile.id)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!profile?.id && profile?.role === "garant",
  });

  // Garant: count all people in structure (ziskatel_id chain)
  const { data: garantStructureCount = 0 } = useQuery({
    queryKey: ["garant_structure_count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      // Fetch all active profiles where garant_id = me (all under garant)
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("garant_id", profile.id)
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!profile?.id && profile?.role === "garant",
  });

  // Vedoucí: monthly BJ for entire subtree
  const periodStart = getProductionPeriodStart(now);
  const periodEnd = getProductionPeriodEnd(now);

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

    // BJ goal toward next promotion
    const role = profile?.role ?? "novacek";
    const bjGoal = 1000;
    const bjProgress = Math.min(100, (totalBjAllTime / bjGoal) * 100);
    const bjRemaining = Math.max(0, bjGoal - totalBjAllTime);
    const nextRoleLabel =
      role === "ziskatel"
        ? "Garanta"
        : role === "garant"
          ? "Budoucího vedoucího"
          : role === "budouci_vedouci"
            ? "Vedoucího"
            : null;

    return (
      <div className="mobile-page">
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

        {/* ── KUMULATIVNÍ BJ CARD ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
            borderRadius: 20,
            padding: "20px 20px 18px",
            marginBottom: 12,
            color: "white",
            boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10, fontFamily: "Open Sans, sans-serif" }}>
            Kumulativní BJ (celkem)
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 800,
                fontSize: 52,
                lineHeight: 1,
                color: "white",
              }}
            >
              {totalBjAllTime}
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, opacity: 0.75 }}>BJ</span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 8,
              background: "rgba(255,255,255,0.18)",
              borderRadius: 4,
              overflow: "hidden",
              marginTop: 16,
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#fc7c71",
                borderRadius: 4,
                width: `${bjProgress}%`,
                transition: "width 0.6s ease",
              }}
            />
          </div>

          {nextRoleLabel && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 7,
                fontSize: 12,
                opacity: 0.8,
                fontFamily: "Open Sans, sans-serif",
              }}
            >
              <span>Do {nextRoleLabel} zbývá</span>
              <span style={{ fontWeight: 700 }}>{bjRemaining} BJ</span>
            </div>
          )}
          {!nextRoleLabel && <div style={{ marginTop: 7, fontSize: 12, opacity: 0.8 }}>Vedoucí ✓</div>}
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

        {/* ── WEEK NAVIGATOR ── */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: "10px 16px",
            marginBottom: 12,
            border: "1px solid #e1e9eb",
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
    if (role === "ziskatel") {
      return (
        <>
          <GaugeIndicator value={totalBjAllTime} max={1000} label="Kumulativní BJ" sublabel="historický výkon" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "12px 0",
            }}
          >
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 800,
                fontSize: 42,
                color: "#00555f",
                lineHeight: 1,
              }}
            >
              {totalBjAllTime}
            </span>
            <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 16, color: "#00abbd" }}>
              z 1 000 BJ
            </span>
            <span style={{ fontFamily: "Open Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#4a6b70" }}>
              Historické BJ
            </span>
          </div>
        </>
      );
    }
    if (role === "garant") {
      return (
        <>
          <GaugeIndicator
            value={garantStructureCount}
            max={2}
            label="Lidé ve struktuře"
            sublabel="pro povýšení na BV"
          />
          <GaugeIndicator value={totalBjAllTime} max={1000} label="Kumulativní BJ" sublabel="osobní výkon" />
        </>
      );
    }
    if (role === "budouci_vedouci") {
      return (
        <>
          <GaugeIndicator value={garantDirectCount} max={3} label="Přímí podřízení" sublabel={`z 3 pro Vedoucího`} />
          <GaugeIndicator
            value={garantStructureCount}
            max={5}
            label="Lidé ve struktuře"
            sublabel={`z 5 pro Vedoucího`}
          />
        </>
      );
    }
    // vedouci
    return (
      <>
        <div style={{ position: "relative" }}>
          <GaugeIndicator
            value={vedouciMonthlyBj}
            max={monthlyBjGoal || 100}
            label="BJ tento měsíc"
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "12px 0",
          }}
        >
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 800,
              fontSize: 42,
              color: "#00555f",
              lineHeight: 1,
            }}
          >
            {vedouciMonthlyBj}
          </span>
          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 16, color: "#00abbd" }}>
            z {monthlyBjGoal || "—"} BJ
          </span>
          <span style={{ fontFamily: "Open Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#4a6b70" }}>
            Aktuální stav / plán
          </span>
        </div>
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
