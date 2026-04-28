import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface PresenceState {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  online_at: string;
  page: string;
}

// ─── Module-level singleton store ─────────────────────────────────────────────
// Ensures only ONE Supabase Realtime channel exists for `admin_presence`,
// even across StrictMode double-mounts and multiple consumer components.

let channel: RealtimeChannel | null = null;
let refCount = 0;
let onlineList: PresenceState[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return onlineList;
}

function ensureChannel(profileId: string) {
  if (channel) return channel;
  channel = supabase.channel("admin_presence", {
    config: { presence: { key: profileId } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      if (!channel) return;
      const state = channel.presenceState<PresenceState>();
      const list: PresenceState[] = [];
      for (const key of Object.keys(state)) {
        const metas = state[key];
        if (metas && metas.length > 0) {
          const newest = metas.reduce((a, b) =>
            new Date(a.online_at) > new Date(b.online_at) ? a : b,
          );
          list.push(newest);
        }
      }
      onlineList = list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      emit();
    })
    .subscribe();

  return channel;
}

/**
 * Globally tracks the current user in the `admin_presence` channel.
 * Mount once (e.g. in AppLayout). Safe across StrictMode double-mounts.
 */
export function usePresenceTracker() {
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!profile?.id) return;

    const ch = ensureChannel(profile.id);
    refCount++;

    const track = () =>
      ch.track({
        user_id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        online_at: new Date().toISOString(),
        page: location.pathname,
      });

    // Track shortly after mount (channel may still be joining)
    const initTimer = setTimeout(track, 500);

    const onVisibility = () => {
      if (document.visibilityState === "visible") track();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    const hb = setInterval(track, 30000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(hb);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      refCount--;
      if (refCount <= 0 && channel) {
        supabase.removeChannel(channel);
        channel = null;
        onlineList = [];
        emit();
      }
    };
  }, [profile?.id, profile?.full_name, profile?.role, profile?.avatar_url, location.pathname]);
}

/** Read the current presence list (subscribes to updates). */
export function useOnlineUsers(): PresenceState[] {
  return useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
}
