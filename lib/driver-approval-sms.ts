/**
 * 제휴기사 승인 알림 문자 — 추후 솔라피(`solapi`) 연동 시 구현.
 * 기존 `/api/admin/sms/send` 와 동일한 인증·번호 정규화 패턴을 따르면 됩니다.
 *
 * @returns 실제 발송 성공 여부 (현재는 항상 false, 추후 true 반환)
 */
export async function sendDriverApprovalSms(_params: {
  toPhone: string;
  /** 담당자 등 표시용 */
  managerName?: string;
  companyName?: string;
  /** 초대·비밀번호 재설정 링크가 있으면 메시지에 포함 가능 */
  infoLine?: string;
}): Promise<boolean> {
  // TODO(Solapi): SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER 설정 후
  // SolapiMessageService 로 발송. 관리자 SMS API와 중복 방지를 위해 템플릿만 분리 권장.
  void _params;
  return Promise.resolve(false);
}
