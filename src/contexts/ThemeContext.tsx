import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { getThemeForNow, msUntilNextTransition } from "@/lib/sunPrague";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  autoTheme: boolean;
  setAutoTheme: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_KEY = "legatus_theme";
const AUTO_KEY = "legatus_theme_auto";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [autoTheme, setAutoThemeState] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_KEY) === "1"; } catch { return false; }
  });

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      if (localStorage.getItem(AUTO_KEY) === "1") return getThemeForNow();
      return (localStorage.getItem(THEME_KEY) as Theme) || "light";
    } catch {
      return "light";
    }
  });

  const timerRef = useRef<number | null>(null);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  // Auto mode: schedule next sunrise/sunset transition
  const scheduleNext = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const tick = () => {
      setTheme(getThemeForNow());
      const wait = Math.min(msUntilNextTransition(), 6 * 3600 * 1000); // cap at 6h for safety
      timerRef.current = window.setTimeout(tick, wait + 1000);
    };
    // Sync now
    setTheme(getThemeForNow());
    const wait = Math.min(msUntilNextTransition(), 6 * 3600 * 1000);
    timerRef.current = window.setTimeout(tick, wait + 1000);
  }, []);

  useEffect(() => {
    if (!autoTheme) {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }
    scheduleNext();
    const onVisible = () => { if (document.visibilityState === "visible") scheduleNext(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [autoTheme, scheduleNext]);

  const setAutoTheme = useCallback((v: boolean) => {
    setAutoThemeState(v);
    try { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch {}
    if (v) setTheme(getThemeForNow());
  }, []);

  const toggleTheme = useCallback(() => {
    // Manual toggle disables auto mode
    if (autoTheme) {
      setAutoThemeState(false);
      try { localStorage.setItem(AUTO_KEY, "0"); } catch {}
    }
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, [autoTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, autoTheme, setAutoTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
