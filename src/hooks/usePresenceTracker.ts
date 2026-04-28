import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Globally tracks the current user in the `admin_presence` Supabase Realtime channel.
 * Used by the Admin → Aktivita tab to display who is currently online.
 */
export function usePresenceTracker() {
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase.channel("admin_presence", {
      config: { presence: { key: profile.id } },
    });

    const track = () =>
      channel.track({
        user_id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        online_at: new Date().toISOString(),
        page: location.pathname,
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await track();
      }
    });

    // Re-track on visibility/focus to refresh timestamp
    const onVisibility = () => {
      if (document.visibilityState === "visible") track();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    // Heartbeat every 30s
    const hb = setInterval(track, 30000);

    return () => {
      clearInterval(hb);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.full_name, profile?.role, profile?.avatar_url, location.pathname]);
}
