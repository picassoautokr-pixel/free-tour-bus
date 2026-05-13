"use client";

export type ContractPreviewData = {
  contractStatus: string;
  clientName: string;
  clientPhone: string;
  receiptNumber: string;
  driverCompanyName: string;
  driverManagerName: string;
  driverPhone: string;
  vehicleType: string;
  departure: string;
  stopovers?: string[];
  destination: string;
  departureDateTime: string;
  tripType: string;
  busGrade: string;
  passengerCount: number | null;
  requestMessage: string;
  normalPrice: number | null;
  memberPrice: number | null;
  estimatedSupportAmount: number | null;
  supportDiscountAmount: number | null;
  driverSupportAmount: number | null;
  clientRewardAmount: number | null;
  depositAmount: number | null;
};

const statusLabels: Record<string, string> = {
  pending: "계약 확인 대기",
  client_confirmed: "클라이언트 확인 완료",
  driver_confirmed: "기사 확인 완료",
  fully_confirmed: "양측 확인 완료",
  deposit_waiting: "예약금 입금 대기",
  deposit_paid: "예약금 입금 완료",
  ride_confirmed: "배차 확정",
  cancelled: "계약 취소",
};

function money(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toLocaleString("ko-KR")}원`;
}

function text(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "—" : trimmed;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <dt className="text-[11px] font-bold text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function ContractPreview({
  data,
  onClose,
}: {
  data: ContractPreviewData;
  onClose?: () => void;
}) {
  const route = [data.departure, ...(data.stopovers ?? []), data.destination]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" → ");
  const balance =
    data.memberPrice != null
      ? Math.max(data.memberPrice - (data.depositAmount ?? 0), 0)
      : data.normalPrice != null
        ? Math.max(data.normalPrice - (data.depositAmount ?? 0), 0)
        : null;

  return (
    <section className="rounded-[1.75rem] bg-white p-5 text-left shadow-2xl ring-1 ring-slate-200 print:shadow-none print:ring-0 sm:p-7">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            무료관광버스 전자계약서
          </p>
          <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">
            계약서 미리보기
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            신청번호 {text(data.receiptNumber)}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center rounded-full bg-indigo-50 px-3 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
          {statusLabels[data.contractStatus] ?? text(data.contractStatus)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Row label="갑 고객명/담당자" value={text(data.clientName)} />
        <Row label="갑 연락처" value={text(data.clientPhone)} />
        <Row label="을 업체명" value={text(data.driverCompanyName)} />
        <Row label="을 담당자/기사" value={text(data.driverManagerName)} />
        <Row label="을 연락처" value={text(data.driverPhone)} />
        <Row label="차량유형" value={text(data.vehicleType)} />
      </div>

      <div className="mt-5">
        <p className="text-sm font-black text-slate-950">운행 정보</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Row label="운행 경로" value={route || "—"} />
          <Row label="출발일시" value={text(data.departureDateTime)} />
          <Row label="왕복/편도" value={text(data.tripType)} />
          <Row label="일반/프리미엄" value={text(data.busGrade)} />
          <Row label="인원수" value={data.passengerCount ?? "—"} />
          <Row label="요청사항" value={<span className="whitespace-pre-wrap">{text(data.requestMessage)}</span>} />
        </dl>
      </div>

      <div className="mt-5">
        <p className="text-sm font-black text-slate-950">금액 정보</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Row label="일반 운행가" value={money(data.normalPrice)} />
          <Row label="지원금 적용 예상가" value={money(data.memberPrice)} />
          <Row label="예상 지원금" value={money(data.estimatedSupportAmount)} />
          <Row label="고객 반영 지원금" value={money(data.supportDiscountAmount)} />
          <Row label="기사 지원금" value={money(data.driverSupportAmount)} />
          <Row label="고객 감사지원금" value={money(data.clientRewardAmount)} />
          <Row label="예약금" value={money(data.depositAmount)} />
          <Row label="잔금 예상액" value={money(balance)} />
        </dl>
      </div>

      <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs font-semibold leading-6 text-amber-950 ring-1 ring-amber-100">
        <p>후원업체 지원금은 심사 결과에 따라 변동 또는 거절될 수 있습니다.</p>
        <p>최종 운행 조건은 갑과 을이 상호 확인해야 합니다.</p>
        <p>예약금 입금 후 배차가 확정됩니다.</p>
        <p>노쇼 및 취소 정책은 플랫폼 운영정책을 따릅니다.</p>
      </div>

      <div className="mt-5 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
        >
          인쇄하기
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800"
          >
            닫기
          </button>
        ) : null}
      </div>
    </section>
  );
}
