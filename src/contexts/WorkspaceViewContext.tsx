import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "legatus_active_workspace";

interface WorkspaceInfo {
  id: string;
  name: string;
  owner_id: string | null;
  ownerProfile: {
    id: string;
    full_name: string;
    role: string;
    vedouci_id: string | null;
    garant_id: string | null;
    ziskatel_id: string | null;
    org_unit_id: string | null;
  } | null;
}

interface WorkspaceViewContextValue {
  /** When admin is "viewing as" a workspace, this is set. */
  viewAsWorkspace: WorkspaceInfo | null;
  /** True only when an admin has actively entered a workspace. */
  isViewingAsWorkspace: boolean;
  enterWorkspace: (workspaceId: string) => void;
  exitWorkspace: () => void;
}

const Ctx = createContext<WorkspaceViewContextValue | undefined>(undefined);

export function WorkspaceViewProvider({ children }: { children: ReactNode }) {
  const { isAdmin, profile } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);

  // Only admins may "view as" — silently clear for everyone else.
  useEffect(() => {
    if (!isAdmin && workspaceId) {
      setWorkspaceId(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, [isAdmin, workspaceId]);

  // Auto-clear if the admin is themselves a member of the workspace
  // they're trying to view (no point in "view as" your own workspace).
  useEffect(() => {
    if (workspaceId && profile && (profile as any).org_unit_id === workspaceId) {
      setWorkspaceId(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, [workspaceId, profile]);

  // Load workspace + owner profile whenever the active id changes.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !isAdmin) {
      setInfo(null);
      return;
    }
    (async () => {
      const { data: ws } = await supabase
        .from("org_units")
        .select("id, name, owner_id")
        .eq("id", workspaceId)
        .maybeSingle();

      if (cancelled) return;
      if (!ws) {
        setInfo(null);
        return;
      }

      let ownerProfile: WorkspaceInfo["ownerProfile"] = null;
      if (ws.owner_id) {
        const { data: op } = await supabase
          .from("profiles")
          .select("id, full_name, role, vedouci_id, garant_id, ziskatel_id, org_unit_id")
          .eq("id", ws.owner_id)
          .maybeSingle();
        if (op) ownerProfile = op as any;
      }
      if (!cancelled) setInfo({ ...(ws as any), ownerProfile });
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isAdmin]);

  const enterWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  const exitWorkspace = useCallback(() => {
    setWorkspaceId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const isViewingAsWorkspace = !!(isAdmin && workspaceId && info);

  return (
    <Ctx.Provider
      value={{
        viewAsWorkspace: isViewingAsWorkspace ? info : null,
        isViewingAsWorkspace,
        enterWorkspace,
        exitWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspaceView() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaceView must be used within WorkspaceViewProvider");
  return ctx;
}
