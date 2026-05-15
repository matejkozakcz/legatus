import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useVividBackground } from "@/hooks/useVividBackground";

/**
 * Renders a full-viewport gradient that crossfades between light and dark mode.
 * Active only when the user enabled "Živé pozadí" in Settings.
 *
 * Gradients are intentionally inline (not design tokens) — they are an opt-in
 * decorative layer borrowed from the Parťáq look.
 */
export function AppBackground() {
  const { theme } = useTheme();
  const { vivid } = useVividBackground();
  const isDark = theme === "dark";

  useEffect(() => {
    if (vivid) {
      document.documentElement.setAttribute("data-vivid", "");
    } else {
      document.documentElement.removeAttribute("data-vivid");
    }
    return () => document.documentElement.removeAttribute("data-vivid");
  }, [vivid]);

  if (!vivid) return null;

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          zIndex: -1,
          background: "linear-gradient(to bottom, #bae6eb, #f4ecd4)",
          opacity: isDark ? 0 : 1,
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          zIndex: -1,
          background: "linear-gradient(to bottom, #05001b, #283d50, #7d5a44)",
          opacity: isDark ? 1 : 0,
        }}
      />
    </>
  );
}
