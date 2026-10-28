"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import type { CopilotAnswer } from "@/domain/ai/copilot";
import { Badge, buttonClass, cn, PriorityBadge } from "@/components/ui";
import { askAction } from "./actions";

type Turn = { q: string; a?: CopilotAnswer };

export function CopilotChat({ suggestions, configured }: { suggestions: string[]; configured: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setInput("");
    setTurns((t) => [...t, { q: question }]);
    start(async () => {
      const a = await askAction(question).catch(() => ({ mode: "deterministic" as const, text: "Something went wrong. Please try again.", refs: [], toolsUsed: [], error: true }));
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a } : turn)));
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Try asking</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-700 shadow-xs hover:border-brand-500 hover:text-slate-900">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <ol className="space-y-4" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className="space-y-3">
            <div className="flex justify-end gap-2">
              <p className="max-w-2xl rounded-lg bg-navy-800 px-3 py-2 text-sm text-white">{t.q}</p>
              <User className="mt-1 size-5 shrink-0 text-slate-400" aria-hidden />
            </div>
            <div className="flex gap-2">
              <Bot className="mt-1 size-5 shrink-0 text-accent-600" aria-hidden />
              <div className="min-w-0 max-w-3xl flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs">
                {!t.a ? (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" /> {configured ? "Thinking…" : "Looking up your records…"}
                  </p>
                ) : (
                  <Answer a={t.a} />
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 flex gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
      >
        <label htmlFor="copilot-input" className="sr-only">
          Ask the Copilot
        </label>
        <textarea
          id="copilot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask about work, compliance, inspections or contractors… or paste an issue to draft a work order"
          className="input resize-none border-0 shadow-none focus:ring-0"
        />
        <button type="submit" disabled={pending || !input.trim()} className={buttonClass("primary")} aria-label="Send">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
}

function Answer({ a }: { a: CopilotAnswer }) {
  const p = a.proposal;
  const href = p
    ? `/work-orders/new?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({ from: "copilot", title: p.title, description: p.description, priority: p.priority, categoryId: p.categoryId, siteId: p.siteId, locationText: p.locationText }).filter(([, v]) => v) as [string, string][],
        ),
      )}`
    : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {a.mode === "llm" ? <Badge tone="teal">AI · {a.model}</Badge> : <Badge tone="gray">Demo mode — deterministic lookup, not AI</Badge>}
        {a.toolsUsed.length > 0 && <span className="text-xs text-slate-500">Data: {[...new Set(a.toolsUsed)].map((t) => t.replace(/_/g, " ")).join(", ")}</span>}
      </div>
      <div className={cn("whitespace-pre-wrap text-sm leading-relaxed", a.error ? "text-red-700" : "text-slate-800")}>{a.text}</div>
      {p && href && (
        <div className="rounded-md border border-brand-500/30 bg-blue-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Proposed work order — not created yet</p>
          <p className="mt-1 font-medium text-slate-900">{p.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <PriorityBadge priority={p.priority} />
            <span>{p.categoryName ?? "Uncategorised"}</span>
            <span>· {p.siteName ?? "Site not matched"}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">{p.rationale}</p>
          <Link href={href} className={buttonClass("primary", "sm", "mt-3")}>
            Review & create
          </Link>
        </div>
      )}
      {a.refs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500">Sources</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {a.refs.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="inline-block max-w-xs truncate rounded border border-slate-200 px-2 py-0.5 text-xs text-brand-700 hover:bg-slate-50">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
