alter table public.driver_quotes
  add column if not exists support_settlement_type text default 'client_priority',
  add column if not exists preapproved_support_amount bigint default 0,
  add column if not exists approved_support_amount bigint default 0,
  add column if not exists customer_support_amount bigint default 0,
  add column if not exists driver_support_amount bigint default 0,
  add column if not exists final_customer_support_amount bigint default 0,
  add column if not exists final_driver_support_amount bigint default 0,
  add column if not exists member_price bigint,
  add column if not exists final_member_price bigint,
  add column if not exists support_recalculated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'driver_quotes_support_settlement_type_check'
  ) then
    alter table public.driver_quotes
      add constraint driver_quotes_support_settlement_type_check
      check (support_settlement_type in ('client_priority', 'ratio'))
      not valid;
  end if;
end $$;

comment on column public.driver_quotes.support_settlement_type is
  'client_priority=클라이언트 지원금 우선보장, ratio=최종 승인금액 비율정산';

comment on column public.driver_quotes.preapproved_support_amount is
  '견적 제출 시점의 적용 가능/가승인 지원금';

comment on column public.driver_quotes.approved_support_amount is
  '후원업체 최종 승인 후 재계산에 사용한 승인 지원금';

comment on column public.driver_quotes.final_member_price is
  '후원업체 최종 승인금액 기준으로 재계산된 고객 실부담가';
