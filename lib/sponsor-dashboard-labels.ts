/** 후원업체(스폰서) 대시보드 UI 용어 — UTF-8 */

export const SPONSOR_DASHBOARD_TITLE = "후원업체 대시보드";

export type SponsorMainTab = "review" | "confirmed" | "settings";
export type ConfirmedPayoutFilter = "all" | "processing" | "completed";
export type CardExpandMode = "support_input" | "edit" | null;

export const SPONSOR_MAIN_TABS: Array<{ id: SponsorMainTab; label: string }> = [
  { id: "review", label: "지원검토" },
  { id: "confirmed", label: "지원확정" },
  { id: "settings", label: "설정" },
];

/** 탭·필터 라벨 + 건수 (0이어도 표시) */
export function labelWithCount(label: string, count: number): string {
  return `${label} (${count})`;
}

export const PAYOUT_FILTERS: Array<{ id: ConfirmedPayoutFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "processing", label: "지급중" },
  { id: "completed", label: "지급완료" },
];

export const CANCEL_REASONS = [
  "조건 불일치",
  "예산 부족",
  "중복 신청",
  "고객 요청",
  "내부 검토 결과",
  "기타",
] as const;

export const LABEL = {
  customer: "고객",
  driver: "기사",
  partnerDriver: "제휴기사",
  estimatedSupport: "예상 지원금",
  confirmedSupport: "확정 지원금",
  totalPlannedSupport: "총 예정 지원금",
  totalConfirmedSupport: "총 확정 지원금",
  tripType: "운행",
  busGrade: "차량등급",
  groupType: "단체유형",
  departureRegion: "출발지역",
  departure: "출발지",
  departureTime: "출발시간",
  untilDeparture: "남은 출발시간",
  waypoint: "경유지",
  destination: "도착지",
  departureAt: "출발일시",
  passengers: "인원",
  quoteDeadline: "남은 마감시간",
  quoteProgress: "총 견적 수",
  matchStage: "매칭단계",
  matchQuoteCollecting: "견적요청중",
  matchAutoClosed: "자동마감",
  matchCompleted: "매칭완료",
  supportKind: "지원종류",
  supportKindName: "지원종류명",
  supportForm: "지원형태",
  supportCondition: "지원조건",
  targetGroups: "지원단체",
  perPersonSupport: "인당 지원금",
  perCaseSupport: "건당 지원금",
  maxSupport: "최대 지원금",
  minPassengers: "최소 인원",
  payoutStatus: "지급상태",
  payoutProcessing: "지급중",
  payoutCompleted: "지급완료",
  staff: "담당자",
  staffName: "이름",
  staffContact: "연락처",
  staffEmail: "이메일",
  staffRole: "역할",
  staffRegion: "담당지역",
  memo: "메모",
  confirmSupport: "지원확정",
  supportInput: "지원금입력",
  editSupport: "수정",
  customerInfo: "고객정보",
  customerInfoTitle: "고객·기사 정보",
  driverInfo: "기사정보",
  changeSupport: "지원 변경",
  cancelSupport: "지원 취소",
  completePayout: "지급완료 처리",
  revertToPlanned: "지원예정 전환",
  cancelConfirm: "취소 확정",
  cancelReason: "취소 사유",
  cancelReasonCustom: "취소 사유 직접 입력",
  expand: "펼치기",
  collapse: "접기",
  unconfirmed: "미확정",
  dash: "—",
  wonSuffix: "원",
  save: "저장",
  saveSupportKind: "지원종류 저장",
  saveStaff: "저장",
  delete: "삭제",
  selectSupportKind: "지원종류 선택",
  selectStaff: "담당자 선택",
  viewSupportKinds: "지원종류보기",
  viewStaff: "담당자보기",
  newSupportKind: "새 지원종류",
  newStaff: "새 담당자",
  matchedLockHint:
    "매칭이 완료된 지원건은 지원예정 전환 또는 지원취소가 제한됩니다.",
  noReviewItems: "표시할 지원검토 요청이 없습니다.",
  noConfirmedItems: "표시할 지원확정 내역이 없습니다.",
  rejectReason: "사유",
  groupName: "단체명",
  supportReferenceOnly: "참고용",
  loading: "불러오는 중…",
  refresh: "새로고침",
  logout: "로그아웃",
  soundOn: "알림음 끄기",
  soundOff: "알림음 켜기",
  browserNotifyOn: "브라우저 알림 켜짐",
  browserNotify: "브라우저 알림 켜기",
  newReviewToast: "새 지원검토 요청이 도착했습니다.",
  settingsSupportKinds: "지원종류",
  settingsStaff: "담당자 설정",
  reportTotalBudget: "총 지원금 예산",
  reportUsed: "현재 지원금 사용현황",
  reportTodayConfirmed: "오늘 확정 지원금",
  reportMonthConfirmed: "이번 달 확정 지원금",
  reportRemaining: "남은 예산",
  reportReviewCount: "지원검토",
  reportConfirmedCount: "지원확정",
  reportPayoutProcessing: "지급중",
  reportPayoutCompleted: "지급완료",
  companyStatus: "상태",
  plannedSupportAuto: "예정 지원금",
} as const;

export const SUPPORT_UI = {
  planned: "text-blue-700 bg-blue-50 ring-blue-100",
  confirmed: "text-emerald-700 bg-emerald-50 ring-emerald-100",
  danger: "text-red-700 bg-red-50 ring-red-100",
  payout: "text-violet-700 bg-violet-50 ring-violet-100",
  muted: "text-slate-600 bg-slate-50 ring-slate-100",
} as const;
