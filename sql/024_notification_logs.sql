-- 견적 상태 문자/알림 발송 로그

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  target_type text,
  target_phone text,
  target_name text,
  notification_type text,
  application_id uuid,
  quote_id uuid,
  quote_source text,
  message text,
  status text default 'pending',
  error text,
  sent_at timestamptz
);

alter table public.notification_logs enable row level security;

create index if not exists notification_logs_application_id_idx
  on public.notification_logs (application_id, created_at desc);

create index if not exists notification_logs_dedupe_idx
  on public.notification_logs (application_id, target_phone, notification_type);

create policy "notification_logs_admin_select"
  on public.notification_logs
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.user_id = auth.uid()
        and lower(profiles.role) = 'admin'
    )
  );

