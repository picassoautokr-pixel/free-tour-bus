"use client";

import { useMemo, useState } from "react";

import { QuoteDebugPanel } from "@/components/quote/QuoteDebugPanel";
import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";
import { buildQuoteDebugReport } from "@/lib/quote-debug-trace";
import type { QuoteDebugContext } from "@/lib/quote-debug-types";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function QuoteDebugButton({
  context,
  className = "",
}: {
  context: QuoteDebugContext;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const report = useMemo(() => buildQuoteDebugReport(context), [context]);

  if (!isQuoteDebugEnabled()) return null;

  return (
    <div
      className={`relative ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-950 ring-1 ring-amber-200 hover:bg-amber-200"
        style={tapStyle}
      >
        {open ? "디버그 닫기" : "디버그 표시"}
      </button>
      {open ? <QuoteDebugPanel report={report} /> : null}
    </div>
  );
}
