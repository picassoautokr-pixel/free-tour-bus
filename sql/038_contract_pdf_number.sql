-- 계약서 PDF / 계약번호 MVP

alter table public.applications
  add column if not exists contract_number text,
  add column if not exists contract_pdf_generated_at timestamptz,
  add column if not exists contract_pdf_url text;

create unique index if not exists applications_contract_number_unique
  on public.applications(contract_number)
  where contract_number is not null;
