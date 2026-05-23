"use client";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

export function ApplicationDetailSkeleton() {
  return (
    <div className="space-y-4 pb-6" aria-busy="true" aria-label="상세 정보 불러오는 중">
      <SectionBone titleWidth="w-28" rows={6} />
      <SectionBone titleWidth="w-24" rows={2} />
      <SectionBone titleWidth="w-24" rows={3} />
      <SectionBone titleWidth="w-20" rows={2} />
      <Bone className="h-11 w-full" />
      <Bone className="h-11 w-full" />
    </div>
  );
}

function SectionBone({ titleWidth, rows }: { titleWidth: string; rows: number }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <Bone className={`h-4 ${titleWidth}`} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} className="h-14 w-full" />
        ))}
      </div>
    </section>
  );
}

export function QuotesSectionSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true">
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-12 w-full" />
        ))}
      </div>
      <Bone className="h-24 w-full" />
      <Bone className="h-24 w-full" />
    </div>
  );
}
