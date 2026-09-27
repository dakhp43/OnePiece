"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Edge-lens displacement map for a w×h rounded rectangle: pixels within `band` of the rim push toward the
 * inside along the edge normal (so the backdrop bends like a thick glass lip); the interior stays still.
 * Rendered at reduced resolution and cached by size.
 */
const cache = new Map<string, string>();
function lensMap(w: number, h: number, radius: number, band: number) {
  const key = `${w}x${h}r${radius}b${band}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = Math.max(1, Math.max(w, h) / 320);
  const cw = Math.max(2, Math.round(w / s));
  const ch = Math.max(2, Math.round(h / s));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(cw, ch);
  const r = Math.min(radius, w / 2, h / 2);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) * s;
      const y = (j + 0.5) * s;
      const px = Math.abs(x - w / 2) - (w / 2 - r);
      const py = Math.abs(y - h / 2) - (h / 2 - r);
      // Signed distance inside the rounded rect (px from the rim).
      const inside = -(Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r);
      let t = Math.max(0, 1 - inside / band);
      t = t * t * (3 - 2 * t);
      // Outward normal of the nearest edge (rounded at the corners).
      let nx = 0;
      let ny = 0;
      if (px > 0 && py > 0) {
        nx = px;
        ny = py;
      } else if (px > py) nx = 1;
      else ny = 1;
      const len = Math.hypot(nx, ny) || 1;
      nx = (nx / len) * Math.sign(x - w / 2);
      ny = (ny / len) * Math.sign(y - h / 2);
      const k = (j * cw + i) * 4;
      // Sample inward from the rim (the backdrop bends in, like light through a glass lip).
      img.data[k] = 128 - nx * t * 127;
      img.data[k + 1] = 128 - ny * t * 127;
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

interface Props extends HTMLAttributes<HTMLElement> {
  as?: "div" | "header" | "section" | "footer";
  /** Corner radius in px (match the rounded-* class). */
  radius?: number;
  /** How far the rim bends the backdrop, in px. */
  strength?: number;
  /** Width of the refracting rim, in px. */
  band?: number;
  /** Extra frost on top of the refraction, in px. */
  blur?: number;
}

/**
 * Liquid glass: translucent tint, a light rim, and real refraction of whatever is behind it at the edges
 * (Chromium, via an SVG displacement filter in backdrop-filter). Other browsers get frosted glass.
 * The refracting layer sits behind the content, so text on the glass stays crisp.
 */
export function LiquidGlass({ as = "div", radius = 24, strength = 28, band = 26, blur = 3, className, children, ...rest }: Props) {
  const Tag = as;
  const ref = useRef<HTMLElement | null>(null);
  const fid = `lg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [map, setMap] = useState<{ w: number; h: number; href: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || root().dataset.liquid !== "1") return;
    let last = "";
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h || `${w}x${h}` === last) return;
      last = `${w}x${h}`;
      setMap({ w, h, href: lensMap(w, h, radius, band) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [radius, band]);

  const lens = map
    ? { backdropFilter: `url(#${fid}) blur(${blur}px) saturate(1.8)`, clipPath: `inset(0 round ${radius}px)` }
    : undefined;

  return (
    <Tag ref={ref as never} className={cn("liquid", className)} {...rest}>
      <span aria-hidden className="liquid-lens" style={lens} />
      {map && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <filter id={fid} x="0" y="0" width={map.w} height={map.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map.href} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={strength} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      {children}
    </Tag>
  );
}

const root = () => document.documentElement;
