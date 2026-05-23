/**
 * driver_quotes 조회용 select — 최소 컬럼 + support_breakdown (UTF-8)
 *
 * driver_quotes에 없는 컬럼 (SELECT 금지):
 * - sponsor_approved_support_amount
 * - sponsor_estimated_support_amount
 * - customer_confirmed_support_amount
 * - confirmed_customer_support_amount
 * - planned_customer_support_amount
 * - planned_* / confirmed_* 개별 지원금 컬럼 (support_breakdown jsonb 사용)
 */

/** 권장: 견적 1건·목록 공통 */
export const DRIVER_QUOTE_MINIMAL_SELECT =
  "id, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, created_at, support_breakdown";

/** support_breakdown 컬럼 미적용 DB fallback */
export const DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN =
  "id, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, created_at";

/** 자동선정·경매 후보 */
export const DRIVER_QUOTE_AUCTION_SELECT = "id, price, support_breakdown";

export const DRIVER_QUOTE_AUCTION_SELECT_LEGACY = "id, price";

/** 하위 호환 alias */
export const DRIVER_QUOTE_ADMIN_DETAIL_SELECT = DRIVER_QUOTE_MINIMAL_SELECT;
export const DRIVER_QUOTE_ROW_SELECT = DRIVER_QUOTE_MINIMAL_SELECT;
export const DRIVER_QUOTE_ROW_SELECT_LEGACY = DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN;
export const DRIVER_QUOTE_ROW_SELECT_MINIMAL = DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN;
