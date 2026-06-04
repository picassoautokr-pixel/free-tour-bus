/**
 * lib/driver-approval-sms.ts
 *
 * 제휴기사 승인 알림 문자 — Solapi(`solapi`) 연동.
 * admin/sms/send/route.ts 와 동일한 인증·번호 정규화 패턴을 따릅니다.
 *
 * ## 필요 환경변수
 * - SOLAPI_API_KEY
 * - SOLAPI_API_SECRET
 * - SOLAPI_SENDER_NUMBER (또는 SOLAPI_SENDER)
 *
 * 환경변수가 설정되지 않은 경우 발송을 건너뛰고 false를 반환합니다.
 */

import { SolapiMessageService } from "solapi";

/** 솔라피에 넘길 국내 휴대폰 번호 (하이픈 없이 010xxxxxxxx) */
function normalizeKoreanMobileDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

function buildApprovalMessage(params: {
  managerName?: string;
  companyName?: string;
  infoLine?: string;
}): string {
  const name = params.managerName?.trim() || "담당자";
  const company = params.companyName?.trim() || "";
  const infoLine = params.infoLine?.trim() || "";
  const lines = [
    `[무료버스] ${company ? `${company} ` : ""}${name}님, 제휴기사 승인이 완료되었습니다.`,
    "파트너 대시보드에서 견적 요청을 확인하실 수 있습니다.",
  ];
  if (infoLine) lines.push(infoLine);
  return lines.join("\n");
}

/**
 * 제휴기사 승인 알림 SMS를 발송합니다.
 *
 * @returns 발송 성공 여부
 */
export async function sendDriverApprovalSms(params: {
  toPhone: string;
  /** 담당자 등 표시용 */
  managerName?: string;
  companyName?: string;
  /** 초대·비밀번호 재설정 링크가 있으면 메시지에 포함 가능 */
  infoLine?: string;
}): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ?? process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !from) {
    console.warn(
      "[driver-approval-sms] Solapi 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않아 SMS 발송을 건너뜁니다.",
    );
    return false;
  }

  const to = normalizeKoreanMobileDigits(params.toPhone);
  if (!to) {
    console.warn("[driver-approval-sms] 유효하지 않은 휴대폰 번호:", params.toPhone);
    return false;
  }

  const text = buildApprovalMessage(params);

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to, from, text }]);
    return true;
  } catch (e) {
    console.error("[driver-approval-sms] Solapi 발송 실패:", e);
    return false;
  }
}
