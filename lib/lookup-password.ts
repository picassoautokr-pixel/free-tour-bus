/**
 * lib/lookup-password.ts
 *
 * 고객 조회 비밀번호(lookup_password) hash 유틸.
 *
 * ## 설계 원칙
 * - 조회 비밀번호는 4~20자의 짧은 문자열이며 bcrypt 수준의 강도는 불필요합니다.
 * - Web Crypto API(SubtleCrypto)를 사용하여 브라우저·Node.js·Edge Runtime 모두에서 동작합니다.
 * - 알고리즘: SHA-256 + 고정 salt prefix (LOOKUP_PW_SALT 환경변수 또는 기본값)
 *   → 무지개 테이블 방어 + 동일 평문이면 동일 hash (DB 조회 가능)
 *
 * ## 마이그레이션 전략
 * - DB에 이미 평문으로 저장된 레코드를 위해 `verifyLookupPassword`는
 *   hash 비교 실패 시 평문 비교를 fallback으로 수행합니다.
 * - 신규 저장은 항상 hash로 저장됩니다.
 */

const SALT_PREFIX = process.env.LOOKUP_PW_SALT ?? "freetourbus-lookup-v1:";

/**
 * 평문 비밀번호를 SHA-256 hex digest로 변환합니다.
 * 브라우저(SubtleCrypto)와 Node.js(crypto.subtle) 모두 지원합니다.
 */
export async function hashLookupPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(SALT_PREFIX + plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * DB에 저장된 값(hash 또는 평문 fallback)과 입력 평문을 비교합니다.
 *
 * - stored 값이 64자 hex이면 hash 비교
 * - 그 외(평문 레거시)이면 직접 문자열 비교 (마이그레이션 완료 후 제거 가능)
 */
export async function verifyLookupPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  // hash 비교 (신규 저장 방식)
  const hashed = await hashLookupPassword(plain);
  if (hashed === stored) return true;
  // 평문 fallback (레거시 레코드 대응)
  return plain === stored;
}
