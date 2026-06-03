-- 자동매칭 운영설정

create table if not exists public.admin_settings (
  id text primary key default 'quote_automation',
  business_start_time text default '09:00',
  business_end_time text default '18:00',
  auto_final_confirm_delay_minutes integer default 30,
  timezone text default 'Asia/Seoul',
  updated_at timestamptz default now()
);

insert into public.admin_settings (
  id,
  business_start_time,
  business_end_time,
  auto_final_confirm_delay_minutes,
  timezone
)
values (
  'quote_automation',
  '09:00',
  '18:00',
  30,
  'Asia/Seoul'
)
on conflict (id) do nothing;

