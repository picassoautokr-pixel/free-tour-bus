/** 후원업체(스폰서) 대시보드 UI 용어 — UTF-8 */

export const SPONSOR_DASHBOARD_TITLE = "후원업체 대시보드";

export type SponsorMainTab = "review" | "confirmed" | "rejected" | "settings";
export type ConfirmedPayoutFilter = "all" | "processing" | "completed";
export type CardExpandMode = "approve" | "reject" | "change" | null;

export const SPONSOR_MAIN_TABS: Array<{ id: SponsorMainTab; label: string }> = [
  { id: "review", label: "신규 지원검토" },
  { id: "confirmed", label: "지원확정 내역" },
  { id: "rejected", label: "지원거절" },
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
  waypoint: "경유지",
  destination: "도착지",
  departureAt: "출발일시",
  passengers: "인원",
  quoteDeadline: "남은 마감시간",
  quoteProgress: "총 견적 수",
  matchStage: "매칭단계",
  matchBefore: "매칭전",
  matchDone: "매칭완료",
  supportKind: "지원종류",
  supportForm: "지원형태",
  supportCondition: "지원조건",
  payoutStatus: "지급상태",
  payoutProcessing: "지급중",
  payoutCompleted: "지급완료",
  staff: "담당자",
  memo: "메모",
  confirmSupport: "지원 확정",
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
  matchedLockHint:
    "매칭이 완료된 지원건은 지원예정 전환 또는 지원취소가 제한됩니다.",
  noReviewItems: "표시할 신규 지원검토 요청이 없습니다.",
  noConfirmedItems: "표시할 지원확정 내역이 없습니다.",
  noRejectedItems: "표시할 지원거절 내역이 없습니다.",
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
  settingsRules: "지원조건 설정",
  settingsStaff: "담당자 설정",
  settingsSupportKind: "지원종류 설정",
  settingsSupportForm: "지원형태 설정",
  settingsSupportCondition: "지원조건 설정",
  reportTotalBudget: "총 지원금 예산",
  reportUsed: "현재 지원금 사용현황",
  reportTodayConfirmed: "오늘 확정 지원금",
  reportMonthConfirmed: "이번 달 확정 지원금",
  reportRemaining: "남은 예산",
  reportReviewCount: "신규 지원검토",
  reportConfirmedCount: "지원확정",
  reportPayoutProcessing: "지급중",
  reportPayoutCompleted: "지급완료",
  companyStatus: "상태",
  detailBreakdown: "분배 상세 (참고)",
  customerPlannedSupport: "고객 예정 지원금",
  partnerPlannedSupport: "기사 예정 지원금",
  customerConfirmedSupport: "고객 확정 지원금",
  partnerConfirmedSupport: "기사 확정 지원금",
} as const;

export const SUPPORT_UI = {
  planned: "text-blue-700 bg-blue-50 ring-blue-100",
  confirmed: "text-emerald-700 bg-emerald-50 ring-emerald-100",
  danger: "text-red-700 bg-red-50 ring-red-100",
  payout: "text-violet-700 bg-violet-50 ring-violet-100",
  muted: "text-slate-600 bg-slate-50 ring-slate-100",
} as const;
