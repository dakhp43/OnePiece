"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Which model answered (assistant messages only). */
  source?: "snowflake" | "gemini";
}

const SOURCE_LABEL = { snowflake: "Snowflake Cortex", gemini: "Gemini (fallback)" } as const;

const SUGGESTIONS = ["What changed in their medications?", "Any overdue or open items?", "Summarize the last visit"];
const MAX_SENT = 12;

/** "Ask about this patient": a small chat answered by Snowflake Cortex from this patient's chart only. */
export function ChatCard({ patientId, firstName }: { patientId: string; firstName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-MAX_SENT).map(({ role, content }) => ({ role, content })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The assistant couldn't answer right now.");
      setMessages([...next, { role: "assistant", content: body.reply, source: body.source }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquareText className="h-4 w-4" /> Ask about {firstName}</CardTitle>
        <Badge tone="blue">Snowflake Cortex · Gemini fallback</Badge>
      </CardHeader>
      <CardContent>
        {messages.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.length > 0 && (
          <div className="mb-3 max-h-80 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user" ? "bg-accent-strong text-on-accent" : "border border-line bg-surface-2 text-ink",
                  )}
                >
                  {m.content}
                </p>
                {m.source && <span className="mt-1 px-1 text-[10px] text-ink-4">Answered by {SOURCE_LABEL[m.source]}</span>}
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-ink-3"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the chart…</p>
            )}
            <div ref={endRef} />
          </div>
        )}
        {error && <p role="alert" className="mb-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about ${firstName}'s chart…`}
            aria-label={`Ask a question about ${firstName}'s chart`}
            maxLength={2000}
          />
          <Button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-ink-4">Answers come only from this chart. Check anything important against the record.</p>
      </CardContent>
    </Card>
  );
}
