"use client";

import { useMemo, useState } from "react";

import type { QuoteDebugReport } from "@/lib/quote-debug-types";

function TraceRow({ entry }: { entry: QuoteDebugReport["sections"][0]["entries"][0] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed text-slate-800">
      <p className="font-black text-slate-950">{entry.title}</p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-slate-500">값</dt>
          <dd className="font-mono">{entry.value}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-slate-500">필드</dt>
          <dd className="break-all font-mono text-[10px]">{entry.fields.join(", ") || "—"}</dd>
        </div>
        {entry.formula ? (
          <div>
            <dt className="font-bold text-slate-500">계산식</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-mono text-[10px] text-blue-900">
              {entry.formula}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-slate-500">결과</dt>
          <dd className="font-mono font-black text-emerald-900">{entry.result}</dd>
        </div>
        {entry.calculator ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-slate-500">함수</dt>
            <dd className="break-all font-mono text-[10px] text-violet-800">{entry.calculator}</dd>
          </div>
        ) : null}
        {entry.priority ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-slate-500">우선</dt>
            <dd className="font-mono text-[10px]">{entry.priority}</dd>
          </div>
        ) : null}
        {entry.fallback ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-amber-700">fallback</dt>
            <dd className="font-mono text-[10px] text-amber-900">{entry.fallback}</dd>
          </div>
        ) : null}
        {entry.notes ? (
          <p className="text-[10px] text-slate-500">{entry.notes}</p>
        ) : null}
      </dl>
    </div>
  );
}

export function QuoteDebugPanel({ report }: { report: QuoteDebugReport }) {
  const [rawOpen, setRawOpen] = useState(false);
  const rawJson = useMemo(() => JSON.stringify(report.raw, null, 2), [report.raw]);

  return (
    <div
      className="mt-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/80 p-3 text-left"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-black text-amber-950">[견적 계산 디버그]</p>
      <p className="mt-0.5 text-[10px] font-bold text-amber-800">
        role={report.role} · {report.generatedAt}
      </p>

      {report.errors.length > 0 ? (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2">
          <p className="text-[11px] font-black text-red-900">[계산 오류 감지]</p>
          <ul className="mt-1 list-inside list-disc text-[10px] font-bold text-red-800">
            {report.errors.map((err) => (
              <li key={err.code}>{err.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 max-h-[min(70vh,520px)] space-y-3 overflow-y-auto">
        {report.sections.map((section) => (
          <section key={section.id}>
            <h4 className="sticky top-0 z-[1] bg-amber-50/95 py-1 text-[11px] font-black text-amber-950">
              {section.title}
            </h4>
            <div className="mt-1.5 space-y-2">
              {section.entries.map((e) => (
                <TraceRow key={`${section.id}-${e.id}`} entry={e} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 border-t border-amber-200 pt-2">
        <button
          type="button"
          className="text-[11px] font-black text-amber-900 underline"
          onClick={() => setRawOpen((v) => !v)}
        >
          [RAW JSON 보기] {rawOpen ? "▲" : "▼"}
        </button>
        {rawOpen ? (
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-snug text-emerald-100">
            {rawJson}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
