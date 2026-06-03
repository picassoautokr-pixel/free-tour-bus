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
  add column if not exists sponsor_quote_enabled boolean default false,
  add column if not exists sponsor_support_status text,
  add column if not exists support_recalculated_at timestamptz;

update public.driver_quotes
set member_price = greatest(coalesce(price, 0) - coalesce(customer_support_amount, 0), 0)
where member_price is null
  and coalesce(customer_support_amount, 0) > 0;

update public.driver_quotes
set sponsor_quote_enabled = true
where coalesce(customer_support_amount, 0) > 0
  or member_price is not null
  or final_member_price is not null;
