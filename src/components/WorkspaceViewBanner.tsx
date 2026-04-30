import { useNavigate } from "react-router-dom";
import { LogOut, Eye } from "lucide-react";
import { useWorkspaceView } from "@/contexts/WorkspaceViewContext";

/**
 * Sticky top banner shown when an admin has entered "view as workspace" mode.
 * Lets them exit back to /admin with one click.
 */
export function WorkspaceViewBanner() {
  const { viewAsWorkspace, isViewingAsWorkspace, exitWorkspace } = useWorkspaceView();
  const navigate = useNavigate();

  if (!isViewingAsWorkspace || !viewAsWorkspace) return null;

  const handleExit = () => {
    exitWorkspace();
    navigate("/admin");
  };

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "linear-gradient(90deg, #00555f 0%, #00abbd 100%)",
        color: "#ffffff",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "'Open Sans', sans-serif",
        fontSize: 13,
        boxShadow: "0 2px 12px rgba(0,85,95,0.25)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye size={16} style={{ flexShrink: 0 }} />
        <span className="truncate">
          Prohlížíš workspace <strong>{viewAsWorkspace.name}</strong> jako admin
          {viewAsWorkspace.ownerProfile?.full_name && (
            <> · očima vedoucího <strong>{viewAsWorkspace.ownerProfile.full_name}</strong></>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        style={{
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.35)",
          color: "#ffffff",
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.18s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
      >
        <LogOut size={13} />
        Opustit workspace
      </button>
    </div>
  );
}
