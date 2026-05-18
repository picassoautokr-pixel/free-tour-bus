-- 연장 지원금 (제휴기사 확정 지원금의 20% → 고객 연장 지원금)
alter table public.driver_quotes
  add column if not exists extension_support_amount bigint;

comment on column public.driver_quotes.extension_support_amount is
  '연장 지원금: 제휴기사 확정 지원금 × 20% (견적 연장 선택 시)';

comment on column public.driver_quotes.preapproved_support_amount is
  '총 예정 지원금 (분배 전)';

comment on column public.driver_quotes.approved_support_amount is
  '총 확정 지원금 (분배 전, 후원업체 승인 합계)';

comment on column public.driver_quotes.customer_support_amount is
  '고객 예정 지원금';

comment on column public.driver_quotes.driver_support_amount is
  '제휴기사 예정 지원금';

comment on column public.driver_quotes.final_customer_support_amount is
  '고객 확정 지원금';

comment on column public.driver_quotes.final_driver_support_amount is
  '제휴기사 확정 지원금';

comment on column public.driver_quotes.member_price is
  '지원금 할인 예정가';

comment on column public.driver_quotes.final_member_price is
  '지원금 할인 적용가';
