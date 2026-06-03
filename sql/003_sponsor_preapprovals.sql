create table if not exists public.sponsor_preapprovals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  application_id uuid references public.applications(id) on delete cascade,
  sponsor_company_id uuid references public.sponsor_companies(id) on delete cascade,
  sponsor_rule_id uuid references public.sponsor_rules(id) on delete set null,
  status text default 'preapproved',
  estimated_support_amount bigint default 0,
  support_per_person bigint default 0,
  support_per_case bigint default 0,
  passenger_count integer,
  matched_region text,
  matched_reason text,
  sponsor_memo text,
  approved_at timestamptz,
  rejected_at timestamptz,
  assigned_staff_id uuid references public.sponsor_staff(id) on delete set null,
  constraint sponsor_preapprovals_status_check check (
    status in ('preapproved', 'approved', 'rejected', 'cancelled', 'expired')
  )
);

create unique index if not exists sponsor_preapprovals_unique_match
on public.sponsor_preapprovals(application_id, sponsor_company_id, sponsor_rule_id);

create index if not exists sponsor_preapprovals_application_idx
on public.sponsor_preapprovals(application_id);

create index if not exists sponsor_preapprovals_company_idx
on public.sponsor_preapprovals(sponsor_company_id);

create index if not exists sponsor_preapprovals_status_idx
on public.sponsor_preapprovals(status);

alter table public.sponsor_preapprovals enable row level security;

drop policy if exists "sponsor_preapprovals_admin_all" on public.sponsor_preapprovals;
create policy "sponsor_preapprovals_admin_all"
on public.sponsor_preapprovals
for all
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "sponsor_preapprovals_own_select_update" on public.sponsor_preapprovals;
create policy "sponsor_preapprovals_own_select_update"
on public.sponsor_preapprovals
for all
using (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_preapprovals.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_preapprovals.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
);
