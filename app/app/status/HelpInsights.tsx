"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestion, Snowflake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { articleById } from "@/lib/help/articles";
import type { HelpInsights as Insights } from "@/lib/llm/snowflake";

/**
 * What staff asked the Help assistant this week, read from Snowflake. Loaded after the page so the status
 * checks above stay free; the query runs on the small Snowflake warehouse.
 */
export function HelpInsights() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/help/insights")
      .then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json().catch(() => ({}))).error ?? "Couldn't load")))
      .catch(() => setError("Couldn't load"));
  }, []);

  return (
    <Card className="rise mt-8" style={{ animationDelay: "0.4s" }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4" /> Help insights</CardTitle>
        <span className="flex items-center gap-1 text-[11px] text-ink-3"><Snowflake className="h-3 w-3" /> from Snowflake · last 7 days</span>
      </CardHeader>
      <CardContent className="text-sm">
        {error ? <p className="text-ink-3">{error}</p> : !data ? <p className="animate-pulse text-ink-3">Querying Snowflake…</p> : data.total === 0 ? (
          <p className="text-ink-3">No help questions yet. Ask one with the Help button in the top bar.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="font-sub text-xs font-semibold text-ink-3">{data.total} question{data.total === 1 ? "" : "s"} · most asked about</p>
              <ul className="mt-2 space-y-1.5">
                {data.topics.map((t) => (
                  <li key={t.articleId} className="flex items-center justify-between gap-3">
                    <span className="truncate text-ink-2">{articleById(t.articleId)?.title ?? t.articleId}</span>
                    <span className="font-mono text-xs tabular-nums text-ink-3">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-sub text-xs font-semibold text-ink-3">Couldn&apos;t answer (write help for these)</p>
              {data.unanswered.length === 0 ? <p className="mt-2 text-ink-3">None this week.</p> : (
                <ul className="mt-2 space-y-1.5">
                  {data.unanswered.map((u, i) => <li key={i} className="truncate text-ink-2" title={`${u.question} · ${u.askedAt}`}>“{u.question}”</li>)}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
