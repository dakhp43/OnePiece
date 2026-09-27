import { REALTIME_SAMPLE_RATE } from "./realtimeStt";

/**
 * Taps any Web Audio node (the mic stream, or the demo recording as it plays) and delivers 16 kHz mono
 * Int16 PCM in ~100 ms batches, the format Scribe Realtime expects. It only listens: nothing it does
 * reaches the speakers or the MediaRecorder.
 */

// Collects ~100 ms of samples on the audio thread, then posts them to the page.
const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(Math.round(sampleRate / 10)); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

/** Linear resample to 16 kHz and convert to 16-bit PCM. */
export function toPcm16(input: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / REALTIME_SAMPLE_RATE;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const v = input[j] + ((input[j + 1] ?? input[j]) - input[j]) * (x - j);
    out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  return out;
}

const loaded = new WeakSet<BaseAudioContext>();

export async function tapPcm(ctx: AudioContext, source: AudioNode, onPcm: (pcm: Int16Array) => void): Promise<() => void> {
  // Keeps the tap pulled by the audio graph without making any sound.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  mute.connect(ctx.destination);

  if (ctx.audioWorklet) {
    if (!loaded.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      loaded.add(ctx);
    }
    const node = new AudioWorkletNode(ctx, "pcm-tap");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onPcm(toPcm16(e.data, ctx.sampleRate));
    source.connect(node);
    node.connect(mute);
    return () => {
      node.port.onmessage = null;
      try { source.disconnect(node); } catch { /* already gone */ }
      node.disconnect();
      mute.disconnect();
    };
  }

  // Older browsers without AudioWorklet: the deprecated ScriptProcessor still works.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => onPcm(toPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate));
  source.connect(proc);
  proc.connect(mute);
  return () => {
    proc.onaudioprocess = null;
    try { source.disconnect(proc); } catch { /* already gone */ }
    proc.disconnect();
    mute.disconnect();
  };
}
