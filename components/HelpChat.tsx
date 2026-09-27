"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { BookOpen, CircleHelp, RotateCcw, SendHorizontal, Snowflake, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUGGESTED_QUESTIONS, SUPPORT_EMAIL } from "@/lib/help/articles";
import type { HelpEvent, Retrieval, Writer } from "@/lib/help/prompt";

const HELP_EVENT = "carryover:help";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string }[];
  retrieval?: Retrieval;
  writer?: Writer;
  pending?: boolean;
}

/** "Found in Snowflake · written by Gemini", "Answered with Snowflake Cortex", or nothing for a plain article. */
function engineLabel({ retrieval, writer }: Message) {
  if (writer === "cortex") return "Answered with Snowflake Cortex";
  if (retrieval === "snowflake" || retrieval === "cortex-search") return `Found in Snowflake${writer === "gemini" ? " · written by Gemini" : ""}`;
  return writer === "gemini" ? "Written by Gemini" : null;
}

/** The "Help" button in the top bar. */
export function HelpChatTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(HELP_EVENT))}
      className="glass-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-accent-ink"
      title="Ask how to use Carryover"
      aria-label="Help"
    >
      <CircleHelp className="h-4 w-4" /> <span className="hidden sm:inline">Help</span>
    </button>
  );
}

/** "**bold**" becomes <strong>; everything else stays plain text. */
function inline(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** Renders an answer's lines: numbered steps and bullets get a hanging marker, blank lines become gaps. */
function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        const item = /^\s*(\d+[.)]|[-*•])\s+(.*)$/.exec(line);
        if (item) {
          return (
            <p key={i} className="flex gap-2">
              <span className="w-5 shrink-0 text-right font-semibold text-accent-ink">{/^\d/.test(item[1]) ? item[1] : "•"}</span>
              <span>{inline(item[2])}</span>
            </p>
          );
        }
        return line.trim() ? <p key={i}>{inline(line)}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

/**
 * The help assistant: a side panel (not a modal, so the page stays usable while following the steps).
 * Answers stream from /api/help/chat, which uses Snowflake Cortex, or the help articles when it's offline.
 */
export function HelpChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(HELP_EVENT, toggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(HELP_EVENT, toggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // Wake the Snowflake warehouse while the person reads the suggestions, so the first answer is quick.
    void fetch("/api/help/warm", { method: "POST" }).catch(() => {});
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const updateLast = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.filter((m) => !m.pending && m.content).map(({ role, content }) => ({ role, content })).slice(-6);
    setMessages((all) => [...all, { role: "user", content: question }, { role: "assistant", content: "", pending: true }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: question }] }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Help isn't available right now.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const event = JSON.parse(line) as HelpEvent;
          if (event.type === "sources") updateLast((m) => ({ ...m, sources: event.sources, retrieval: event.retrieval, writer: event.writer }));
          if (event.type === "delta") updateLast((m) => ({ ...m, content: m.content + event.text }));
        }
      }
    } catch (err) {
      updateLast((m) => ({ ...m, content: (err as Error).message || "Help isn't available right now." }));
    } finally {
      updateLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Help"
      className="dialog-in glass-strong fixed inset-x-2 bottom-2 top-[calc(var(--header-h)+0.5rem)] z-50 flex flex-col overflow-hidden rounded-3xl sm:left-auto sm:right-3 sm:w-[27rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><CircleHelp className="h-5 w-5 text-accent" /> Help</h2>
          <p className="mt-0.5 text-sm text-ink-3">Ask how to do something in Carryover.</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} disabled={busy} title="Start over" className="flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed" aria-live="polite">
        {messages.length === 0 ? (
          <div className="fade-in">
            <p className="text-ink">Hi! I can explain how to use Carryover, step by step. Pick a question or type your own.</p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => void ask(q)} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-ink-2 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-ink">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            m.role === "user" ? (
              <p key={i} className="fade-in ml-8 rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-ink">{m.content}</p>
            ) : (
              <div key={i} className="fade-in mr-4 text-ink-2" aria-busy={m.pending ? true : undefined}>
                {m.content ? <Answer text={m.content} /> : <p className="animate-pulse text-ink-3">Looking that up…</p>}
                {!m.pending && m.sources && m.sources.length > 0 && (
                  <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                    <BookOpen className="h-3.5 w-3.5" /> From:
                    {m.sources.slice(0, 2).map((s) => <span key={s.id} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-ink-2">{s.title}</span>)}
                  </p>
                )}
                {!m.pending && engineLabel(m) && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-4"><Snowflake className="h-3 w-3" /> {engineLabel(m)}</p>
                )}
                {!m.pending && (
                  <p className="mt-2.5 border-t border-line pt-2 text-xs leading-relaxed text-ink-3">
                    Not satisfied by the answer?
                    <br />
                    You can always contact{" "}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">{SUPPORT_EMAIL}</a>
                  </p>
                )}
              </div>
            )
          ))
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(input); }}
        className="border-t border-line px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Type your question…"
            aria-label="Your question"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
          />
          <Button type="submit" disabled={busy || !input.trim()} className="h-11 px-4">
            <SendHorizontal className="h-4 w-4" /> Ask
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-4">Help with using the website only. Not medical advice.</p>
      </form>
    </aside>
  );
}
