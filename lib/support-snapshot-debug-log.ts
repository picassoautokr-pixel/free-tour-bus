/**
 * support_breakdown 스냅샷 저장 디버그 로그 (UTF-8)
 * NEXT_PUBLIC_ENABLE_QUOTE_DEBUG=true 또는 QUOTE_SUPPORT_SNAPSHOT_DEBUG=true
 */

export function isSupportSnapshotDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_QUOTE_DEBUG === "true" ||
    process.env.QUOTE_SUPPORT_SNAPSHOT_DEBUG === "true"
  );
}

export function logSupportSnapshotDebug(
  tag: string,
  payload: Record<string, unknown>,
): void {
  if (!isSupportSnapshotDebugEnabled()) return;
  console.log(
    `[support-snapshot:${tag}]`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        ...payload,
      },
      null,
      2,
    ),
  );
}
