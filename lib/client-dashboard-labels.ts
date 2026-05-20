/** 고객(클라이언트) 대시보드 UI 용어 — UTF-8 */

export const CLIENT_DASHBOARD_TITLE = "내 견적요청";

export type ClientMainTab = "requesting" | "auto_closed" | "matched";
export type MatchedRunFilter = "in_progress" | "completed";
export type ClientListSort = "deadline" | "quotes" | "region" | "passengers";

export const CLIENT_MAIN_TABS: Array<{ id: ClientMainTab; label: string }> = [
  { id: "requesting", label: "견적요청중" },
  { id: "auto_closed", label: "자동마감" },
  { id: "matched", label: "매칭완료" },
];

export const MATCHED_RUN_FILTERS: Array<{ id: MatchedRunFilter; label: string }> = [
  { id: "in_progress", label: "진행중" },
  { id: "completed", label: "진행완료" },
];

export const CLIENT_LIST_SORTS: Array<{ id: ClientListSort; label: string }> = [
  { id: "deadline", label: "남은 마감 시간순" },
  { id: "quotes", label: "기사견적 제출순" },
  { id: "region", label: "출발지역순" },
  { id: "passengers", label: "인원순" },
];

export const LABEL = {
  contractNo: "계약번호",
  departure: "출발지",
  waypoint: "경유지",
  destination: "도착지",
  departureAt: "출발일시",
  passengers: "인원",
  quoteCount: "견적건수",
  expand: "펼치기",
  collapse: "접기",
  quoteType: "견적유형",
  quoteTypeNew: "신규견적",
  quoteTypeOther: "타사견적",
  tripType: "운행",
  busGrade: "차량등급",
  returnDate: "오는 날짜",
  quoteDeadlineSettings: "견적마감설정",
  remainingTime: "남은시간",
  remainingCount: "남은건수",
  targetNormalPrice: "일반견적가 목표",
  targetSupportPrice: "지원금 할인가 목표",
  targetSupportPlanned: "지원금 할인 예정가 목표",
  targetSupportApplied: "지원금 할인 적용가 목표",
  groupName: "단체명",
  groupType: "단체유형",
  requestMemo: "기타요청사항",
  quoteSubmitList: "견적서 제출현황",
  normalPrice: "일반견적가",
  supportDiscountPlanned: "지원금 할인 예정가",
  supportDiscountApplied: "지원금 할인 적용가",
  finalDiscountPrice: "최종 할인 적용가",
  availableTime: "가능출발시간",
  driverMemo: "기사메모",
  viewDriverMemo: "기사메모 보기",
  viewQuoteDetail: "견적 상세",
  matchComplete: "매칭완료",
  matchWithNormal: "일반견적가로 매칭완료",
  matchWithSupport: "지원금 할인가로 매칭완료",
  memberQuote: "제휴기사 견적",
  guestQuote: "일반기사 견적",
  supportReviewing: "지원금 검토중",
  supportConfirmed: "지원금 확정",
  supportRejected: "지원금 미승인",
  noSupport: "지원금 없음",
  matchedPrice: "매칭견적가",
  selectedNormal: "일반견적가 선택",
  selectedSupportPlanned: "지원금 할인 예정가 선택",
  selectedSupportApplied: "지원금 할인 적용가 선택",
  partnerDriver: "제휴기사",
  guestDriver: "일반기사",
  companyName: "업체명",
  driverName: "기사명",
  phone: "전화번호",
  call: "전화연결",
  sms: "문자보내기",
  contactHidden: "매칭 전에는 기사·업체 정보가 비공개입니다.",
  contactRevealed: "매칭이 완료되어 기사 연락처가 공개되었습니다.",
  unconfirmed: "미확정",
  dash: "—",
  wonSuffix: "원",
  loading: "불러오는 중…",
  noItems: "표시할 견적요청이 없습니다.",
  confirmMatchTitle: "이 견적으로 매칭완료하시겠습니까?",
  confirmMatchHint: "매칭완료 후 기사·업체 연락처가 공개됩니다.",
  cancel: "취소",
  close: "닫기",
  lookup: "내 견적요청 조회",
  receiptLookup: "신청번호로 조회하기",
  mainLink: "메인으로",
  realtime: "실시간",
  countSuffix: "건",
} as const;

export function labelWithCount(label: string, count: number): string {
  return `${label} (${count})`;
}
