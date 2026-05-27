-- 스폰서 지원확정 상태 디버그 쿼리 (admin.free-bus.co.kr Supabase SQL Editor에서 실행)
-- 매칭완료된 신청 중 sponsor_support_status 확인

-- 1. 최근 매칭완료 신청의 스폰서 관련 필드 전체 확인
SELECT
  a.id,
  a.receipt_number,
  a.quote_status,
  a.final_selected_quote_id,
  a.sponsor_support_status,
  a.sponsor_approved_support_amount,
  a.sponsor_approved_count,
  a.sponsor_preapproved_count,
  a.sponsor_rejected_count,
  a.sponsor_support_updated_at,
  a.created_at
FROM applications a
WHERE a.final_selected_quote_id IS NOT NULL
ORDER BY a.created_at DESC
LIMIT 20;

-- 2. 해당 신청의 sponsor_preapprovals 상태 확인 (application_id를 위 결과에서 교체)
-- SELECT
--   sp.id,
--   sp.application_id,
--   sp.status,
--   sp.estimated_support_amount,
--   sp.approved_support_amount,
--   sp.approved_at,
--   sp.decided_at,
--   sp.payout_status,
--   sp.created_at
-- FROM sponsor_preapprovals sp
-- WHERE sp.application_id = 'YOUR_APPLICATION_ID_HERE'
-- ORDER BY sp.created_at DESC;

-- 3. driver_quotes의 support_breakdown 확인 (quote_id를 교체)
-- SELECT
--   dq.id,
--   dq.application_id,
--   dq.sponsor_support_status,
--   dq.sponsor_approved_support_amount,
--   dq.support_breakdown->>'isConfirmed' as breakdown_is_confirmed,
--   dq.support_breakdown->>'confirmed_total_support' as breakdown_confirmed_total,
--   dq.support_breakdown->>'planned_total_support' as breakdown_planned_total,
--   dq.support_breakdown
-- FROM driver_quotes dq
-- WHERE dq.id = 'YOUR_QUOTE_ID_HERE';
