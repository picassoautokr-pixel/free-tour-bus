/**
 * 견적요청(신청) 숨김 — 모든 대시보드 목록 필터 (UTF-8)
 */

export function isApplicationHidden(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return row.is_hidden === true;
}

export function filterVisibleApplicationRows<T extends Record<string, unknown>>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isApplicationHidden(row));
}

/** 숨김 건은 조회 불가(404) 처리 */
export function assertApplicationVisible(
  row: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (isApplicationHidden(row)) {
    return { ok: false, message: "견적요청을 찾을 수 없습니다." };
  }
  return { ok: true };
}
