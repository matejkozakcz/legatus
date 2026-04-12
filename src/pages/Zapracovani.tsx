import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Check, ChevronDown, ChevronUp, Clock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { format, isPast, isToday, addDays } from "date-fns";
import { cs } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

interface OnboardingTask {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  deadline: string | null;
  completed: boolean;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  novacek_id: string;
}

export default function Zapracovani() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["onboarding_tasks", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("onboarding_tasks")
        .select("*")
        .eq("novacek_id", profile.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as OnboardingTask[];
    },
    enabled: !!profile?.id,
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("onboarding_tasks")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("novacek_id", profile?.id || "");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks"] });
      toast.success("Úkol splněn! 🎉");
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ taskId, note }: { taskId: string; note: string }) => {
      const { error } = await supabase
        .from("onboarding_tasks")
        .update({ description: note || null })
        .eq("id", taskId)
        .eq("novacek_id", profile?.id || "");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks"] });
      setEditingNote(null);
      toast.success("Poznámka uložena");
    },
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const getTaskStatus = (task: OnboardingTask) => {
    if (task.completed) return "completed";
    if (task.deadline && isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline))) return "overdue";
    if (task.deadline) {
      const twoDaysBefore = addDays(new Date(), 2);
      if (new Date(task.deadline) <= twoDaysBefore) return "soon";
    }
    return "pending";
  };

  const statusConfig = {
    completed: { color: "#3FC55D", icon: CheckCircle2, label: "Splněno" },
    overdue: { color: "#fc7c71", icon: AlertTriangle, label: "Zpoždění" },
    soon: { color: "#f59e0b", icon: Clock, label: "Blíží se deadline" },
    pending: { color: "#00abbd", icon: Clock, label: "Čeká na splnění" },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} style={{ color: "#00abbd" }} />
      </div>
    );
  }

  // No plan assigned — show waiting state
  if (!isLoading && tasks.length === 0) {
    return (
      <div className={isMobile ? "mobile-page" : "space-y-6"} style={isMobile ? { paddingBottom: 160, paddingTop: 16 } : undefined}>
        <div className={isMobile ? "" : "flex items-center gap-4"}>
          {!isMobile && <GraduationCap className="h-6 w-6" style={{ color: "var(--text-primary)" }} />}
          <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)", fontFamily: "Poppins, sans-serif" }}>
            {isMobile ? "Zapracování" : "ZAPRACOVÁNÍ"}
          </h1>
        </div>
        <div
          className="legatus-card"
          style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}
        >
          <Clock size={48} style={{ margin: "0 auto 16px", opacity: 0.3, color: "#00abbd" }} />
          <p className="font-heading font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
            Čekám na přidělení plánu zapracování
          </p>
          <p className="text-sm mt-2" style={{ maxWidth: 320, margin: "8px auto 0" }}>
            Tvůj vedoucí ti brzy přidělí zapracovací plán s konkrétními úkoly a termíny.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={isMobile ? "mobile-page" : "space-y-6"} style={isMobile ? { paddingBottom: 160 } : undefined}>
      {/* Header */}
      <div className={isMobile ? "" : "flex items-center gap-4"} style={isMobile ? { paddingTop: 16, paddingBottom: 8 } : undefined}>
        {!isMobile && <GraduationCap className="h-6 w-6" style={{ color: "var(--text-primary)" }} />}
        <h1
          className="font-heading font-bold"
          style={{
            fontSize: 28,
            color: "var(--text-primary)",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {isMobile ? "Zapracování" : "ZAPRACOVÁNÍ"}
        </h1>
      </div>

      {/* Progress overview */}
      <div
        style={{
          background: "linear-gradient(135deg, #00555f 0%, #007a84 100%)",
          borderRadius: isMobile ? 20 : 16,
          padding: isMobile ? "16px 16px 14px" : "20px 24px",
          marginBottom: isMobile ? 12 : 0,
          color: "white",
          boxShadow: "0 4px 24px rgba(0,85,95,0.28)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>
          Postup k pozici Získatele
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 10,
                borderRadius: 5,
                background: "rgba(255,255,255,0.2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  borderRadius: 5,
                  background: progress >= 100 ? "#3FC55D" : "#00abbd",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 22 }}>
            {progress}%
          </span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {completedTasks} z {totalTasks} úkolů splněno
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div
          className="legatus-card"
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <GraduationCap size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p className="font-heading font-semibold" style={{ fontSize: 16 }}>
            Zatím nemáš žádné úkoly
          </p>
          <p className="text-sm mt-1">Tvůj vedoucí ti brzy přidělí zapracovací plán.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 10 }}>
          {tasks.map((task, idx) => {
            const status = getTaskStatus(task);
            const cfg = statusConfig[status];
            const StatusIcon = cfg.icon;
            const isExpanded = expandedId === task.id;
            const isEditingThisNote = editingNote === task.id;

            return (
              <div
                key={task.id}
                style={{
                  background: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
                  border: isDark
                    ? `1px solid ${status === "overdue" ? "rgba(252,124,113,0.3)" : "rgba(255,255,255,0.08)"}`
                    : `1px solid ${status === "overdue" ? "rgba(252,124,113,0.3)" : "#E1E9EB"}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  transition: "all 0.2s",
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                  style={{
                    width: "100%",
                    padding: isMobile ? "12px 14px" : "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {/* Status icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: status === "completed" ? "rgba(63,197,93,0.12)" : status === "overdue" ? "rgba(252,124,113,0.12)" : "rgba(0,171,189,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <StatusIcon size={16} color={cfg.color} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        textDecoration: task.completed ? "line-through" : "none",
                        opacity: task.completed ? 0.6 : 1,
                      }}
                    >
                      {idx + 1}. {task.title}
                    </div>
                    {task.deadline && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: status === "overdue" ? "#fc7c71" : "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        Deadline: {format(new Date(task.deadline), "d. MMMM yyyy", { locale: cs })}
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  {isExpanded ? (
                    <ChevronUp size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  )}
                </button>

                {/* Expanded area */}
                {isExpanded && (
                  <div
                    style={{
                      padding: isMobile ? "0 14px 14px" : "0 18px 18px",
                      borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #f0f4f5",
                      paddingTop: 12,
                    }}
                  >
                    {/* Note field */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Poznámka
                      </div>
                      {isEditingThisNote ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            placeholder="Odkaz, místo, poznámka..."
                            className="flex-1 text-sm rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
                            autoFocus
                          />
                          <button
                            onClick={() => saveNoteMutation.mutate({ taskId: task.id, note: noteValue })}
                            className="btn btn-sm btn-primary"
                            disabled={saveNoteMutation.isPending}
                          >
                            Uložit
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingNote(task.id);
                            setNoteValue(task.description || "");
                          }}
                          style={{
                            fontSize: 13,
                            color: task.description ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                            textAlign: "left",
                          }}
                        >
                          {task.description || "Přidat poznámku..."}
                        </button>
                      )}
                    </div>

                    {/* Status label */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: cfg.color,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <StatusIcon size={13} />
                        {cfg.label}
                        {task.completed_at && ` — ${format(new Date(task.completed_at), "d.M.yyyy", { locale: cs })}`}
                      </span>

                      {!task.completed && (
                        <button
                          onClick={() => completeMutation.mutate(task.id)}
                          disabled={completeMutation.isPending}
                          className="btn btn-sm"
                          style={{
                            background: "#3FC55D",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            padding: "6px 14px",
                            fontSize: 13,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: "pointer",
                          }}
                        >
                          <Check size={14} />
                          Splnit
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
