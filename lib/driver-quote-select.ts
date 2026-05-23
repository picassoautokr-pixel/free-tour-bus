/**
 * driver_quotes 조회용 select — 존재 컬럼만 (지원금은 support_breakdown 우선, UTF-8)
 *
 * driver_quotes에 없는 컬럼 (조회 금지):
 * - sponsor_approved_support_amount
 * - sponsor_estimated_support_amount
 * - customer_confirmed_support_amount
 * - confirmed_customer_support_amount (별도 snake — confirmed_customer_support 사용)
 * - planned_customer_support_amount
 */

/** 어드민 상세·견적종합 */
export const DRIVER_QUOTE_ADMIN_DETAIL_SELECT =
  "id, created_at, application_id, partner_driver_id, price, vehicle_type, available_time, message, status, support_settlement_type, planned_total_support, planned_customer_support, planned_driver_support, planned_discount_price, confirmed_total_support, confirmed_customer_support, confirmed_driver_support, confirmed_discount_price, member_price, final_member_price, sponsor_discounted_price, sponsor_quote_enabled, extension_support_amount, extension_applied, estimated_support_amount, approved_support_amount, support_breakdown";

/** 어드민 driver-quotes API · 파트너 calls/quotes */
export const DRIVER_QUOTE_ROW_SELECT =
  "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, estimated_support_amount, support_settlement_type, planned_total_support, planned_customer_support, planned_driver_support, planned_discount_price, planned_final_price, confirmed_total_support, confirmed_customer_support, confirmed_driver_support, confirmed_discount_price, confirmed_final_price, preapproved_support_amount, approved_support_amount, support_discount_amount, customer_support_amount, driver_support_amount, final_customer_support_amount, final_driver_support_amount, member_price, final_member_price, support_recalculated_at, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_discounted_price, sponsor_quote_enabled, extension_support_amount, support_breakdown";

export const DRIVER_QUOTE_ROW_SELECT_LEGACY =
  "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, estimated_support_amount, support_discount_amount, customer_support_amount, member_price, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_discounted_price, sponsor_quote_enabled, driver_support_amount, client_reward_amount";

export const DRIVER_QUOTE_ROW_SELECT_MINIMAL =
  "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, support_discount_amount, customer_support_amount, member_price, sponsor_discounted_price";

export const DRIVER_QUOTE_AUCTION_SELECT =
  "id, price, final_member_price, member_price, sponsor_discounted_price, sponsor_quote_enabled, customer_support_amount, support_discount_amount, support_breakdown, approved_support_amount, confirmed_total_support";

export const DRIVER_QUOTE_AUCTION_SELECT_LEGACY =
  "id, price, member_price, sponsor_discounted_price, sponsor_quote_enabled, customer_support_amount, support_discount_amount";
