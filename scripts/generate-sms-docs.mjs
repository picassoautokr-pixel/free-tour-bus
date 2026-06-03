import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 데이터 ────────────────────────────────────────────────────────────────

const rows = [
  {
    번호: 1,
    실제발송여부: "비활성 (불필요)",
    발송시점: "견적 수집 마감 직후",
    트리거: "processApplicationQuoteLifecycle() → closeApplication() → notifyQuoteClosed()\n(견적 제출·조회·관리자 조작 등으로 라이프사이클 재실행 시)",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료관광버스]\n견적 접수가 마감되었습니다.\n\n총 접수 견적: {quoteCount}건\n최저 견적: {최저가}원\n\n견적 확인:\nhttps://free-bus.co.kr/client/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyQuoteClosed",
    비고: "마감 상태: closed_by_time / closed_by_quote_count / closed_by_price / manually_closed",
  },
  {
    번호: 2,
    실제발송여부: "O",
    발송시점: "마감 후 최저가 자동매칭 후보 선정 직후",
    트리거: "processApplicationQuoteLifecycle() → autoSelectIfNeeded() → notifyAutoSelected()\n(auto_selected_quote_id 비어 있을 때)",
    수신자: "자동 선정된 기사(회원/비회원)",
    수신번호출처: "회원: driver_quotes → partner_drivers.phone\n비회원: guest_driver_quotes.guest_phone",
    문자내용: "[무료관광버스]\n최저가 자동매칭 후보로 선정되었습니다.\n\n최종 확정 시 고객 연락처가 공개됩니다.\n* 확정매칭은 변경될 수 있습니다.\n\n콜 확인:\nhttps://partner.free-bus.co.kr/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyAutoSelected (기사 분기)",
    비고: "",
  },
  {
    번호: 3,
    실제발송여부: "O",
    발송시점: "번호 2와 동시 (자동매칭 후보 선정)",
    트리거: "동일 (notifyAutoSelected)",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료관광버스]\n최저가 자동매칭이 완료되었습니다.\n\n총 견적: {quoteCount}건\n최저가: {최저가}원\n\n최종확정 예정시간:\n{자동확정일시}\n\n직접 확정 또는 다른 견적 선택이 가능합니다.\nhttps://free-bus.co.kr/client/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyAutoSelected (고객 분기)",
    비고: "",
  },
  {
    번호: 4,
    실제발송여부: "O",
    발송시점: "auto_final_confirm_at 시각 경과 후 자동 최종 확정 직후",
    트리거: "processApplicationQuoteLifecycle() → autoFinalConfirmIfDue() → notifyFinalSelected()",
    수신자: "최종 선정 기사(회원/비회원)",
    수신번호출처: "동일 (getSelectedQuoteContact)",
    문자내용: "[무료관광버스]\n최종 매칭이 확정되었습니다.\n\n고객 연락처와 운행 정보를 확인해주세요.\n\n확인:\nhttps://partner.free-bus.co.kr/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyFinalSelected (기사 분기)",
    비고: "",
  },
  {
    번호: 5,
    실제발송여부: "비활성 (불필요)",
    발송시점: "번호 4와 동시 (자동 최종 확정)",
    트리거: "동일 (notifyFinalSelected)",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료관광버스]\n전세버스 매칭이 최종확정되었습니다.\n\n예약금 및 전자계약 절차를 진행해주세요.\n\n확인:\nhttps://free-bus.co.kr/client/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyFinalSelected (고객 분기)",
    비고: "",
  },
  {
    번호: 6,
    실제발송여부: "O",
    발송시점: "자동 최종 확정 직후 — 미선정 비회원 견적자 전원",
    트리거: "autoFinalConfirmIfDue() → notifyGuestNotSelected()",
    수신자: "해당 콜의 미선정 비회원 견적 제출자(복수)",
    수신번호출처: "guest_driver_quotes.guest_phone",
    문자내용: "[무료관광버스]\n아쉽게도 이번 견적은 선택되지 않았습니다.\n\n이번 콜의 평균 견적가는 {평균가}원입니다.\n다음 콜부터 실시간으로 참여하려면 제휴기사로 가입해주세요.\n\n가입하기:\nhttps://partner.free-bus.co.kr/register?invitePhone={전화번호}",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyGuestNotSelected",
    비고: "sendNotificationSms 사용 (notification_logs 중복 방지)",
  },
  {
    번호: 7,
    실제발송여부: "O",
    발송시점: "마감 시점 견적 0건 → 12시간 자동 연장 후",
    트리거: "processApplicationQuoteLifecycle() → autoExtendNoQuotes() → notifyExtendedNoQuotes()\n(연장 회차 < 6)",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료관광버스]\n현재 접수된 견적이 없어 동일 조건으로 견적요청이 자동 연장되었습니다.\n\n연장 회차: {N}회차\n다음 마감: {다음마감일시}\n\n견적유지 감사지원금 혜택이 적용될 수 있습니다.\n\n확인:\nhttps://free-bus.co.kr/client/dashboard",
    관련파일: "lib/quote-auction.ts",
    함수명: "notifyExtendedNoQuotes",
    비고: "",
  },
  {
    번호: 8,
    실제발송여부: "비활성 (불필요)",
    발송시점: "고객이 대시보드에서 직접 매칭 견적 최종 선택(final_confirm) 직후",
    트리거: "POST /api/client/quotes  (action: final_confirm)",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료전세버스] 최종 견적 선택이 완료되었습니다. 선택한 기사 연락처를 대시보드에서 확인해 주세요.",
    관련파일: "app/api/client/quotes/route.ts",
    함수명: "POST handler → sendNotificationSms (customer)",
    비고: "브랜드명 '무료전세버스' (번호 4~5 '무료관광버스'와 상이, 정합 필요)",
  },
  {
    번호: 9,
    실제발송여부: "O",
    발송시점: "번호 8과 동시 (선택된 기사 번호가 있을 때)",
    트리거: "동일",
    수신자: "선택된 기사(회원/비회원)",
    수신번호출처: "비회원: guest_driver_quotes.guest_phone\n회원: partner_drivers.phone",
    문자내용: "[무료관광버스] 고객이 견적을 최종 선택했습니다. 대시보드에서 고객 연락처를 확인해 주세요.\n\n파트너 대시보드:\nhttps://partner.free-bus.co.kr/dashboard",
    관련파일: "app/api/client/quotes/route.ts",
    함수명: "POST handler → sendNotificationSms (driver)",
    비고: "브랜드명 [무료관광버스]로 통일 + 파트너 대시보드 링크 추가",
  },
  {
    번호: 10,
    실제발송여부: "O",
    발송시점: "후원업체(또는 관리자)가 지원금 사전승인을 «지원확정» 처리 직후",
    트리거: "approveSponsorPreapproval() ← sponsor/admin preapproval API",
    수신자: "고객(신청자)",
    수신번호출처: "applications.phone",
    문자내용: "[무료전세버스]\n후원업체 지원금이 승인되었습니다. 견적 비교 화면에서 지원금 적용가를 확인해주세요.",
    관련파일: "lib/sponsor-preapproval-actions.ts",
    함수명: "approveSponsorPreapproval → sendNotificationSms",
    비고: "",
  },
  {
    번호: 11,
    실제발송여부: "O",
    발송시점: "번호 10과 동시 — 담당 직원(assignedStaffId)이 지정된 경우만",
    트리거: "동일",
    수신자: "후원업체 담당자",
    수신번호출처: "sponsor_staff.phone",
    문자내용: "[무료전세버스]\n지원금 매칭 건이 배정되었습니다.\n\n후원업체: {회사명}\n지원금: {확정금액}원\n출발: {출발지}\n도착: {도착지}\n일시: {출발일}\n\n대시보드에서 확인해주세요.\nhttps://sponsor.free-bus.co.kr/dashboard",
    관련파일: "lib/sponsor-preapproval-actions.ts",
    함수명: "approveSponsorPreapproval → sendNotificationSms (staff)",
    비고: "",
  },
  {
    번호: 12,
    실제발송여부: "비활성 (불필요 + 번호 오류)",
    발송시점: "후원 사전승인 «지원취소/반려» 처리 직후",
    트리거: "rejectSponsorPreapproval()",
    수신자: "관리자(의도) — 실제 발송 안 됨",
    수신번호출처: "target_phone: \"admin\" (유효 010 아님 → invalid_phone)",
    문자내용: "후원업체 지원이 취소되었습니다: {사유 또는 '사유 없음'}",
    관련파일: "lib/sponsor-preapproval-actions.ts",
    함수명: "rejectSponsorPreapproval → sendNotificationSms",
    비고: "수신번호가 'admin' 문자열이라 실제 발송 실패. 추후 관리자 번호로 수정 필요",
  },
  {
    번호: 13,
    실제발송여부: "비활성 예정 (수동, 불필요)",
    발송시점: "관리자가 신청 상세에서 «문자 발송» 버튼 클릭 시",
    트리거: "관리자 UI → POST /api/admin/sms/send",
    수신자: "해당 신청 고객 (관리자 수정 가능)",
    수신번호출처: "요청 body.to (UI: applications.phone)",
    문자내용: "관리자 입력값. 기본 템플릿(status별):\n- pending: [지원금 전세버스] 지원금 가승인 신청이 정상 접수되었습니다…\n- reviewing: …검토 중…\n- approved: …가승인 완료…\n- 기타: …가승인이 어렵습니다. 사유: {admin_memo}",
    관련파일: "app/api/admin/sms/send/route.ts\napp/admin/page.tsx (buildDefaultSmsText)",
    함수명: "POST → Solapi 직접 호출",
    비고: "Solapi 직접 호출 (notification_logs 미사용)",
  },
  {
    번호: 14,
    실제발송여부: "O (수동)",
    발송시점: "관리자가 제휴기사 «임시 계정 발급» 또는 «비밀번호 재설정 문자발송» 실행 시",
    트리거: "POST /api/admin/partner-drivers/issue-temp-account  (mode: issue | reset)",
    수신자: "해당 제휴기사",
    수신번호출처: "partner_drivers.phone (010 정규화)",
    문자내용: "[무료관광버스]\n제휴기사 계정이 발급되었습니다.\n\n로그인 주소:\nhttps://www.free-bus.co.kr/partner/login\n\n아이디:\n{아이디}\n\n임시 비밀번호:\n{임시비밀번호}\n\n로그인 후 비밀번호를 변경해 주세요.",
    관련파일: "app/api/admin/partner-drivers/issue-temp-account/route.ts",
    함수명: "buildSmsText, sendSolapiSms",
    비고: "Solapi 직접 호출",
  },
  {
    번호: 15,
    실제발송여부: "O",
    발송시점: "제휴기사 회원가입 완료 후 — 비가입 실제 추천인 번호가 있을 때",
    트리거: "POST /api/partner/register 성공 후",
    수신자: "실제 추천인(미가입자)",
    수신번호출처: "요청 body.actual_referrer_phone (정규화 digits)",
    문자내용: "[무료관광버스]\n방금 소개해주신 {신청자명}님이 무료버스 제휴기사로 회원가입을 신청하셨습니다.\n\n앞으로 저희 무료버스와 함께해주시면 더욱 감사드리겠습니다.\n\n제휴기사 등록:\nhttps://partner.free-bus.co.kr/register?invitePhone={전화번호}",
    관련파일: "app/api/partner/register/route.ts",
    함수명: "sendManualReferralInviteSms",
    비고: "이미 제휴기사(approved/pending/reviewing)인 번호는 발송 안 함",
  },
  {
    번호: 16,
    실제발송여부: "O",
    발송시점: "승인된 제휴기사가 «동료 전달» 기능으로 다른 기사 번호 입력 시",
    트리거: "POST /api/partner/quote-referrals",
    수신자: "전달 대상 기사(입력 번호 목록, 중복·무효 제외)",
    수신번호출처: "요청 body.phones / referred_phone",
    문자내용: "[무료관광버스]\n전세버스 견적요청이 전달되었습니다.\n\n출발: {출발지}\n{경유지 있으면: 경유: {경유지}}\n도착: {도착지}\n일시: {일시}\n인원: {인원수}\n\n견적 확인:\nhttps://free-bus.co.kr/shared-quote/{token}\n\n제휴기사 등록:\nhttps://partner.free-bus.co.kr/register?ref={token}",
    관련파일: "app/api/partner/quote-referrals/route.ts",
    함수명: "POST handler → Solapi 루프",
    비고: "콜 미마감·신규예약 유형·일 100건 제한 내 발송",
  },
  {
    번호: 17,
    실제발송여부: "O (수동)",
    발송시점: "관리자가 비회원 견적의 match_result를 not_selected로 변경 시",
    트리거: "PATCH /api/admin/driver-quotes  (guest_quote match_result → not_selected)",
    수신자: "해당 비회원 견적 제출자",
    수신번호출처: "guest_driver_quotes.guest_phone (010 형식일 때만)",
    문자내용: "[무료관광버스]\n아쉽게도 이번 견적은 선택되지 않았습니다.\n\n이번 콜의 평균 견적가는 {평균가}원입니다.\n다음 콜부터 실시간으로 참여하려면 제휴기사로 가입해주세요.\n\n가입하기:\nhttps://partner.free-bus.co.kr/register?invitePhone={전화번호}",
    관련파일: "app/api/admin/driver-quotes/route.ts",
    함수명: "PATCH handler → Solapi 직접",
    비고: "notification_logs 미사용, guest_driver_quotes.result_notified_at 저장",
  },
  {
    번호: 18,
    실제발송여부: "X (미구현·비활성)",
    발송시점: "신규 견적요청 저장 후 (설계만)",
    트리거: "POST /api/notifications/new-application",
    수신자: "관리자·지역 기사 (의도)",
    수신번호출처: "—",
    문자내용: "[무료관광버스]\n새 전세버스 견적요청이 등록되었습니다.\n\n출발: …\n도착: …\n일시: …\n인원: …\n\n콜 확인:\nhttps://partner.free-bus.co.kr/dashboard",
    관련파일: "app/api/notifications/new-application/route.ts",
    함수명: "logNotification only",
    비고: "MVP 비활성: 'regional driver SMS dispatch is disabled.'",
  },
  {
    번호: 19,
    실제발송여부: "X (미구현)",
    발송시점: "관리자가 제휴기사 승인 처리 시 (설계만)",
    트리거: "POST /api/admin/partner-drivers/status",
    수신자: "승인된 제휴기사",
    수신번호출처: "partner_drivers.phone",
    문자내용: "(미구현 — 파라미터 전달만, Solapi 미호출)",
    관련파일: "lib/driver-approval-sms.ts",
    함수명: "sendDriverApprovalSms (항상 false 반환)",
    비고: "추후 구현 필요",
  },
];

// ─── 시트 1: 전체 목록 ────────────────────────────────────────────────────

const headers = [
  "번호", "실제발송여부", "발송시점", "트리거", "수신자",
  "수신번호출처", "문자내용", "관련파일", "함수명", "비고",
];

const sheetData = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];

const ws = XLSX.utils.aoa_to_sheet(sheetData);

// 열 너비 설정
ws["!cols"] = [
  { wch: 5 },   // 번호
  { wch: 12 },  // 실제발송여부
  { wch: 30 },  // 발송시점
  { wch: 55 },  // 트리거
  { wch: 20 },  // 수신자
  { wch: 35 },  // 수신번호출처
  { wch: 65 },  // 문자내용
  { wch: 50 },  // 관련파일
  { wch: 40 },  // 함수명
  { wch: 40 },  // 비고
];

// 헤더 행 높이 / 데이터 행 높이 (줄바꿈 고려)
ws["!rows"] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 80 }))];

// 모든 셀 스타일: 줄바꿈 허용
const range = XLSX.utils.decode_range(ws["!ref"]);
for (let R = range.s.r; R <= range.e.r; R++) {
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      alignment: { wrapText: true, vertical: "top" },
      font: R === 0 ? { bold: true } : undefined,
    };
  }
}

// ─── 시트 2: 발송 여부 요약 ───────────────────────────────────────────────

const summaryData = [
  ["구분", "시나리오 번호", "설명"],
  ["O (실제 발송)", "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17", "정상 발송됨"],
  ["△ (번호 오류로 미발송)", "12", "수신번호가 'admin' 문자열 → 발송 실패. 관리자 번호 수정 필요"],
  ["X (미구현·비활성)", "18, 19", "코드만 있고 실제 Solapi 호출 없음. 추후 구현 필요"],
];

const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
wsSummary["!cols"] = [{ wch: 22 }, { wch: 45 }, { wch: 50 }];

// ─── 시트 3: 문자 발송 시스템 개요 ───────────────────────────────────────

const overviewData = [
  ["항목", "내용"],
  ["발송 API", "Solapi (SolapiMessageService)"],
  ["환경변수", "SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER (또는 SOLAPI_SENDER)"],
  ["중앙 발송 함수", "lib/notification-service.ts → sendNotificationSms()"],
  ["중복 방지", "notification_logs 테이블: 동일 application_id + target_phone + notification_type 조합 시 스킵\n(allowDuplicate: true 옵션으로 예외 가능)"],
  ["발송 제외 조건", "① 수신번호가 010으로 시작하는 11자리가 아닌 경우\n② Solapi 환경변수 미설정\n③ 중복 알림으로 판단된 경우"],
  ["직접 Solapi 호출", "13(관리자 수동), 14(임시계정 발급), 16(동료전달), 17(관리자 미선정)\n→ notification_logs 미사용"],
  ["브랜드명 불일치 주의",
   "번호 1~7: [무료관광버스]\n번호 8~9: [무료전세버스]\n번호 10~11: [무료전세버스]\n번호 14~17: [무료관광버스]\n→ 통일 검토 권장"],
];

const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
wsOverview["!cols"] = [{ wch: 22 }, { wch: 75 }];
wsOverview["!rows"] = overviewData.map(() => ({ hpt: 55 }));
for (let R = 0; R < overviewData.length; R++) {
  for (let C = 0; C < 2; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    if (!wsOverview[addr]) continue;
    wsOverview[addr].s = {
      alignment: { wrapText: true, vertical: "top" },
      font: R === 0 || C === 0 ? { bold: true } : undefined,
    };
  }
}

// ─── 워크북 조합 & 저장 ───────────────────────────────────────────────────

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "문자발송 시나리오");
XLSX.utils.book_append_sheet(wb, wsSummary, "발송여부 요약");
XLSX.utils.book_append_sheet(wb, wsOverview, "시스템 개요");

const outPath = path.join(__dirname, "..", "docs", "sms-scenarios.xlsx");
XLSX.writeFile(wb, outPath, { cellStyles: true });
console.log("✅ 생성 완료:", outPath);
