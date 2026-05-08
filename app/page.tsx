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

      <section className="bg-gradient-to-b from-sky-50 to-cyan-50 px-6 pb-20 pt-10 text-center">
        <p className="text-[2rem] font-black leading-[1.18] tracking-[-0.05em] text-slate-950">
          관광버스도 무료!
          <br />
          재테크 정보도 무료!
        </p>
        <p className="mt-6 text-base font-medium leading-7 tracking-[-0.03em] text-slate-500">
          열심히 일한 당신은 전액 무료~
          <br />
          신청만 하면 지원 가능~
        </p>
      </section>

      <section className="-mt-10 px-5">
        <div className="rounded-[1.75rem] bg-white px-6 py-7 shadow-xl shadow-cyan-900/15 ring-1 ring-slate-100">
          <div className="mb-6 grid grid-cols-4 items-center gap-3 text-center text-sm font-extrabold">
            <button
              type="button"
              className="rounded-full bg-emerald-500 px-3 py-2 text-white shadow-lg shadow-emerald-600/25"
            >
              왕복
            </button>
            <button type="button" className="rounded-full px-2 py-2 text-slate-900">
              편도
            </button>
            <button
              type="button"
              className="rounded-full bg-emerald-500 px-3 py-2 text-white shadow-lg shadow-emerald-600/25"
            >
              일반
            </button>
            <button type="button" className="px-1 py-2 text-slate-900">
              ◇ 프리미엄
            </button>
          </div>

          <div className="space-y-4">
            <input
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-5 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="출발지 입력"
            />
            <input
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-5 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="도착지 입력"
            />

            <button
              type="button"
              className="text-base font-bold tracking-[-0.03em] text-blue-500"
            >
              + 경유지 추가
            </button>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-400">
                가는 날짜
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-slate-950"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </label>
              <label className="flex h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-400">
                오는 날짜
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-slate-950"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                className="h-14 rounded-xl border border-slate-200 bg-white px-4 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="인원수 입력"
              />
              <input
                className="h-14 rounded-xl border border-slate-200 bg-white px-4 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="010-1234-5678"
              />
            </div>

            <input
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-5 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="신청자 이름"
            />
            <input
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-5 text-base outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="단체명 입력"
            />

            <label className="flex h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 text-base text-slate-400">
              선택해주세요
              <span className="text-xl leading-none text-slate-500">⌄</span>
            </label>
            <label className="flex h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 text-base text-slate-400">
              선택해주세요
              <span className="text-xl leading-none text-slate-500">⌄</span>
            </label>

            <div className="flex h-16 items-center gap-5 rounded-xl border border-slate-200 bg-white px-5">
              <button
                type="button"
                className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
              >
                파일 선택
              </button>
              <span className="text-sm text-slate-700">선택된 파일 없음</span>
            </div>

            <textarea
              className="min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-5 py-4 text-base leading-7 outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="기타 요청사항이 있으시면 입력해주세요"
            />

            <button
              type="button"
              className="h-16 w-full rounded-lg bg-slate-950 text-xl font-black tracking-[-0.04em] text-white shadow-lg shadow-slate-950/20"
            >
              견적 신청
            </button>
          </div>
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
        className="fixed bottom-6 right-[max(1.5rem,calc((100vw-480px)/2+1.5rem))] flex items-center gap-2 rounded-full bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-yellow-900/25 transition hover:bg-yellow-200"
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
