/**
 * A soft two-note chime for a new "Consider asking" card. Synthesized (no audio file) on an AudioContext
 * created from the Start click, so browsers allow it to play. Quiet on purpose: it's heard in the exam room.
 */
export function playChime(ctx: AudioContext | null) {
  if (!ctx || ctx.state === "closed") return;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const t = now + i * 0.13;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
