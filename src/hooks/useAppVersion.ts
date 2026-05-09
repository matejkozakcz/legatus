import { useCallback, useEffect, useRef, useState } from "react";

const VERSION_KEY = "legatus_app_version";
const VERSION_URL = "/version.json";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min while tab is open

/**
 * Detects newly published builds by polling `/version.json`, which is emitted
 * by the Vite build with a unique timestamp on every build (see vite.config.ts).
 *
 * Strategy:
 *  - Fetch `/version.json` with `cache: "no-store"` + cache-bust query string
 *    (Lovable proxy also serves it with no-store headers).
 *  - Compare the build version to the value persisted in localStorage. First
 *    visit silently adopts the current version. Subsequent mismatches surface
 *    `isStale` so the UpdateBanner can prompt the user to refresh.
 *  - Re-check on visibility/focus/online + on a 5 min interval.
 *  - `performUpdate()` clears caches + service workers + storage (preserving
 *    auth tokens) and reloads with a cache-bust query.
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
    if (!v) return;
    setServerVersion(v);
    // First-time visitors: silently adopt current version, no banner.
    if (!localVersionRef.current) {
      try { localStorage.setItem(VERSION_KEY, v); } catch {}
      setLocalVersion(v);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${VERSION_URL}?_=${Date.now()}`, {
        cache: "no-store",
        credentials: "omit",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      applyValue(data?.version);
    } catch (e) {
      console.warn("[app_version] refresh failed:", e);
    }
  }, [applyValue]);

  useEffect(() => {
    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => { void refresh(); };
    const onOnline = () => { void refresh(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    const interval = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [refresh]);

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
