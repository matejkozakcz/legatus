import { useState } from "react";
import { CheckSquare, Plus, Check, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: Date;
}

const Ukoly = () => {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState("");

  const addTask = () => {
    const text = inputValue.trim();
    if (!text) return;
    setTasks((prev) => [
      { id: Date.now().toString(), text, done: false, createdAt: new Date() },
      ...prev,
    ]);
    setInputValue("");
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  if (isMobile) {
    return (
      <div className="mobile-page">
        {/* Header */}
        <div className="mobile-page-header">
          <div className="mobile-page-title">Úkoly</div>
          <div className="mobile-page-subtitle">Tvé osobní připomínky a cíle</div>
        </div>

        {/* Add task input */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: "12px 14px",
            marginBottom: 16,
            border: "1px solid #e1e9eb",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Přidat úkol…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text-primary)",
              background: "transparent",
              fontFamily: "Open Sans, sans-serif",
            }}
          />
          <button
            onClick={addTask}
            disabled={!inputValue.trim()}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: inputValue.trim() ? "#fc7c71" : "#dde8ea",
              border: "none", cursor: inputValue.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <Plus size={16} color={inputValue.trim() ? "white" : "var(--text-muted)"} />
          </button>
        </div>

        {/* Pending tasks */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)",
              padding: "0 4px 8px",
            }}>
              Aktivní ({pending.length})
            </div>
            {pending.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
                onRemove={() => removeTask(task.id)}
              />
            ))}
          </div>
        )}

        {/* Done tasks */}
        {done.length > 0 && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)",
              padding: "0 4px 8px",
            }}>
              Hotové ({done.length})
            </div>
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
                onRemove={() => removeTask(task.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {tasks.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            color: "var(--text-muted)",
          }}>
            <CheckSquare size={48} color="#c8d8dc" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 16, color: "var(--text-secondary)" }}>
              Žádné úkoly
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Přidej si připomínky nebo cíle
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop view
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <CheckSquare className="h-6 w-6" style={{ color: "var(--text-primary)" }} />
        <h1 className="font-heading font-bold" style={{ fontSize: 28, color: "var(--text-primary)" }}>
          Úkoly
        </h1>
      </div>

      <div className="legatus-card" style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Přidat úkol…"
            className="flex-1"
            style={{
              border: "1.5px solid #e2eaec", borderRadius: 8, padding: "8px 14px",
              fontSize: 14, color: "var(--text-primary)", outline: "none",
            }}
          />
          <button
            onClick={addTask}
            className="btn btn-md btn-primary"
            disabled={!inputValue.trim()}
          >
            Přidat
          </button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
            Zatím žádné úkoly. Přidej první!
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10,
                  background: task.done ? "#f8fbfc" : "#ffffff",
                  border: "1px solid #e2eaec",
                }}
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: task.done ? "none" : "2px solid #c8d8dc",
                    background: task.done ? "#00abbd" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {task.done && <Check size={12} color="white" />}
                </button>
                <span style={{
                  flex: 1, fontSize: 14, color: task.done ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: task.done ? "line-through" : "none",
                }}>
                  {task.text}
                </span>
                <button
                  onClick={() => removeTask(task.id)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}
                >
                  <X size={14} color="var(--text-muted)" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 8,
        border: "1px solid #e1e9eb",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          border: task.done ? "none" : "2px solid #c8d8dc",
          background: task.done ? "#00abbd" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {task.done && <Check size={13} color="white" />}
      </button>
      <span style={{
        flex: 1, fontSize: 14, fontFamily: "Open Sans, sans-serif",
        color: task.done ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: task.done ? "line-through" : "none",
      }}>
        {task.text}
      </span>
      <button
        onClick={onRemove}
        style={{
          width: 28, height: 28, border: "none", background: "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 8,
        }}
      >
        <X size={14} color="var(--text-muted)" />
      </button>
    </div>
  );
}

export default Ukoly;
