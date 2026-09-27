import { describe, expect, it } from "vitest";
import { toPcm16 } from "./pcmTap";

describe("toPcm16", () => {
  it("downsamples 48 kHz to 16 kHz and scales to 16-bit", () => {
    const input = new Float32Array(4800).map((_, i) => (i % 3 === 0 ? 0.5 : 0));
    const out = toPcm16(input, 48000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBe(Math.trunc(0.5 * 0x7fff));
  });

  it("passes 16 kHz through and clips out-of-range samples", () => {
    const out = toPcm16(new Float32Array([0, 1.5, -2, -0.25]), 16000);
    expect(Array.from(out)).toEqual([0, 0x7fff, -0x7fff, Math.trunc(-0.25 * 0x7fff)]);
  });
});
