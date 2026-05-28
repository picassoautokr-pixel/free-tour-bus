import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminActionType =
  | "hide_application"
  | "unhide_application"
  | "quote_edit"
  | "quote_hide"
  | "quote_unhide"
  | "sponsor_edit";

export async function logAdminAction(
  admin: SupabaseClient,
  opts: {
    adminEmail?: string | null;
    actionType: AdminActionType;
    targetTable: string;
    targetId: string;
    beforeJson?: Record<string, unknown> | null;
    afterJson?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await admin.from("admin_action_logs").insert({
      admin_email: opts.adminEmail ?? null,
      action_type: opts.actionType,
      target_table: opts.targetTable,
      target_id: opts.targetId,
      before_json: opts.beforeJson ?? null,
      after_json: opts.afterJson ?? null,
    });
  } catch (e) {
    // 로그 기록 실패는 본 작업을 블록하지 않음
    console.warn("[admin-action-log] 로그 기록 실패:", e);
  }
}
