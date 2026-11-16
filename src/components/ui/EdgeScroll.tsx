"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Transparent arrow on the board edge: hover → the board scrolls in that direction (like Bitrix).
// Desktop only: on a phone the board is swiped and the overlay would only cover the cards.
export function EdgeScroller({ side, visible, onStart, onStop }: { side: "left" | "right"; visible: boolean; onStart: () => void; onStop: () => void }) {
  if (!visible) return null;
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      onMouseEnter={onStart}
      onMouseLeave={onStop}
      className={`absolute top-0 bottom-2 z-20 w-12 hidden md:flex items-center ${side === "left" ? "left-0 justify-start" : "right-0 justify-end"} group/edge`}
      style={{
        background: side === "left"
          ? "linear-gradient(90deg, rgba(0,0,0,0.45), transparent)"
          : "linear-gradient(270deg, rgba(0,0,0,0.45), transparent)",
      }}
    >
      <span className="mx-1 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/70 group-hover/edge:bg-white/20 group-hover/edge:text-white transition-colors backdrop-blur">
        <Icon size={18} />
      </span>
    </div>
  );
}

// Edge auto-scroll of a horizontal board: put `ref` + `onScroll` on the scroller, render `arrows` in a relative parent.
export function useEdgeScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update, dep]);
  const stop = useCallback(() => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = null; }, []);
  const start = (dir: -1 | 1) => {
    stop();
    const step = () => {
      const el = ref.current;
      if (!el) return;
      el.scrollLeft += dir * 9;
      update();
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => stop, [stop]);
  const arrows = (
    <>
      <EdgeScroller side="left" visible={edges.left} onStart={() => start(-1)} onStop={stop} />
      <EdgeScroller side="right" visible={edges.right} onStart={() => start(1)} onStop={stop} />
    </>
  );
  return { ref, onScroll: update, arrows };
}
