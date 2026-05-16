alter table public.sponsor_preapprovals
  add column if not exists approved_support_amount bigint,
  add column if not exists decision_memo text,
  add column if not exists decided_by uuid,
  add column if not exists decided_at timestamptz,
  add column if not exists staff_assigned_at timestamptz,
  add column if not exists staff_sms_sent_at timestamptz,
  add column if not exists staff_sms_error text;

create index if not exists sponsor_preapprovals_assigned_staff_idx
on public.sponsor_preapprovals(assigned_staff_id);

create index if not exists sponsor_preapprovals_decided_at_idx
on public.sponsor_preapprovals(decided_at);
