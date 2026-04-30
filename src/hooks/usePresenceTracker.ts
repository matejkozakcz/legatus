import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type DeviceKind = "mobile" | "desktop";

export interface PresenceState {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  online_at: string;
  page: string;
  device: DeviceKind;
}

/** Aggregated per-user presence (across all open tabs/devices). */
export interface AggregatedPresence {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  online_at: string;
  page: string;
  devices: DeviceKind[]; // unique kinds, e.g. ["mobile"], ["desktop"], or both
}

// ─── Module-level singleton store ─────────────────────────────────────────────

let channel: RealtimeChannel | null = null;
let refCount = 0;
let onlineList: AggregatedPresence[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return onlineList;
}

function detectDevice(): DeviceKind {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  // Standard mobile detection — covers iOS, Android, Windows Phone, etc.
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) ? "mobile" : "desktop";
}

// Unique key per tab so multiple devices/tabs of the same user are visible.
const TAB_KEY = `${Math.random().toString(36).slice(2)}-${Date.now()}`;

function ensureChannel() {
  if (channel) return channel;
  channel = supabase.channel("admin_presence", {
    config: { presence: { key: TAB_KEY } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      if (!channel) return;
      const state = channel.presenceState<PresenceState>();
      // Aggregate by user_id across all presence keys
      const byUser = new Map<string, AggregatedPresence>();
      for (const key of Object.keys(state)) {
        const metas = state[key];
        for (const m of metas || []) {
          if (!m?.user_id) continue;
          const existing = byUser.get(m.user_id);
          if (!existing) {
            byUser.set(m.user_id, {
              user_id: m.user_id,
              full_name: m.full_name,
              role: m.role,
              avatar_url: m.avatar_url,
              online_at: m.online_at,
              page: m.page,
              devices: [m.device || "desktop"],
            });
          } else {
            // Newest meta wins for page/online_at
            if (new Date(m.online_at) > new Date(existing.online_at)) {
              existing.online_at = m.online_at;
              existing.page = m.page;
            }
            const d = m.device || "desktop";
            if (!existing.devices.includes(d)) existing.devices.push(d);
          }
        }
      }
      onlineList = Array.from(byUser.values()).sort((a, b) =>
        a.full_name.localeCompare(b.full_name),
      );
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

    const ch = ensureChannel();
    refCount++;
    const device = detectDevice();

    const track = () =>
      ch.track({
        user_id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        online_at: new Date().toISOString(),
        page: location.pathname,
        device,
      } satisfies PresenceState);

    const persistLastSeen = async () => {
      try {
        const version =
          (() => {
            try { return localStorage.getItem("legatus_app_version"); } catch { return null; }
          })() ?? null;
        await supabase
          .from("profiles")
          .update({
            last_seen_at: new Date().toISOString(),
            last_known_version: version,
          })
          .eq("id", profile.id);
      } catch (err) {
        console.warn("[presence] persistLastSeen failed:", err);
      }
    };

    const initTimer = setTimeout(() => {
      track();
      persistLastSeen();
    }, 500);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        track();
        persistLastSeen();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    const hb = setInterval(track, 30000);
    const dbHb = setInterval(persistLastSeen, 2 * 60 * 1000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(hb);
      clearInterval(dbHb);
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
export function useOnlineUsers(): AggregatedPresence[] {
  return useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
}
