/** 파트너(제휴기사) 대시보드 UI 용어 — 전 화면 공통 */

export const PARTNER_DASHBOARD_TITLE = "견적관리";

export type PartnerDashboardTab = "new" | "quoted" | "matched";
export type MatchedRunFilter = "in_progress" | "completed";

export const PARTNER_DASHBOARD_TABS: Array<{
  id: PartnerDashboardTab;
  label: string;
  empty: string;
}> = [
  { id: "new", label: "신규 견적", empty: "신규 견적 요청이 없습니다." },
  { id: "quoted", label: "제출 견적", empty: "제출 견적이 없습니다." },
  { id: "matched", label: "매칭 성공", empty: "매칭 성공한 견적이 없습니다." },
];

export const MATCHED_RUN_FILTERS: Array<{
  id: MatchedRunFilter;
  label: string;
}> = [
  { id: "in_progress", label: "진행중" },
  { id: "completed", label: "진행완료" },
];

export const LABEL = {
  customer: "고객",
  partnerDriver: "제휴기사",
  guestDriver: "일반기사",
  estimatedSupport: "예상 지원금",
  confirmedSupport: "확정 지원금",
  totalPlannedSupport: "총 예상 지원금",
  totalConfirmedSupport: "총 확정 지원금",
  customerPlannedSupport: "고객 예상 지원금",
  partnerPlannedSupport: "기사 예상 지원금",
  customerConfirmedSupport: "고객 확정 지원금",
  partnerConfirmedSupport: "기사 확정 지원금",
  normalPrice: "일반견적가",
  supportDiscountExpectedPrice: "지원금 할인 예상가",
  supportDiscountPlannedPrice: "지원금 할인 예상가",
  supportDiscountAppliedPrice: "지원금 할인 적용가",
  extensionSupport: "연장 지원금",
  finalDiscountPrice: "최종 할인 적용가",
  tripType: "운행",
  busGrade: "차량등급",
  sponsor: "스폰서",
  sponsorStageReview: "지원검토",
  sponsorStageConfirmed: "지원확정",
  supportStage: "지원단계",
  settlementClientPriority: "고객 지원금 우선보장",
  settlementRatio: "비율정산",
  settlementMode: "지원금 정산모드",
  quoteDeadline: "남은 마감시간",
  quoteProgress: "견적 마감 현황",
  priorityTarget: "우선마감 목표가",
  untilDeparture: "출발시까지 남은 시간",
  customerInfo: "고객정보",
  customerMemo: "고객 메모",
  preferredTargetPrice: "희망목표가",
  preferredQuoteTypes: "희망견적유형",
  preferredNormalQuote: "일반견적",
  preferredDiscountQuote: "할인견적",
  departureDate: "출발일",
  departureTime: "출발시간",
  departureRegion: "출발지역",
  quoteCountRemaining: "남은 마감건수",
  selectedQuote: "선택 견적",
  extensionRound: "연장 회차",
  customerExpectedSupport: "고객 예상 지원금",
  partnerExpectedSupport: "기사 예상 지원금",
  customerConfirmedSupportInput: "고객 확정 지원금",
  partnerConfirmedSupportDisplay: "기사 확정 지원금",
  plannedExtensionSupport: "예상 연장 지원금",
  confirmedExtensionSupport: "확정 연장 지원금",
  contractNumber: "계약번호",
  customerName: "고객 이름",
  customerPhone: "전화번호",
  callCustomer: "전화하기",
  smsCustomer: "문자하기",
  submitQuote: "견적제출",
  editQuote: "견적수정",
  confirmQuote: "견적확인",
  referColleague: "동료 전달",
  myQuote: "내 견적",
  /** 공통 표시 */
  unconfirmed: "미확정",
  undated: "미정",
  dash: "—",
  wonSuffix: "원",
  separator: "·",
  passengerUnit: "명",
  /** 카드·폼 */
  passengerCount: "인원수",
  departure: "출발지",
  waypoint: "경유지",
  destination: "도착지",
  noSponsorInfo: "후원업체 정보 없음",
  sponsorStagePrefix: "후원업체 단계",
  priorityNormal: "일반",
  priorityDiscount: "할인",
  extensionAuto: "자동",
  vehicleType: "차량유형",
  availableTime: "가능 출발시간",
  memo: "기타 메모",
  quoteClosed: "마감됨",
  inProgress: "진행중",
  completed: "진행완료",
  expand: "펼치기",
  collapse: "접기",
  matchedAfterReveal: "매칭 후 공개",
  selectedPriceKind: "선택 견적",
  finalPaymentPrice: "최종 결제가격",
  saving: "저장 중…",
  saveEdit: "수정 저장",
  cancel: "취소",
  colleaguePhones: "동료기사 휴대폰번호",
  sending: "발송 중…",
  sendSms: "문자 발송",
  supportLimitHint: "이하로 입력해 주세요.",
} as const;

export const SETTLEMENT_OPTIONS = [
  {
    value: "client_priority" as const,
    title: LABEL.settlementClientPriority,
    description:
      "총 확정 지원금이 줄어도 고객 예정 지원금을 우선 반영하고, 남은 금액만 기사 확정 지원금으로 계산합니다.",
  },
  {
    value: "ratio" as const,
    title: LABEL.settlementRatio,
    description:
      "총 확정 지원금이 줄어들면 고객·기사 예정 비율을 유지한 채 자동 재계산합니다.",
  },
];

export const SUPPORT_UI = {
  planned: "text-blue-600 bg-blue-50 ring-blue-100",
  confirmed: "text-emerald-600 bg-emerald-50 ring-emerald-100",
  extension: "text-amber-600 bg-amber-50 ring-amber-100",
  unconfirmed: "text-slate-500 bg-slate-50 ring-slate-100",
} as const;
