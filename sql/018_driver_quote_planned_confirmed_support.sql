-- 예정(planned) / 확정(confirmed) 지원금 필드 분리 (overwrite 방지)
alter table public.driver_quotes
  add column if not exists planned_total_support bigint,
  add column if not exists planned_customer_support bigint,
  add column if not exists planned_driver_support bigint,
  add column if not exists planned_discount_price bigint,
  add column if not exists planned_final_price bigint,
  add column if not exists confirmed_total_support bigint,
  add column if not exists confirmed_customer_support bigint,
  add column if not exists confirmed_driver_support bigint,
  add column if not exists confirmed_discount_price bigint,
  add column if not exists confirmed_final_price bigint;

comment on column public.driver_quotes.planned_total_support is '총 예정 지원금 (견적 제출 시 고정, 승인 후에도 유지)';
comment on column public.driver_quotes.planned_customer_support is '고객 예정 지원금';
comment on column public.driver_quotes.planned_driver_support is '제휴기사 예정 지원금';
comment on column public.driver_quotes.planned_discount_price is '지원금 할인 예정가';
comment on column public.driver_quotes.planned_final_price is '최종 할인 예정가 (연장 전)';
comment on column public.driver_quotes.confirmed_total_support is '총 확정 지원금 (후원업체 승인 후만 갱신)';
comment on column public.driver_quotes.confirmed_customer_support is '고객 확정 지원금';
comment on column public.driver_quotes.confirmed_driver_support is '제휴기사 확정 지원금';
comment on column public.driver_quotes.confirmed_discount_price is '지원금 할인 적용가';
comment on column public.driver_quotes.confirmed_final_price is '최종 할인 적용가';

-- 기존 데이터 1회 백필 (approved를 planned로 쓰지 않음)
update public.driver_quotes
set
  planned_total_support = coalesce(
    planned_total_support,
    nullif(preapproved_support_amount, 0),
    nullif(estimated_support_amount, 0),
    nullif(sponsor_support_amount, 0)
  ),
  planned_customer_support = coalesce(
    planned_customer_support,
    nullif(customer_support_amount, 0),
    nullif(support_discount_amount, 0)
  ),
  planned_driver_support = coalesce(
    planned_driver_support,
    nullif(driver_support_amount, 0)
  ),
  planned_discount_price = coalesce(
    planned_discount_price,
    nullif(member_price, 0),
    nullif(sponsor_discounted_price, 0)
  ),
  planned_final_price = coalesce(
    planned_final_price,
    nullif(member_price, 0),
    nullif(sponsor_discounted_price, 0)
  )
where sponsor_quote_enabled = true
   or customer_support_amount is not null
   or support_discount_amount is not null
   or preapproved_support_amount is not null;

update public.driver_quotes
set
  planned_driver_support = greatest(
    coalesce(planned_total_support, 0) - coalesce(planned_customer_support, 0),
    0
  )
where planned_driver_support is null
  and planned_total_support is not null
  and planned_customer_support is not null;

update public.driver_quotes
set
  confirmed_total_support = coalesce(
    confirmed_total_support,
    nullif(approved_support_amount, 0)
  ),
  confirmed_customer_support = coalesce(
    confirmed_customer_support,
    final_customer_support_amount
  ),
  confirmed_driver_support = coalesce(
    confirmed_driver_support,
    final_driver_support_amount
  ),
  confirmed_discount_price = coalesce(
    confirmed_discount_price,
    nullif(final_member_price, 0)
  ),
  confirmed_final_price = coalesce(
    confirmed_final_price,
    nullif(final_member_price, 0)
  )
where nullif(approved_support_amount, 0) is not null
   or final_customer_support_amount is not null;
