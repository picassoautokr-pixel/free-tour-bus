/**
 * lib/driver-approval-sms.ts
 *
 * 제휴기사 승인 알림 문자 — Solapi(`solapi`) 연동.
 *
 * ## 필요 환경변수
 * - SOLAPI_API_KEY
 * - SOLAPI_API_SECRET
 * - SOLAPI_SENDER_NUMBER  (또는 SOLAPI_SENDER)
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

/**
 * 임시 비밀번호 생성: 전화번호 뒤 4자리 + 영문 소문자 4개
 * 예) 전화번호 01012345678 → "5678abcd"
 */
export function generateApprovalTempPassword(phoneDigits: string): string {
  const last4 = phoneDigits.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const lower = "abcdefghijklmnopqrstuvwxyz";
  let letters = "";
  // crypto 없이 Math.random 사용 (임시 비밀번호이므로 보안 강도 불필요)
  for (let i = 0; i < 4; i++) {
    letters += lower[Math.floor(Math.random() * lower.length)];
  }
  return `${last4}${letters}`;
}

function buildApprovalMessage(params: {
  companyName?: string;
  tempPassword: string;
  loginId: string;
}): string {
  const company = params.companyName?.trim() || "";
  const lines = [
    `[무료버스] ${company ? `${company} ` : ""}제휴기사 승인이 완료되었습니다.`,
    "",
    `로그인 주소: https://www.free-bus.co.kr/partner/login`,
    `아이디: ${params.loginId}`,
    `임시 비밀번호: ${params.tempPassword}`,
    "",
    "로그인 후 비밀번호를 변경해 주세요.",
  ];
  return lines.join("\n");
}

/**
 * 제휴기사 승인 알림 SMS를 발송합니다.
 *
 * @returns 발송 성공 여부
 */
export async function sendDriverApprovalSms(params: {
  toPhone: string;
  companyName?: string;
  /** 임시 비밀번호 (승인 시 생성된 값) */
  tempPassword: string;
  /** 로그인 아이디 (전화번호 숫자) */
  loginId: string;
}): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim() ??
    process.env.SOLAPI_SENDER_PHONE?.trim(); // .env.example 호환

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

  const text = buildApprovalMessage({
    companyName: params.companyName,
    tempPassword: params.tempPassword,
    loginId: params.loginId,
  });

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to, from, text }]);
    return true;
  } catch (e) {
    console.error("[driver-approval-sms] Solapi 발송 실패:", e);
    return false;
  }
}
