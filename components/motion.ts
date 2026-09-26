import type { CSSProperties } from "react";

/** Entrance order for `.rise` siblings (70 ms apart, see globals.css). */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
