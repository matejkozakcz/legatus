import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, formatISO, format } from "date-fns";
import { cs } from "date-fns/locale";
import { X, Loader2, ArrowRight, TrendingUp, TrendingDown, CheckCircle2, XCircle, Bell, Pencil, Calendar, GraduationCap, Plus, Trash2, Check } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ProfileNode {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface MemberDetailModalProps {
  member: ProfileNode;
  onClose: () => void;
  onEdit?: () => void;
  onNotify?: () => void;
}

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

const avatarColors: Record<string, { bg: string; color: string }> = {
  vedouci: { bg: "#e6f0f1", color: "#00555f" },
  garant: { bg: "#e6f7f9", color: "#008fa0" },
  ziskatel: { bg: "#eeebf7", color: "#7c6fcd" },
  novacek: { bg: "#fff2f1", color: "#e05a50" },
};

function getWeekStart() {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return formatISO(monday, { representation: "date" });
}

export function MemberDetailModal({ member, onClose, onEdit, onNotify }: MemberDetailModalProps) {
  useBodyScrollLock(true);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const weekStart = getWeekStart();

  const { data: record, isLoading } = useQuery({
    queryKey: ["member_week_stats", member.id, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_records")
        .select("fsa_actual, fsa_planned, poh_actual, poh_planned, por_actual, por_planned, ref_actual, ref_planned")
        .eq("user_id", member.id)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: upcomingMeetings = [], isLoading: isMeetingsLoading } = useQuery({
    queryKey: ["member_upcoming_meetings", member.id],
    queryFn: async () => {
      const today = formatISO(new Date(), { representation: "date" });
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, date, meeting_time, meeting_type, case_name, cancelled")
        .eq("user_id", member.id)
        .eq("cancelled", false)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        date: string;
        meeting_time: string | null;
        meeting_type: string;
        case_name: string | null;
        cancelled: boolean;
      }>;
    },
  });

  const { data: promotionHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["promotion_history", member.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotion_history")
        .select("id, requested_role, event, cumulative_bj, direct_ziskatels, note, created_at")
        .eq("user_id", member.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        requested_role: string;
        event: string;
        cumulative_bj: number | null;
        direct_ziskatels: number | null;
        note: string | null;
        created_at: string;
      }>;
    },
  });

  const initials = member.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = avatarColors[member.role] || avatarColors.novacek;
  const badge = roleBadgeConfig[member.role] || roleBadgeConfig.novacek;

  const stats = [
    { label: "Analýzy", actual: record?.fsa_actual ?? 0, planned: record?.fsa_planned ?? 0 },
    { label: "Pohovory", actual: record?.poh_actual ?? 0, planned: record?.poh_planned ?? 0 },
    { label: "Porádka", actual: record?.por_actual ?? 0, planned: record?.por_planned ?? 0 },
    { label: "Doporučení", actual: record?.ref_actual ?? 0, planned: record?.ref_planned ?? 0 },
  ];

  const meetingTypeLabels: Record<string, string> = {
    FSA: "Analýza",
    SER: "Servis",
    POH: "Pohovor",
    POR: "Porádka",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full mx-4 rounded-2xl shadow-2xl p-6 overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
          animation: "modalIn 150ms ease-out forwards",
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
          boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X size={18} style={{ color: "#89ADB4" }} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.full_name}
                loading="lazy"
                className="rounded-full object-cover"
                style={{ width: 64, height: 64, border: isDark ? "2px solid rgba(255,255,255,0.15)" : "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 64,
                  height: 64,
                  background: colors.bg,
                  color: colors.color,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <span className="font-heading font-semibold text-xl">{initials}</span>
              </div>
            )}
          </div>

          <h3 className="font-heading text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {member.full_name}
          </h3>

          <div className="flex items-center gap-2">
            <span className={badge.className}>{badge.label}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4" style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />

        {/* Stats */}
        <div>
          <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Statistiky tohoto týdne
          </p>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin" size={24} style={{ color: "#00abbd" }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="stat-card flex flex-col gap-1" style={{ padding: "12px 16px" }}>
                  <p
                    className="font-body text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "#fc7c71" }}
                  >
                    {s.label}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-heading text-2xl font-bold leading-none" style={{ color: isDark ? "#4dd8e8" : "#00555f" }}>
                      {s.actual}
                    </span>
                    <span className="font-body text-sm font-semibold" style={{ color: "#00abbd" }}>
                      z {s.planned}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="my-4" style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />
        <div>
          <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Nadcházející schůzky
          </p>
          {isMeetingsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin" size={20} style={{ color: "#00abbd" }} />
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <p className="text-xs font-body" style={{ color: "var(--text-muted)" }}>
              Žádné naplánované schůzky
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingMeetings.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg"
                  style={{
                    padding: "8px 12px",
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,85,95,0.04)",
                    border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e1e9eb",
                  }}
                >
                  <Calendar size={14} style={{ color: "#00abbd", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-body font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {meetingTypeLabels[m.meeting_type] || m.meeting_type}
                      {m.case_name && ` — ${m.case_name}`}
                    </p>
                    <p className="text-[11px] font-body" style={{ color: "var(--text-muted)" }}>
                      {format(new Date(m.date), "EEEE d. MMMM", { locale: cs })}
                      {m.meeting_time && `, ${m.meeting_time.slice(0, 5)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Promotion History */}
        {promotionHistory.length > 0 && (
          <>
            <div className="my-4" style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />
            <div>
              <p className="font-heading text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Historie povýšení
              </p>
              {isHistoryLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="animate-spin" size={20} style={{ color: "#00abbd" }} />
                </div>
              ) : (
                <div className="space-y-0 relative">
                  <div
                    className="absolute left-[11px] top-2 bottom-2"
                    style={{ width: 2, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }}
                  />
                  {promotionHistory.map((entry) => {
                    const eventConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                      eligible: { icon: <TrendingUp size={12} />, color: "#00abbd", label: "Splňuje podmínky" },
                      not_eligible: { icon: <TrendingDown size={12} />, color: "#f59e0b", label: "Podmínky nesplněny" },
                      approved: { icon: <CheckCircle2 size={12} />, color: "#3FC55D", label: "Schváleno" },
                      rejected: { icon: <XCircle size={12} />, color: "#ef4444", label: "Zamítnuto" },
                    };
                    const cfg = eventConfig[entry.event] || eventConfig.eligible;
                    const roleLabels: Record<string, string> = {
                      garant: "Garant",
                      budouci_vedouci: "Budoucí vedoucí",
                      vedouci: "Vedoucí",
                    };

                    return (
                      <div key={entry.id} className="flex items-start gap-3 py-2 relative">
                        <div
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center z-10"
                          style={{ background: isDark ? "hsl(188,18%,18%)" : "#ffffff" }}
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                            style={{ background: cfg.color }}
                          >
                            {cfg.icon}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                              → {roleLabels[entry.requested_role] || entry.requested_role}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{entry.note}</p>
                          )}
                          {(entry.cumulative_bj != null || entry.direct_ziskatels != null) && (
                            <p className="text-[10px] mt-0.5" style={{ color: isDark ? "rgba(255,255,255,0.35)" : "#9ca3af" }}>
                              {entry.cumulative_bj != null && `BJ: ${entry.cumulative_bj}`}
                              {entry.cumulative_bj != null && entry.direct_ziskatels != null && " · "}
                              {entry.direct_ziskatels != null && `Struktura: ${entry.direct_ziskatels}`}
                            </p>
                          )}
                          <p className="text-[10px] mt-0.5" style={{ color: isDark ? "rgba(255,255,255,0.3)" : "#b0b8bc" }}>
                            {format(new Date(entry.created_at), "d. MMMM yyyy, HH:mm", { locale: cs })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Divider */}
        <div className="my-4" style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "#E1E9EB" }} />

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {onNotify && (
            <button
              className="btn btn-md btn-ghost w-full flex items-center justify-center gap-2"
              onClick={() => {
                onClose();
                onNotify();
              }}
            >
              <Bell size={16} />
              Poslat připomínku
            </button>
          )}
          <button
            className="btn btn-md btn-secondary w-full flex items-center justify-center gap-2"
            onClick={() => {
              onClose();
              navigate(`/tym/${member.id}/aktivity`);
            }}
          >
            Zobrazit plnou aktivitu
            <ArrowRight size={16} />
          </button>
          {onEdit && (
            <button
              className="btn btn-md btn-ghost w-full flex items-center justify-center gap-2"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              <Pencil size={16} />
              Upravit profil
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
