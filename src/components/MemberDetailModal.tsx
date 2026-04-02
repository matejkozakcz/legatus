import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, formatISO } from "date-fns";
import { X, Loader2, ArrowRight } from "lucide-react";

interface ProfileNode {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface MemberDetailModalProps {
  member: ProfileNode;
  onClose: () => void;
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

function getWeekStart() {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return formatISO(monday, { representation: "date" });
}

export function MemberDetailModal({ member, onClose }: MemberDetailModalProps) {
  const navigate = useNavigate();

  // Close on Escape
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

  const initials = member.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = avatarColors[member.role] || avatarColors.novacek;
  const badge = roleBadgeConfig[member.role] || roleBadgeConfig.novacek;
  const status = { bg: "#3FC55D", shadow: "rgba(63, 197, 93, 0.25)" };

  const stats = [
    { label: "Analýzy", actual: record?.fsa_actual ?? 0, planned: record?.fsa_planned ?? 0 },
    { label: "Pohovory", actual: record?.poh_actual ?? 0, planned: record?.poh_planned ?? 0 },
    { label: "Porádka", actual: record?.por_actual ?? 0, planned: record?.por_planned ?? 0 },
    { label: "Doporučení", actual: record?.ref_actual ?? 0, planned: record?.ref_planned ?? 0 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full mx-4 bg-white rounded-2xl shadow-2xl p-6"
        style={{
          animation: "modalIn 150ms ease-out forwards",
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
                className="rounded-full object-cover"
                style={{ width: 64, height: 64, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
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
            {/* Status dot */}
            <div
              className="absolute"
              style={{
                bottom: 2,
                right: 2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: status.bg,
                boxShadow: `0 0 0 3px #fff, 0 0 0 6px ${status.shadow}`,
              }}
            />
          </div>

          <h3 className="font-heading text-xl font-semibold" style={{ color: "#0A2126" }}>
            {member.full_name}
          </h3>

          <div className="flex items-center gap-2">
            <span className={badge.className}>{badge.label}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4" style={{ height: 1, background: "#E1E9EB" }} />

        {/* Stats */}
        <div>
          <p className="font-heading text-sm font-semibold mb-3" style={{ color: "#0A2126" }}>
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
                    <span className="font-heading text-2xl font-bold leading-none" style={{ color: "#00555f" }}>
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

        {/* Divider */}
        <div className="my-4" style={{ height: 1, background: "#E1E9EB" }} />

        {/* Footer */}
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
