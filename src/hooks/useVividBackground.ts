import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "legatus-vivid-bg";

export function useVividBackground() {
  const [vivid, setVividState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setVivid = useCallback((value: boolean) => {
    setVividState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {}
    window.dispatchEvent(new Event("vivid-bg-change"));
  }, []);

  useEffect(() => {
    const handler = () => {
      try {
        setVividState(localStorage.getItem(STORAGE_KEY) === "true");
      } catch {}
    };
    window.addEventListener("vivid-bg-change", handler);
    return () => window.removeEventListener("vivid-bg-change", handler);
  }, []);

  return { vivid, setVivid };
}
