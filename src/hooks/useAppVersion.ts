import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const VERSION_KEY = "legatus_app_version";
const CONFIG_KEY = "app_version";

/**
 * Subscribes to app_config.app_version changes (realtime + initial fetch).
 * Returns `serverVersion` and `localVersion`. Banner shows when they differ.
 *
 * In PWA / installed app contexts the realtime websocket often dies while the
 * app is backgrounded, so we additionally re-fetch the value when the page
 * becomes visible / regains focus, and expose a manual `refresh()` so screens
 * like Nastavení can force a check on open.
 */
export function useAppVersion() {
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(VERSION_KEY); } catch { return null; }
  });
  const localVersionRef = useRef(localVersion);
  useEffect(() => { localVersionRef.current = localVersion; }, [localVersion]);

  const applyValue = useCallback((value: unknown) => {
    if (value === null || value === undefined) return;
    const v = typeof value === "string" ? value : JSON.stringify(value);
    setServerVersion(v);
    // First-time visitors: silently adopt current version, no banner.
    if (!localVersionRef.current) {
      try { localStorage.setItem(VERSION_KEY, v); } catch {}
      setLocalVersion(v);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", CONFIG_KEY)
        .maybeSingle();
      applyValue(data?.value);
    } catch (e) {
      console.warn("[app_version] refresh failed:", e);
    }
  }, [applyValue]);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch
    supabase
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) applyValue(data?.value); });

    // Realtime subscription (unique channel per hook instance to avoid
    // "cannot add postgres_changes callbacks after subscribe()" when multiple
    // components mount this hook simultaneously).
    const channel = supabase
      .channel(`app_version_changes_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config", filter: `key=eq.${CONFIG_KEY}` },
        (payload) => {
          const next = (payload.new as { value?: unknown })?.value;
          applyValue(next);
        },
      )
      .subscribe();

    // Refresh when PWA / tab returns to the foreground — realtime websocket
    // is unreliable in standalone installs (iOS/Android/desktop PWA).
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => { void refresh(); };
    const onOnline = () => { void refresh(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [applyValue, refresh]);

  const isStale = !!serverVersion && !!localVersion && serverVersion !== localVersion;

  /** Hard refresh: clear caches, service worker, localStorage (keep auth), then reload. */
  const performUpdate = async () => {
    try {
      // Save new version BEFORE clearing storage
      const newVersion = serverVersion ?? String(Date.now());

      // Preserve Supabase auth tokens
      const authKeys: Record<string, string> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase.auth"))) {
            authKeys[k] = localStorage.getItem(k) ?? "";
          }
        }
      } catch {}

      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}

      // Restore auth + new version
      try {
        for (const [k, v] of Object.entries(authKeys)) localStorage.setItem(k, v);
        localStorage.setItem(VERSION_KEY, newVersion);
      } catch {}

      // Cache Storage API — must run BEFORE unregistering SW
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Unregister service worker(s)
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (err) {
      console.warn("[update] cleanup error:", err);
    }

    // Force fresh load bypassing HTTP/disk cache.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  return { serverVersion, localVersion, isStale, performUpdate, refresh };
}
