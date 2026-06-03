alter table public.applications
  add column if not exists sponsor_support_status text default 'none',
  add column if not exists sponsor_approved_support_amount bigint default 0,
  add column if not exists sponsor_preapproved_count integer default 0,
  add column if not exists sponsor_approved_count integer default 0,
  add column if not exists sponsor_rejected_count integer default 0,
  add column if not exists sponsor_support_updated_at timestamptz;

alter table public.applications
  drop constraint if exists applications_sponsor_support_status_check;

alter table public.applications
  add constraint applications_sponsor_support_status_check
  check (sponsor_support_status in ('none', 'preapproved', 'approved', 'rejected', 'mixed'));

alter table public.driver_quotes
  add column if not exists sponsor_support_amount bigint default 0,
  add column if not exists sponsor_support_status text,
  add column if not exists sponsor_approved_support_amount bigint default 0,
  add column if not exists customer_support_amount bigint default 0,
  add column if not exists driver_support_amount bigint default 0,
  add column if not exists client_reward_amount bigint default 0,
  add column if not exists member_price bigint;

create index if not exists applications_sponsor_support_status_idx
on public.applications(sponsor_support_status);
