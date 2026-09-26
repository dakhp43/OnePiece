"use client";

import { useEffect, useRef, type RefObject } from "react";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Display-only overlay: draws a live connector from the selected note sentence to each transcript
 * line it cites. It follows panel scrolling and re-layout, and clamps (faded) to the panel edge when a
 * cited line is scrolled out of view. Paths are updated in place so the flow animation never restarts.
 */
export function SourceLinks({ containerRef, selectedId, highlight }: {
  containerRef: RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  highlight: string[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    const svg = svgRef.current;
    if (!root || !svg) return;
    const links = new Map<string, { base: SVGPathElement; flow: SVGPathElement; end: SVGCircleElement }>();
    const start = document.createElementNS(SVG_NS, "circle");
    start.setAttribute("r", "4");
    start.setAttribute("class", "link-end");

    const clear = () => {
      links.forEach((l) => { l.base.remove(); l.flow.remove(); l.end.remove(); });
      links.clear();
      start.remove();
    };

    let raf = 0;
    const render = () => {
      raf = 0;
      const from = selectedId ? document.getElementById(`sentence-${selectedId}`) : null;
      const notePane = from?.closest("section");
      if (!from || !notePane || highlight.length === 0) return clear();
      const box = root.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const np = notePane.getBoundingClientRect();
      const mid = a.top + Math.min(a.height, 28) / 2;
      if (mid < np.top || mid > np.bottom) return clear();
      const ax = a.right - box.left;
      const ay = mid - box.top;
      start.setAttribute("cx", String(ax));
      start.setAttribute("cy", String(ay));

      const seen = new Set<string>();
      for (const id of highlight) {
        const el = root.querySelector<HTMLElement>(`[data-uid="${CSS.escape(id)}"]`);
        const list = el?.closest("ol");
        if (!el || !list) continue;
        seen.add(id);
        const b = el.getBoundingClientRect();
        const lp = list.getBoundingClientRect();
        const rawY = b.top + Math.min(b.height, 40) / 2;
        const y = Math.max(lp.top + 6, Math.min(lp.bottom - 6, rawY));
        const offscreen = rawY !== y;
        const bx = b.left - box.left + 2;
        const by = y - box.top;
        const dx = Math.max(40, (bx - ax) * 0.5);
        const d = `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;

        let l = links.get(id);
        if (!l) {
          const base = document.createElementNS(SVG_NS, "path");
          base.setAttribute("class", "link-path draw");
          base.setAttribute("pathLength", "1");
          const flow = document.createElementNS(SVG_NS, "path");
          flow.setAttribute("class", "link-flow");
          const end = document.createElementNS(SVG_NS, "circle");
          end.setAttribute("r", "4");
          end.setAttribute("class", "link-end");
          svg.append(base, flow, end);
          l = { base, flow, end };
          links.set(id, l);
        }
        l.base.setAttribute("d", d);
        l.flow.setAttribute("d", d);
        l.end.setAttribute("cx", String(bx));
        l.end.setAttribute("cy", String(by));
        const opacity = offscreen ? "0.35" : "1";
        l.base.style.opacity = opacity;
        l.flow.style.opacity = opacity;
        l.end.style.opacity = opacity;
      }
      links.forEach((l, id) => {
        if (!seen.has(id)) { l.base.remove(); l.flow.remove(); l.end.remove(); links.delete(id); }
      });
      // Only touch the DOM when needed: moving nodes would re-trigger the MutationObserver.
      if (links.size && start.parentNode !== svg) svg.append(start);
      else if (!links.size) start.remove();
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

    // Follow the smooth scroll that selection triggers, then react to scrolls, resizes and DOM changes.
    const until = performance.now() + 1000;
    let follow = 0;
    const loop = () => { schedule(); if (performance.now() < until) follow = requestAnimationFrame(loop); };
    follow = requestAnimationFrame(loop);
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(follow);
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      clear();
    };
  }, [containerRef, selectedId, highlight]);

  return <svg ref={svgRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden />;
}
