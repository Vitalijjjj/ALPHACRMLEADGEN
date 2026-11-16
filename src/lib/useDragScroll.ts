"use client";

import { useEffect, type RefObject } from "react";

// A sideways-scrolling strip (stage bar, tabs) that also scrolls with the mouse: drag it left/right
// or turn the wheel over it. Fingers already scroll it natively. Does nothing when everything fits.
// `ready` — pass something that flips when the strip first appears (e.g. after a loading screen).
export function useDragScroll(ref: RefObject<HTMLElement | null>, ready: unknown = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflows = () => el.scrollWidth > el.clientWidth + 1;
    let startX = 0, startLeft = 0, down = false, moved = false;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !overflows()) return;
      down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) { moved = true; el.style.cursor = "grabbing"; el.style.userSelect = "none"; }
      if (moved) el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false; el.style.cursor = ""; el.style.userSelect = "";
    };
    // a drag must not also "click" the stage / tab it ended on
    const onClick = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
    const onWheel = (e: WheelEvent) => {
      if (!overflows() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad sideways swipe works by itself
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // at the end — let the page scroll on
      e.preventDefault();
      el.scrollLeft = next;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref, ready]);
}
