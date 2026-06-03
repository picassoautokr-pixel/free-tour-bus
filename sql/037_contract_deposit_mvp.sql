-- 전자계약 / 예약금 / 노쇼 방지 MVP

alter table public.applications
  add column if not exists contract_status text default 'pending',
  add column if not exists contract_started_at timestamptz,
  add column if not exists client_contract_confirmed_at timestamptz,
  add column if not exists driver_contract_confirmed_at timestamptz,
  add column if not exists deposit_amount bigint default 0,
  add column if not exists deposit_status text default 'unpaid',
  add column if not exists deposit_confirmed_at timestamptz,
  add column if not exists contract_memo text;
