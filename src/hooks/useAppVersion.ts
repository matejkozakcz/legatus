import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const VERSION_KEY = "legatus_app_version";
const CONFIG_KEY = "app_version";

/**
 * Subscribes to app_config.app_version changes (realtime + initial fetch).
 * Returns `serverVersion` and `localVersion`. Banner shows when they differ.
 */
export function useAppVersion() {
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(VERSION_KEY); } catch { return null; }
  });

  useEffect(() => {
    let cancelled = false;

    const applyValue = (value: unknown) => {
      if (cancelled || value === null || value === undefined) return;
      const v = typeof value === "string" ? value : JSON.stringify(value);
      setServerVersion(v);
      // First-time visitors: silently adopt current version, no banner.
      if (!localVersion) {
        try { localStorage.setItem(VERSION_KEY, v); } catch {}
        setLocalVersion(v);
      }
    };

    // Initial fetch
    supabase
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle()
      .then(({ data }) => applyValue(data?.value));

    // Realtime subscription
    const channel = supabase
      .channel("app_version_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config", filter: `key=eq.${CONFIG_KEY}` },
        (payload) => {
          const next = (payload.new as { value?: unknown })?.value;
          applyValue(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [localVersion]);

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

      // Cache Storage API
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
    // Force reload from server
    window.location.reload();
  };

  return { serverVersion, localVersion, isStale, performUpdate };
}
