import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface WorkspaceSettings {
  showBjFunnel: boolean;
  loading: boolean;
}

/**
 * Vrací nastavení workspace (org_unit), do které patří aktuální user.
 * Aktuálně jen feature flag `show_bj_funnel`.
 */
export function useWorkspaceSettings(): WorkspaceSettings {
  const { user } = useAuth();
  const [showBjFunnel, setShowBjFunnel] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setShowBjFunnel(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // 1) Najdeme org_unit_id usera
        const { data: prof } = await supabase
          .from("profiles")
          .select("org_unit_id")
          .eq("id", user.id)
          .maybeSingle();

        const orgUnitId = (prof as any)?.org_unit_id;
        if (!orgUnitId) {
          if (!cancelled) {
            setShowBjFunnel(false);
            setLoading(false);
          }
          return;
        }

        // 2) Načteme flag
        const { data: ou } = await supabase
          .from("org_units")
          .select("show_bj_funnel")
          .eq("id", orgUnitId)
          .maybeSingle();

        if (!cancelled) {
          setShowBjFunnel(Boolean((ou as any)?.show_bj_funnel));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setShowBjFunnel(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { showBjFunnel, loading };
}
