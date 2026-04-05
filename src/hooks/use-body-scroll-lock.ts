import { useEffect } from "react";

/**
 * Locks body scroll when a modal/overlay is open.
 * Prevents background content from scrolling on mobile.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = original;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [locked]);
}
