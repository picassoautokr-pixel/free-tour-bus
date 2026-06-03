/** 무료버스 견적 신청 조건 안내 섹션 */
export function ApplicationBenefitsSection() {
  return (
    <section className="mt-8 px-5">
      <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_14px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
        <h2 className="mb-5 flex items-center gap-2.5 text-xl font-black tracking-[-0.045em] text-slate-950">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
            !
          </span>
          무료버스 견적 신청 조건
        </h2>

        <div className="space-y-3.5">
          <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100/60">
            <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
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
            <p className="mt-3 text-sm font-semibold text-slate-500">10인 이상</p>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100/70">
            <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
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
            <p className="mt-3 text-sm font-semibold text-slate-500">
              직장 및 소속이 있는 단체
            </p>
          </div>

          <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100/60">
            <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
                !
              </span>
              지원 제외
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-500">
              금융업, 일반 동호회, 소속 확인이 어려운 임의 모임
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-medium leading-6 tracking-[-0.02em] text-slate-500">
          ※ 접수 후 기사 견적과 지원 가능 여부를 확인해 안내드립니다.
        </p>
      </div>
    </section>
  );
}
