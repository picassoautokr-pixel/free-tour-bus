-- 고객 신청 경유지 목록

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'stopovers'
  ) then
    alter table public.applications
      add column stopovers text;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'stopovers'
      and udt_name = '_text'
  ) then
    alter table public.applications
      alter column stopovers type text
      using array_to_string(stopovers, ', ');
  end if;
end $$;
