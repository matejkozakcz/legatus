import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap, Plus, Trash2, Check, Pencil, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Copy, Users, CheckCircle2, Clock, X, Save,
} from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

interface TemplateItem {
  title: string;
  default_deadline_days: number;
}

// ─── Template Editor ──────────────────────────────────────────────────────────

function TemplateEditor({
  onClose,
  existingTemplate,
}: {
  onClose: () => void;
  existingTemplate?: { id: string; name: string; items: TemplateItem[] } | null;
}) {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const [name, setName] = useState(existingTemplate?.name || "");
  const [items, setItems] = useState<TemplateItem[]>(
    existingTemplate?.items || [{ title: "", default_deadline_days: 7 }]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.title.trim());
      if (!name.trim() || validItems.length === 0) throw new Error("Vyplňte název a alespoň jeden úkol");
      if (existingTemplate) {
        const { error } = await supabase
          .from("onboarding_templates")
          .update({ name: name.trim(), items: validItems as any })
          .eq("id", existingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("onboarding_templates").insert({
          name: name.trim(),
          items: validItems as any,
          created_by: profile?.id || "",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_templates"] });
      toast.success(existingTemplate ? "Šablona aktualizována" : "Šablona vytvořena");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full mx-4 rounded-2xl shadow-2xl p-6 overflow-y-auto"
        style={{
          maxHeight: "80dvh",
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
          <X size={18} style={{ color: "#89ADB4" }} />
        </button>

        <h3 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          {existingTemplate ? "Upravit šablonu" : "Nová šablona zapracování"}
        </h3>

        <div className="mb-4">
          <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Název šablony</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="např. Standardní zapracování"
            className="w-full text-sm rounded-xl border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
          />
        </div>

        <div className="mb-3">
          <label className="text-xs font-semibold mb-2 block" style={{ color: "var(--text-muted)" }}>Úkoly</label>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="text-xs font-semibold mt-2.5" style={{ color: "var(--text-muted)", minWidth: 20 }}>
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], title: e.target.value };
                    setItems(next);
                  }}
                  placeholder="Název úkolu"
                  className="flex-1 text-sm rounded-lg border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={item.default_deadline_days}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], default_deadline_days: parseInt(e.target.value) || 7 };
                      setItems(next);
                    }}
                    className="w-16 text-sm rounded-lg border border-input bg-background px-2 py-1.5 text-center"
                  />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>dní</span>
                </div>
                <button
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  style={{ marginTop: 6 }}
                >
                  <Trash2 size={14} style={{ color: "#fc7c71" }} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setItems([...items, { title: "", default_deadline_days: 7 }])}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "#00abbd" }}
          >
            <Plus size={14} /> Přidat úkol
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn btn-md btn-ghost flex-1">Zrušit</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn btn-md flex-1"
            style={{ background: "#00abbd", color: "white", border: "none" }}
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            <span className="ml-2">Uložit</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Template Modal ────────────────────────────────────────────────────

function AssignTemplateModal({
  novacek,
  templates,
  onClose,
}: {
  novacek: { id: string; full_name: string };
  templates: any[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [items, setItems] = useState<Array<{ title: string; deadline: string }>>([]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t: any) => t.id === templateId);
    if (template) {
      const today = new Date();
      const templateItems = (template.items as TemplateItem[]).map((item) => ({
        title: item.title,
        deadline: format(new Date(today.getTime() + item.default_deadline_days * 86400000), "yyyy-MM-dd"),
      }));
      setItems(templateItems);
    }
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      const rows = items
        .filter((i) => i.title.trim())
        .map((item, idx) => ({
          novacek_id: novacek.id,
          title: item.title,
          deadline: item.deadline || null,
          sort_order: idx,
          created_by: profile?.id || "",
        }));
      if (rows.length === 0) throw new Error("Žádné úkoly k přidělení");
      const { error } = await supabase.from("onboarding_tasks").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks"] });
      toast.success(`Plán zapracování přidělen: ${novacek.full_name}`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full mx-4 rounded-2xl shadow-2xl p-6 overflow-y-auto"
        style={{
          maxHeight: "80dvh",
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100">
          <X size={18} style={{ color: "#89ADB4" }} />
        </button>

        <h3 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Přidělit plán zapracování
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          {novacek.full_name}
        </p>

        <div className="mb-4">
          <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Vyberte šablonu</label>
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="w-full text-sm rounded-xl border border-input bg-background px-3 py-2"
          >
            <option value="">Vyberte šablonu…</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {items.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-semibold mb-2 block" style={{ color: "var(--text-muted)" }}>
              Upravte termíny pro {novacek.full_name.split(" ")[0]}
            </label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", minWidth: 20 }}>{idx + 1}.</span>
                  <span className="flex-1 text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.title}</span>
                  <input
                    type="date"
                    value={item.deadline}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], deadline: e.target.value };
                      setItems(next);
                    }}
                    className="text-xs rounded-lg border border-input bg-background px-2 py-1.5 w-36"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn btn-md btn-ghost flex-1">Zrušit</button>
          <button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending || items.length === 0}
            className="btn btn-md flex-1"
            style={{ background: "#00abbd", color: "white", border: "none", opacity: items.length === 0 ? 0.4 : 1 }}
          >
            {assignMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            <span className="ml-2">Přidělit plán</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Management Page ─────────────────────────────────────────────────────

export default function ZapracovaniManagement() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"novacci" | "sablony">("novacci");
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [expandedNovacek, setExpandedNovacek] = useState<string | null>(null);
  const [assigningNovacek, setAssigningNovacek] = useState<{ id: string; full_name: string } | null>(null);

  // Task editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDeadline, setEditDeadline] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");

  // Fetch all novacek members in subtree
  const { data: novacci = [], isLoading: isNovacciLoading } = useQuery({
    queryKey: ["novacci_list", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url, created_at")
        .eq("role", "novacek")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Fetch ALL onboarding tasks for all novacci
  const { data: allTasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ["onboarding_all_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_tasks")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Templates
  const { data: templates = [], isLoading: isTemplatesLoading } = useQuery({
    queryKey: ["onboarding_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_templates"] });
      toast.success("Šablona smazána");
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { error } = await supabase.from("onboarding_tasks").update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
    },
  });

  const updateDeadlineMutation = useMutation({
    mutationFn: async ({ taskId, deadline }: { taskId: string; deadline: string }) => {
      const { error } = await supabase.from("onboarding_tasks").update({ deadline: deadline || null }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      setEditingTaskId(null);
      toast.success("Deadline aktualizován");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("onboarding_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      toast.success("Úkol smazán");
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ novacekId }: { novacekId: string }) => {
      const existingTasks = allTasks.filter((t: any) => t.novacek_id === novacekId);
      const maxOrder = existingTasks.length > 0 ? Math.max(...existingTasks.map((t: any) => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("onboarding_tasks").insert({
        novacek_id: novacekId,
        title: newTaskTitle.trim(),
        deadline: newTaskDeadline || null,
        sort_order: maxOrder,
        created_by: profile?.id || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      setNewTaskTitle("");
      setNewTaskDeadline("");
      toast.success("Úkol přidán");
    },
  });

  // Group tasks by novacek
  const tasksByNovacek = new Map<string, any[]>();
  allTasks.forEach((t: any) => {
    if (!tasksByNovacek.has(t.novacek_id)) tasksByNovacek.set(t.novacek_id, []);
    tasksByNovacek.get(t.novacek_id)!.push(t);
  });

  const novacciWithoutPlan = novacci.filter((n: any) => !tasksByNovacek.has(n.id));
  const novacciWithPlan = novacci.filter((n: any) => tasksByNovacek.has(n.id));

  const isLoading = isNovacciLoading || isTasksLoading;

  const tabStyle = (active: boolean) => ({
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600 as const,
    fontFamily: "Poppins, sans-serif",
    background: active ? (isDark ? "rgba(0,171,189,0.15)" : "rgba(0,171,189,0.1)") : "transparent",
    color: active ? "#00abbd" : "var(--text-muted)",
    transition: "all 0.2s",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <GraduationCap className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
          ZAPRACOVÁNÍ
        </h1>
      </div>

      {/* Alert for novacci without plan */}
      {novacciWithoutPlan.length > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{
            background: isDark ? "rgba(252,124,113,0.08)" : "rgba(252,124,113,0.06)",
            border: "1px solid rgba(252,124,113,0.25)",
          }}
        >
          <AlertTriangle size={20} style={{ color: "#fc7c71", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#fc7c71" }}>
              {novacciWithoutPlan.length} {novacciWithoutPlan.length === 1 ? "nováček nemá" : "nováčci nemají"} přidělený plán zapracování
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {novacciWithoutPlan.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => setAssigningNovacek({ id: n.id, full_name: n.full_name })}
                  className="text-xs font-semibold px-2 py-1 rounded-lg"
                  style={{ background: "rgba(252,124,113,0.12)", color: "#fc7c71", border: "none", cursor: "pointer" }}
                >
                  {n.full_name} — Přidělit plán
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button style={tabStyle(activeTab === "novacci")} onClick={() => setActiveTab("novacci")}>
          <Users size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Nováčci ({novacci.length})
        </button>
        <button style={tabStyle(activeTab === "sablony")} onClick={() => setActiveTab("sablony")}>
          <Copy size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
          Šablony ({templates.length})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={32} style={{ color: "#00abbd" }} />
        </div>
      ) : activeTab === "novacci" ? (
        <div className="space-y-3">
          {novacci.length === 0 ? (
            <div className="legatus-card p-8 text-center" style={{ color: "var(--text-muted)" }}>
              <Users size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p className="font-heading font-semibold text-base">Žádní nováčci v týmu</p>
            </div>
          ) : (
            novacci.map((n: any) => {
              const tasks = tasksByNovacek.get(n.id) || [];
              const hasPlan = tasks.length > 0;
              const completedCount = tasks.filter((t: any) => t.completed).length;
              const progress = hasPlan ? Math.round((completedCount / tasks.length) * 100) : 0;
              const isExpanded = expandedNovacek === n.id;
              const overdueTasks = tasks.filter((t: any) => !t.completed && t.deadline && new Date(t.deadline) < new Date());
              const initials = n.full_name.split(" ").map((s: string) => s[0]).join("").toUpperCase().slice(0, 2);

              return (
                <div
                  key={n.id}
                  className="legatus-card overflow-hidden"
                  style={{ border: overdueTasks.length > 0 ? "1px solid rgba(252,124,113,0.3)" : undefined }}
                >
                  <button
                    onClick={() => setExpandedNovacek(isExpanded ? null : n.id)}
                    style={{
                      width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
                      background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    {n.avatar_url ? (
                      <img src={n.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "#fff2f1", color: "#e05a50" }}
                      >
                        <span className="text-xs font-semibold">{initials}</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-heading font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                        {n.full_name}
                      </div>
                      {hasPlan ? (
                        <div className="flex items-center gap-2 mt-1">
                          <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, background: isDark ? "rgba(255,255,255,0.1)" : "#E1E9EB", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${progress}%`, borderRadius: 3, background: progress >= 100 ? "#3FC55D" : "#00abbd", transition: "width 0.3s" }} />
                          </div>
                          <span className="text-[11px] font-semibold" style={{ color: progress >= 100 ? "#3FC55D" : "#00abbd" }}>
                            {progress}% ({completedCount}/{tasks.length})
                          </span>
                          {overdueTasks.length > 0 && (
                            <span className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "#fc7c71" }}>
                              <AlertTriangle size={11} /> {overdueTasks.length} zpoždění
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold" style={{ color: "#fc7c71" }}>
                          Bez plánu zapracování
                        </span>
                      )}
                    </div>
                    {!hasPlan && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssigningNovacek({ id: n.id, full_name: n.full_name }); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: "#00abbd", color: "white", border: "none", cursor: "pointer" }}
                      >
                        Přidělit plán
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={16} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />}
                  </button>

                  {isExpanded && hasPlan && (
                    <div style={{ padding: "0 18px 18px", borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #f0f4f5" }}>
                      <div className="space-y-1.5 mt-3">
                        {tasks.map((task: any) => {
                          const isOverdue = task.deadline && !task.completed && new Date(task.deadline) < new Date();
                          const isEditingThis = editingTaskId === task.id;
                          return (
                            <div
                              key={task.id}
                              className="flex items-center gap-2 rounded-lg"
                              style={{
                                padding: "6px 10px",
                                background: isOverdue ? (isDark ? "rgba(252,124,113,0.06)" : "rgba(252,124,113,0.04)") : "transparent",
                              }}
                            >
                              <button
                                onClick={() => toggleTaskMutation.mutate({ taskId: task.id, completed: !task.completed })}
                                style={{
                                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                  border: task.completed ? "none" : "2px solid #b8cfd4",
                                  background: task.completed ? "#3FC55D" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                {task.completed && <Check size={10} color="white" />}
                              </button>
                              <span className="flex-1 text-xs" style={{
                                color: "var(--text-primary)",
                                textDecoration: task.completed ? "line-through" : "none",
                                opacity: task.completed ? 0.5 : 1,
                              }}>
                                {task.title}
                              </span>
                              {isEditingThis ? (
                                <div className="flex gap-1">
                                  <input
                                    type="date"
                                    value={editDeadline}
                                    onChange={(e) => setEditDeadline(e.target.value)}
                                    className="text-[10px] rounded border border-input bg-background px-1 py-0.5 w-28"
                                  />
                                  <button onClick={() => updateDeadlineMutation.mutate({ taskId: task.id, deadline: editDeadline })}>
                                    <Check size={12} style={{ color: "#3FC55D" }} />
                                  </button>
                                  <button onClick={() => setEditingTaskId(null)}>
                                    <X size={12} style={{ color: "#fc7c71" }} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingTaskId(task.id); setEditDeadline(task.deadline || ""); }}
                                  className="text-[10px] font-medium"
                                  style={{ color: isOverdue ? "#fc7c71" : "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                                >
                                  {task.deadline ? format(new Date(task.deadline), "d.M.yyyy") : "Bez deadline"}
                                </button>
                              )}
                              <button
                                onClick={() => deleteTaskMutation.mutate(task.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                              >
                                <Trash2 size={12} style={{ color: "#fc7c71", opacity: 0.5 }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add task inline */}
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={expandedNovacek === n.id ? newTaskTitle : ""}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Nový úkol…"
                          className="flex-1 text-xs rounded-lg border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
                        />
                        <input
                          type="date"
                          value={expandedNovacek === n.id ? newTaskDeadline : ""}
                          onChange={(e) => setNewTaskDeadline(e.target.value)}
                          className="text-xs rounded-lg border border-input bg-background px-2 py-1.5 w-28"
                        />
                        <button
                          onClick={() => {
                            if (newTaskTitle.trim()) addTaskMutation.mutate({ novacekId: n.id });
                          }}
                          disabled={!newTaskTitle.trim()}
                          className="flex items-center justify-center rounded-lg"
                          style={{ width: 28, height: 28, background: "#00abbd", border: "none", cursor: "pointer", opacity: newTaskTitle.trim() ? 1 : 0.4 }}
                        >
                          <Plus size={12} color="white" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Templates tab */
        <div className="space-y-3">
          <button
            onClick={() => { setEditingTemplate(null); setTemplateEditorOpen(true); }}
            className="btn btn-md flex items-center gap-2"
            style={{ background: "#00abbd", color: "white", border: "none" }}
          >
            <Plus size={16} /> Nová šablona
          </button>

          {isTemplatesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={24} style={{ color: "#00abbd" }} /></div>
          ) : templates.length === 0 ? (
            <div className="legatus-card p-8 text-center" style={{ color: "var(--text-muted)" }}>
              <Copy size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p className="font-heading font-semibold text-base">Zatím žádné šablony</p>
              <p className="text-sm mt-1">Vytvořte šablonu pro standardní plán zapracování.</p>
            </div>
          ) : (
            templates.map((template: any) => {
              const items = (template.items as TemplateItem[]) || [];
              return (
                <div key={template.id} className="legatus-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-heading font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {template.name}
                    </h4>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingTemplate(template); setTemplateEditorOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Pencil size={13} style={{ color: "#00abbd" }} />
                      </button>
                      <button
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Trash2 size={13} style={{ color: "#fc7c71" }} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span className="font-semibold" style={{ color: "var(--text-muted)", minWidth: 18 }}>{idx + 1}.</span>
                        <span className="flex-1">{item.title}</span>
                        <span style={{ color: "var(--text-muted)" }}>+{item.default_deadline_days} dní</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modals */}
      {templateEditorOpen && (
        <TemplateEditor
          onClose={() => { setTemplateEditorOpen(false); setEditingTemplate(null); }}
          existingTemplate={editingTemplate}
        />
      )}
      {assigningNovacek && (
        <AssignTemplateModal
          novacek={assigningNovacek}
          templates={templates}
          onClose={() => setAssigningNovacek(null)}
        />
      )}
    </div>
  );
}
