/**
 * Browser adapter for ElevenLabs Scribe v2 Realtime over a raw WebSocket (no SDK dependency).
 *
 * Verified against the live API (Phase 16 spike):
 * - Server sends `session_started` right after open, then `partial_transcript` about once a second with the
 *   whole uncommitted segment so far, and `committed_transcript` when a segment is closed.
 * - VAD only commits after `vad_silence_threshold_secs` of silence (1.5 s by default), which natural
 *   turn-taking often never reaches, so callers should also `commit()` before reading the transcript.
 *   A manual commit came back as `committed_transcript` within ~0.1 s.
 * - Errors arrive as messages whose `message_type` is the error name (auth_error, quota_exceeded,
 *   rate_limited, session_time_limit_exceeded, input_error, ...).
 */

const URL_BASE = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
export const REALTIME_SAMPLE_RATE = 16000;

const ERROR_TYPES = new Set([
  "error", "auth_error", "quota_exceeded", "commit_throttled", "rate_limited", "session_time_limit_exceeded",
  "queue_overflow", "resource_exhausted", "input_error", "chunk_size_exceeded", "transcriber_error",
]);

export interface RealtimeHandlers {
  onCommitted: (text: string) => void;
  onPartial?: (text: string) => void;
  onOpen?: () => void;
  /** Called once when the session can't continue (connection lost or a fatal server error). */
  onError: (code: string) => void;
}

export interface RealtimeSession {
  sendPcm: (pcm: Int16Array) => void;
  /** Closes the current segment so its text arrives as a committed transcript. */
  commit: () => void;
  close: () => void;
}

function toBase64(pcm: Int16Array) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function connectRealtime(token: string, keyterms: string[], h: RealtimeHandlers): RealtimeSession {
  const qs = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    token,
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: "0.8",
    language_code: "en",
  });
  for (const k of keyterms) qs.append("keyterms", k);
  const ws = new WebSocket(`${URL_BASE}?${qs}`);
  let failed = false;
  let closing = false;
  const fail = (code: string) => {
    if (failed || closing) return;
    failed = true;
    h.onError(code);
    ws.close();
  };
  const send = (pcm: Int16Array, commit: boolean) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(pcm), sample_rate: REALTIME_SAMPLE_RATE, ...(commit ? { commit: true } : {}) }));
  };

  ws.onopen = () => h.onOpen?.();
  ws.onmessage = (e) => {
    let m: { message_type?: string; text?: string };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.message_type === "partial_transcript") h.onPartial?.(m.text ?? "");
    else if (m.message_type === "committed_transcript") {
      if (m.text?.trim()) h.onCommitted(m.text.trim());
      h.onPartial?.("");
    } else if (m.message_type && ERROR_TYPES.has(m.message_type)) fail(m.message_type);
  };
  ws.onerror = () => fail("connection_error");
  ws.onclose = () => fail("closed");

  return {
    sendPcm: (pcm) => send(pcm, false),
    commit: () => send(new Int16Array(0), true),
    close: () => {
      closing = true;
      ws.close();
    },
  };
}
