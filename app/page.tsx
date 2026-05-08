export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-sky-50 pb-24">
      <header className="flex h-[76px] items-center justify-between rounded-b-[2rem] bg-blue-600 px-6 text-white shadow-lg shadow-blue-900/20">
        <h1 className="rounded-xl bg-white px-4 py-2 text-lg font-black tracking-tight text-blue-700 shadow-sm">
          무료관광버스
        </h1>
        <button
          type="button"
          className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
        >
          로그인
        </button>
      </header>

      <section className="bg-sky-50 px-6 pb-20 pt-12 text-center">
        <p className="text-[2.05rem] font-black leading-[1.25] tracking-[-0.055em] text-slate-950">
          관광버스도 무료!
          <br />
          재테크 정보도 무료!
        </p>
        <p className="mt-6 text-base font-medium leading-8 tracking-[-0.03em] text-slate-500">
          열심히 일한 당신은 전액 무료~
          <br />
          신청만 하면 지원 가능~
        </p>
      </section>

      <section className="-mt-10 px-5">
        <div className="flex min-h-40 items-center justify-center rounded-[1.75rem] bg-white px-6 py-10 shadow-xl shadow-cyan-900/15 ring-1 ring-slate-100">
          <p className="text-lg font-bold tracking-[-0.03em] text-slate-700">
            신청폼 영역
          </p>
        </div>
      </section>

      <section className="mt-9 px-5">
        <div className="rounded-[1.5rem] bg-white p-6 shadow-lg shadow-cyan-900/10">
          <h2 className="mb-5 flex items-center gap-2 text-xl font-black tracking-[-0.04em] text-slate-950">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
              !
            </span>
            신청 조건
          </h2>

          <div className="space-y-4">
            <div className="rounded-xl bg-blue-50 p-5">
              <p className="flex items-center gap-2 text-lg font-black tracking-[-0.04em] text-slate-950">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.87M16 5.13a3 3 0 0 1 0 5.74"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                단체 인원
              </p>
              <p className="mt-3 text-sm font-medium text-slate-500">10인 이상</p>
            </div>

            <div className="rounded-xl bg-emerald-50 p-5">
              <p className="flex items-center gap-2 text-lg font-black tracking-[-0.04em] text-slate-950">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="m9 12 2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                지원 대상
              </p>
              <p className="mt-3 text-sm font-medium text-slate-500">
                직장 및 소속이 있는 단체
              </p>
            </div>

            <div className="rounded-xl bg-blue-50 p-5">
              <p className="flex items-center gap-2 text-lg font-black tracking-[-0.04em] text-slate-950">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
                  !
                </span>
                지원 제외
              </p>
              <p className="mt-3 text-sm font-medium text-slate-500">
                금융업, 일반 동호회
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-sm leading-6 text-slate-500">
            ※ 신청 후 관리자 심사를 거쳐 영업일 기준 3-5일 이내 결과를
            통보해드립니다
          </p>
        </div>
      </section>

      <button
        type="button"
        className="fixed bottom-6 right-[max(1.25rem,calc((100vw-480px)/2+1.25rem))] z-50 flex h-14 items-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950 shadow-xl shadow-yellow-900/25 transition hover:-translate-y-0.5 hover:bg-yellow-200 active:translate-y-0"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9H13a8.48 8.48 0 0 1 8 8v.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
        고객센터
      </button>
    </main>
  );
}
