import Link from "next/link";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export default function ClientDashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f8fb] px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] bg-white p-7 text-center shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료관광버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          내 견적요청서 조회
        </h1>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          내 견적요청서 조회 기능은 준비 중입니다.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          style={tapStyle}
        >
          메인으로
        </Link>
      </section>
    </main>
  );
}
