"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationDetailPrimitives.tsx
// 공통 UI 프리미티브: SectionCard, InfoGrid, ModalShell
// ApplicationDetailMatchedPanel 및 관련 컴포넌트에서 공유
// ─────────────────────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100 ${className}`}
    >
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function InfoGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ModalShell({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-base font-black text-slate-950">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
