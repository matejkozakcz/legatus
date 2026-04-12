import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap, Plus, Trash2, Check, Pencil, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Copy, Users, X, Save, GripVertical, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

interface TemplateItem {
  title: string;
  note: string;
}

interface AssignItem {
  title: string;
  note: string;
  deadline: string;
  deadline_time: string;
}

// ─── Draggable Task Card ──────────────────────────────────────────────────────

function DraggableTaskCard({
  index,
  isDark,
  children,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  index: number;
  isDark: boolean;
  children: React.ReactNode;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (idx: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      style={{
        position: "relative",
        paddingLeft: 24,
      }}
    >
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: 7,
          top: 0,
          bottom: 0,
          width: 2,
          background: isDark ? "rgba(0,171,189,0.2)" : "rgba(0,171,189,0.15)",
        }}
      />
      {/* Dot on the line */}
      <div
        style={{
          position: "absolute",
          left: 2,
          top: 20,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#00abbd",
          border: `2px solid ${isDark ? "hsl(188,18%,18%)" : "#ffffff"}`,
          zIndex: 1,
        }}
      />
      <div
        style={{
          background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafa",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E1E9EB",
          borderRadius: 14,
          padding: "14px 16px",
          cursor: "grab",
          transition: "box-shadow 0.15s",
        }}
        className="hover:shadow-md"
      >
        {children}
      </div>
    </div>
  );
}

// ─── useDragReorder Hook ──────────────────────────────────────────────────────

function useDragReorder<T>(items: T[], setItems: (items: T[]) => void) {
  const dragIdx = useRef<number | null>(null);

  const onDragStart = useCallback((idx: number) => {
    dragIdx.current = idx;
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, _idx: number) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (targetIdx: number) => {
      if (dragIdx.current === null || dragIdx.current === targetIdx) return;
      const next = [...items];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(targetIdx, 0, moved);
      setItems(next);
      dragIdx.current = null;
    },
    [items, setItems]
  );

  const onDragEnd = useCallback(() => {
    dragIdx.current = null;
  }, []);

  return { onDragStart, onDragOver, onDrop, onDragEnd };
}

// ─── Confirmation Dialog ──────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  isDark,
  isLoading,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDark: boolean;
  isLoading?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="max-w-sm w-full mx-4 rounded-2xl shadow-2xl p-6"
        style={{
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="font-heading font-semibold text-base mb-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </h4>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: "transparent",
              border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #d0d8da",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Zrušit
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "#00abbd", color: "white", border: "none", cursor: "pointer" }}
          >
            {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
            Potvrdit
          </button>
        </div>
      </div>
    </div>
  );
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
    existingTemplate?.items?.map((i: any) => ({ title: i.title || "", note: i.note || "" })) || [{ title: "", note: "" }]
  );
  const [showConfirm, setShowConfirm] = useState(false);

  const { onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(items, setItems);

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

  const canSave = name.trim() && items.some((i) => i.title.trim());

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        <div
          className="relative max-w-lg w-full mx-4 rounded-2xl shadow-2xl p-6 overflow-y-auto"
          style={{
            maxHeight: "85dvh",
            background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted transition-colors" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
            <X size={18} style={{ color: "var(--text-muted)" }} />
          </button>

          <h3 className="font-heading text-lg font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
            {existingTemplate ? "Upravit šablonu" : "Nová šablona zapracování"}
          </h3>

          {/* Name */}
          <div className="mb-5">
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Název šablony
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. Standardní zapracování"
              className="w-full text-sm rounded-xl border border-input bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#00abbd]/30"
              style={{ fontWeight: 500 }}
            />
          </div>

          {/* Tasks timeline */}
          <div className="mb-4">
            <label className="text-xs font-semibold mb-3 block" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Úkoly ({items.filter((i) => i.title.trim()).length})
            </label>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <DraggableTaskCard
                  key={idx}
                  index={idx}
                  isDark={isDark}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical size={14} style={{ color: "var(--text-muted)", opacity: 0.4, marginTop: 4, flexShrink: 0, cursor: "grab" }} />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: "#00abbd", minWidth: 18 }}>{idx + 1}.</span>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setItems(next);
                          }}
                          placeholder="Název úkolu"
                          className="flex-1 text-sm font-medium rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                        />
                      </div>
                      <div className="flex items-start gap-2 ml-5">
                        <FileText size={12} style={{ color: "var(--text-muted)", opacity: 0.5, marginTop: 6, flexShrink: 0 }} />
                        <input
                          type="text"
                          value={item.note}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], note: e.target.value };
                            setItems(next);
                          }}
                          placeholder="Poznámka (volitelné) — odkaz, instrukce..."
                          className="flex-1 text-xs rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                          style={{ color: "var(--text-secondary)" }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                      style={{ border: "none", background: "transparent", cursor: "pointer", marginTop: 2 }}
                    >
                      <Trash2 size={14} style={{ color: "#fc7c71" }} />
                    </button>
                  </div>
                </DraggableTaskCard>
              ))}
            </div>
            <button
              onClick={() => setItems([...items, { title: "", note: "" }])}
              className="mt-3 ml-6 flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-muted transition-colors"
              style={{ color: "#00abbd", border: "none", background: "transparent", cursor: "pointer" }}
            >
              <Plus size={14} /> Přidat úkol
            </button>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: "transparent",
                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #d0d8da",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Zrušit
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: "#00abbd",
                color: "white",
                border: "none",
                cursor: canSave ? "pointer" : "not-allowed",
                opacity: canSave ? 1 : 0.4,
              }}
            >
              <Save size={14} />
              Uložit šablonu
            </button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Uložit šablonu?"
          message={`Šablona "${name.trim()}" s ${items.filter((i) => i.title.trim()).length} úkoly bude ${existingTemplate ? "aktualizována" : "vytvořena"}.`}
          onConfirm={() => { setShowConfirm(false); saveMutation.mutate(); }}
          onCancel={() => setShowConfirm(false)}
          isDark={isDark}
          isLoading={saveMutation.isPending}
        />
      )}
    </>
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
  const [items, setItems] = useState<AssignItem[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const { onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(items, setItems);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t: any) => t.id === templateId);
    if (template) {
      const templateItems = (template.items as TemplateItem[]).map((item) => ({
        title: item.title,
        note: item.note || "",
        deadline: "",
        deadline_time: "",
      }));
      setItems(templateItems);
    }
  };

  const allDatesSet = items.length > 0 && items.every((i) => i.title.trim() && i.deadline);

  const assignMutation = useMutation({
    mutationFn: async () => {
      const rows = items
        .filter((i) => i.title.trim() && i.deadline)
        .map((item, idx) => ({
          novacek_id: novacek.id,
          title: item.title,
          description: item.note || null,
          deadline: item.deadline,
          deadline_time: item.deadline_time || null,
          sort_order: idx,
          created_by: profile?.id || "",
        }));
      if (rows.length === 0) throw new Error("Vyplňte datum u všech úkolů");
      const { error } = await supabase.from("onboarding_tasks").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding_tasks"] });
      toast.success(`Plán zapracování přidělen: ${novacek.full_name}`);
      // Notify nováček + garant
      supabase.functions.invoke("check-onboarding", {
        body: { type: "plan_assigned", novacek_id: novacek.id, sender_id: profile?.id },
      }).catch(() => {});
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        <div
          className="relative max-w-lg w-full mx-4 rounded-2xl shadow-2xl p-6 overflow-y-auto"
          style={{
            maxHeight: "85dvh",
            background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted transition-colors" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
            <X size={18} style={{ color: "var(--text-muted)" }} />
          </button>

          <h3 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Přidělit plán zapracování
          </h3>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            {novacek.full_name}
          </p>

          {/* Template select */}
          <div className="mb-5">
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Vyberte šablonu
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full text-sm rounded-xl border border-input bg-background px-4 py-2.5"
              style={{ fontWeight: 500 }}
            >
              <option value="">Vyberte šablonu…</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Tasks timeline */}
          {items.length > 0 && (
            <div className="mb-4">
              <label className="text-xs font-semibold mb-3 block" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Nastavte termíny ({items.filter((i) => i.deadline).length}/{items.length})
              </label>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <DraggableTaskCard
                    key={idx}
                    index={idx}
                    isDark={isDark}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} style={{ color: "var(--text-muted)", opacity: 0.4, marginTop: 4, flexShrink: 0, cursor: "grab" }} />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: "#00abbd", minWidth: 18 }}>{idx + 1}.</span>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], title: e.target.value };
                              setItems(next);
                            }}
                            placeholder="Název úkolu"
                            className="flex-1 text-sm font-medium rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                          />
                        </div>
                        <div className="flex items-start gap-2 ml-5">
                          <FileText size={12} style={{ color: "var(--text-muted)", opacity: 0.5, marginTop: 6, flexShrink: 0 }} />
                          <input
                            type="text"
                            value={item.note}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], note: e.target.value };
                              setItems(next);
                            }}
                            placeholder="Poznámka (volitelné)"
                            className="flex-1 text-xs rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                            style={{ color: "var(--text-secondary)" }}
                          />
                        </div>
                        <div className="flex items-center gap-2 ml-5">
                          <input
                            type="date"
                            value={item.deadline}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], deadline: e.target.value };
                              setItems(next);
                            }}
                            className="text-xs rounded-lg border border-input bg-background px-3 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                            required
                          />
                          <input
                            type="time"
                            value={item.deadline_time}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...next[idx], deadline_time: e.target.value };
                              setItems(next);
                            }}
                            className="text-xs rounded-lg border border-input bg-background px-3 py-1.5 w-24 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                          />
                          {!item.deadline && (
                            <span className="text-[10px] font-semibold" style={{ color: "#fc7c71" }}>Datum je povinné</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                        style={{ border: "none", background: "transparent", cursor: "pointer", marginTop: 2 }}
                      >
                        <Trash2 size={14} style={{ color: "#fc7c71" }} />
                      </button>
                    </div>
                  </DraggableTaskCard>
                ))}
              </div>
              <button
                onClick={() => setItems([...items, { title: "", note: "", deadline: "", deadline_time: "" }])}
                className="mt-3 ml-6 flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg hover:bg-muted transition-colors"
                style={{ color: "#00abbd", border: "none", background: "transparent", cursor: "pointer" }}
              >
                <Plus size={14} /> Přidat úkol
              </button>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: "transparent",
                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #d0d8da",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Zrušit
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!allDatesSet}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: "#00abbd",
                color: "white",
                border: "none",
                cursor: allDatesSet ? "pointer" : "not-allowed",
                opacity: allDatesSet ? 1 : 0.4,
              }}
            >
              <Check size={14} />
              Přidělit plán
            </button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Přidělit plán zapracování?"
          message={`Plán s ${items.filter((i) => i.title.trim() && i.deadline).length} úkoly bude přidělen uživateli ${novacek.full_name}.`}
          onConfirm={() => { setShowConfirm(false); assignMutation.mutate(); }}
          onCancel={() => setShowConfirm(false)}
          isDark={isDark}
          isLoading={assignMutation.isPending}
        />
      )}
    </>
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
  const [editDeadlineTime, setEditDeadlineTime] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskNote, setNewTaskNote] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskDeadlineTime, setNewTaskDeadlineTime] = useState("");

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
    mutationFn: async ({ taskId, deadline, deadline_time }: { taskId: string; deadline: string; deadline_time: string }) => {
      if (!deadline) throw new Error("Datum je povinné");
      const { error } = await supabase.from("onboarding_tasks").update({
        deadline,
        deadline_time: deadline_time || null,
      }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      setEditingTaskId(null);
      toast.success("Deadline aktualizován");
    },
    onError: (e: any) => toast.error(e.message),
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
      if (!newTaskDeadline) throw new Error("Datum je povinné");
      const existingTasks = allTasks.filter((t: any) => t.novacek_id === novacekId);
      const maxOrder = existingTasks.length > 0 ? Math.max(...existingTasks.map((t: any) => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("onboarding_tasks").insert({
        novacek_id: novacekId,
        title: newTaskTitle.trim(),
        description: newTaskNote.trim() || null,
        deadline: newTaskDeadline,
        deadline_time: newTaskDeadlineTime || null,
        sort_order: maxOrder,
        created_by: profile?.id || "",
      });
      if (error) throw error;
      return { novacekId, title: newTaskTitle.trim() };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_all_tasks"] });
      // Notify nováček about new task
      supabase.functions.invoke("check-onboarding", {
        body: { type: "task_added", novacek_id: result.novacekId, sender_id: profile?.id, task_title: result.title },
      }).catch(() => {});
      setNewTaskTitle("");
      setNewTaskNote("");
      setNewTaskDeadline("");
      setNewTaskDeadlineTime("");
      toast.success("Úkol přidán");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Group tasks by novacek
  const tasksByNovacek = new Map<string, any[]>();
  allTasks.forEach((t: any) => {
    if (!tasksByNovacek.has(t.novacek_id)) tasksByNovacek.set(t.novacek_id, []);
    tasksByNovacek.get(t.novacek_id)!.push(t);
  });

  const novacciWithoutPlan = novacci.filter((n: any) => !tasksByNovacek.has(n.id));

  const isLoading = isNovacciLoading || isTasksLoading;

  const formatDeadline = (deadline: string | null, deadline_time: string | null) => {
    if (!deadline) return "Bez deadline";
    const dateStr = format(new Date(deadline), "d.M.yyyy");
    if (deadline_time) return `${dateStr} ${deadline_time.slice(0, 5)}`;
    return dateStr;
  };

  const tabStyle = (active: boolean) => ({
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer" as const,
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
                              className="rounded-lg"
                              style={{
                                padding: "8px 10px",
                                background: isOverdue ? (isDark ? "rgba(252,124,113,0.06)" : "rgba(252,124,113,0.04)") : "transparent",
                              }}
                            >
                              <div className="flex items-center gap-2">
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
                                  fontWeight: 500,
                                }}>
                                  {task.title}
                                </span>
                                {isEditingThis ? (
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="date"
                                      value={editDeadline}
                                      onChange={(e) => setEditDeadline(e.target.value)}
                                      className="text-[10px] rounded border border-input bg-background px-1 py-0.5 w-28"
                                    />
                                    <input
                                      type="time"
                                      value={editDeadlineTime}
                                      onChange={(e) => setEditDeadlineTime(e.target.value)}
                                      className="text-[10px] rounded border border-input bg-background px-1 py-0.5 w-20"
                                    />
                                    <button
                                      onClick={() => updateDeadlineMutation.mutate({ taskId: task.id, deadline: editDeadline, deadline_time: editDeadlineTime })}
                                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                                    >
                                      <Check size={12} style={{ color: "#3FC55D" }} />
                                    </button>
                                    <button onClick={() => setEditingTaskId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                                      <X size={12} style={{ color: "#fc7c71" }} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditingTaskId(task.id); setEditDeadline(task.deadline || ""); setEditDeadlineTime(task.deadline_time || ""); }}
                                    className="text-[10px] font-medium"
                                    style={{ color: isOverdue ? "#fc7c71" : "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                                  >
                                    {formatDeadline(task.deadline, task.deadline_time)}
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteTaskMutation.mutate(task.id)}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                                >
                                  <Trash2 size={12} style={{ color: "#fc7c71", opacity: 0.5 }} />
                                </button>
                              </div>
                              {task.description && (
                                <div className="ml-6 mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  <FileText size={10} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                                  {task.description}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add task inline */}
                      <div className="mt-3 space-y-2 p-3 rounded-xl" style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#f8fafa", border: isDark ? "1px dashed rgba(255,255,255,0.08)" : "1px dashed #d0d8da" }}>
                        <input
                          type="text"
                          value={expandedNovacek === n.id ? newTaskTitle : ""}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Název nového úkolu…"
                          className="w-full text-xs rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                        />
                        <input
                          type="text"
                          value={expandedNovacek === n.id ? newTaskNote : ""}
                          onChange={(e) => setNewTaskNote(e.target.value)}
                          placeholder="Poznámka (volitelné)"
                          className="w-full text-xs rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00abbd]/40"
                        />
                        <div className="flex gap-2 items-center">
                          <input
                            type="date"
                            value={expandedNovacek === n.id ? newTaskDeadline : ""}
                            onChange={(e) => setNewTaskDeadline(e.target.value)}
                            className="text-xs rounded-lg border border-input bg-background px-2 py-1.5 w-32"
                            required
                          />
                          <input
                            type="time"
                            value={expandedNovacek === n.id ? newTaskDeadlineTime : ""}
                            onChange={(e) => setNewTaskDeadlineTime(e.target.value)}
                            className="text-xs rounded-lg border border-input bg-background px-2 py-1.5 w-20"
                          />
                          <button
                            onClick={() => {
                              if (newTaskTitle.trim() && newTaskDeadline) addTaskMutation.mutate({ novacekId: n.id });
                            }}
                            disabled={!newTaskTitle.trim() || !newTaskDeadline}
                            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{
                              background: "#00abbd",
                              color: "white",
                              border: "none",
                              cursor: (newTaskTitle.trim() && newTaskDeadline) ? "pointer" : "not-allowed",
                              opacity: (newTaskTitle.trim() && newTaskDeadline) ? 1 : 0.4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Plus size={12} />
                            Přidat
                          </button>
                        </div>
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
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "#00abbd", color: "white", border: "none", cursor: "pointer" }}
          >
            <Plus size={16} />
            Nová šablona
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
                        style={{ border: "none", background: "transparent", cursor: "pointer" }}
                      >
                        <Pencil size={13} style={{ color: "#00abbd" }} />
                      </button>
                      <button
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        style={{ border: "none", background: "transparent", cursor: "pointer" }}
                      >
                        <Trash2 size={13} style={{ color: "#fc7c71" }} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span className="font-semibold" style={{ color: "var(--text-muted)", minWidth: 18 }}>{idx + 1}.</span>
                        <div className="flex-1">
                          <span>{item.title}</span>
                          {item.note && (
                            <span className="ml-2" style={{ color: "var(--text-muted)", fontSize: 10 }}>— {item.note}</span>
                          )}
                        </div>
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
