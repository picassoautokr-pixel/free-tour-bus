create table if not exists public.sponsor_companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  auth_user_id uuid,
  company_name text not null,
  manager_name text,
  phone text,
  email text,
  business_number text,
  business_category text,
  product_category text,
  product_description text,
  support_type text default 'cash',
  status text default 'pending',
  approved_at timestamptz,
  rejected_at timestamptz,
  admin_memo text,
  constraint sponsor_companies_status_check check (
    status in ('pending', 'reviewing', 'approved', 'rejected', 'suspended')
  ),
  constraint sponsor_companies_support_type_check check (
    support_type in ('cash', 'goods', 'discount', 'coupon', 'consulting')
  )
);

create table if not exists public.sponsor_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sponsor_company_id uuid references public.sponsor_companies(id) on delete cascade,
  title text,
  service_regions text[],
  support_per_person bigint default 0,
  support_per_case bigint default 0,
  max_support_amount bigint default 0,
  min_passenger_count integer,
  max_passenger_count integer,
  target_group text,
  support_condition text,
  support_type text,
  daily_budget bigint,
  monthly_budget bigint,
  is_active boolean default true,
  memo text
);

create table if not exists public.sponsor_staff (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sponsor_company_id uuid references public.sponsor_companies(id) on delete cascade,
  name text,
  phone text,
  email text,
  role text,
  service_regions text[],
  is_active boolean default true
);

alter table public.profiles
  add column if not exists sponsor_company_id uuid references public.sponsor_companies(id) on delete set null;

create index if not exists sponsor_companies_status_idx on public.sponsor_companies(status);
create index if not exists sponsor_companies_auth_user_id_idx on public.sponsor_companies(auth_user_id);
create index if not exists sponsor_rules_company_idx on public.sponsor_rules(sponsor_company_id);
create index if not exists sponsor_staff_company_idx on public.sponsor_staff(sponsor_company_id);

alter table public.sponsor_companies enable row level security;
alter table public.sponsor_rules enable row level security;
alter table public.sponsor_staff enable row level security;

drop policy if exists "sponsor_companies_admin_all" on public.sponsor_companies;
create policy "sponsor_companies_admin_all"
on public.sponsor_companies
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

drop policy if exists "sponsor_companies_own_select_update" on public.sponsor_companies;
create policy "sponsor_companies_own_select_update"
on public.sponsor_companies
for all
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists "sponsor_rules_admin_all" on public.sponsor_rules;
create policy "sponsor_rules_admin_all"
on public.sponsor_rules
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

drop policy if exists "sponsor_rules_own_all" on public.sponsor_rules;
create policy "sponsor_rules_own_all"
on public.sponsor_rules
for all
using (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_rules.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_rules.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
);

drop policy if exists "sponsor_staff_admin_all" on public.sponsor_staff;
create policy "sponsor_staff_admin_all"
on public.sponsor_staff
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

drop policy if exists "sponsor_staff_own_all" on public.sponsor_staff;
create policy "sponsor_staff_own_all"
on public.sponsor_staff
for all
using (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_staff.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sponsor_companies sc
    where sc.id = sponsor_staff.sponsor_company_id
      and sc.auth_user_id = auth.uid()
  )
);
