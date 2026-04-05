import { useEffect } from "react";

/**
 * Locks body scroll when a modal/overlay is open.
 * Prevents background content from scrolling on mobile.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const scrollY = window.scrollY;
    const original = document.body.style.cssText;
    document.body.style.cssText = `
      overflow: hidden;
      position: fixed;
      top: -${scrollY}px;
      left: 0;
      right: 0;
      width: 100%;
    `;
    return () => {
      document.body.style.cssText = original;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
