-- 견적 자동마감 / 자동확정 / 자동연장 / 감사지원금 구조

alter table public.applications
  add column if not exists quote_deadline_at timestamptz,
  add column if not exists quote_limit_count integer,
  add column if not exists target_normal_price bigint,
  add column if not exists target_member_price bigint,
  add column if not exists quote_status text default 'collecting',
  add column if not exists quote_closed_at timestamptz,
  add column if not exists quote_closed_reason text,
  add column if not exists auto_selected_quote_id uuid,
  add column if not exists auto_selected_quote_source text,
  add column if not exists auto_selected_at timestamptz,
  add column if not exists auto_final_confirm_at timestamptz,
  add column if not exists final_selected_quote_id uuid,
  add column if not exists final_selected_quote_source text,
  add column if not exists final_selected_at timestamptz,
  add column if not exists contact_revealed_at timestamptz,
  add column if not exists extension_round integer default 0,
  add column if not exists extension_started_at timestamptz,
  add column if not exists support_client_reward_ratio integer default 0,
  add column if not exists support_driver_ratio integer default 100,
  add column if not exists contract_status text;
