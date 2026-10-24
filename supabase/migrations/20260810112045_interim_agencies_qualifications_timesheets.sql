alter table public.agencies
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists active boolean not null default true;

update public.agencies
set project_id = (select id from public.projects where code = '24-018')
where project_id is null;

alter table public.agencies alter column project_id set not null;
alter table public.agencies drop constraint if exists agencies_code_key;
create unique index if not exists agencies_project_code_idx on public.agencies(project_id, code);
create index if not exists agencies_project_active_idx on public.agencies(project_id, active);

create table if not exists public.qualifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

insert into public.qualifications(project_id, name)
select distinct person.project_id, btrim(person.qualification)
from public.people as person
where nullif(btrim(person.qualification), '') is not null
on conflict(project_id, name) do nothing;

create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  week_start date not null,
  status text not null default 'generated' check (status in ('generated','conducteur_validated','bureau_validated')),
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  unique(project_id, agency_id, week_start)
);

alter table public.qualifications enable row level security;
alter table public.weekly_timesheets enable row level security;

revoke all on public.qualifications from anon, authenticated, public;
revoke all on public.weekly_timesheets from anon, authenticated, public;
revoke all on public.agencies from anon, authenticated, public;
grant select, insert, update on public.qualifications to authenticated;
grant select, insert, update on public.weekly_timesheets to authenticated;
grant select, insert, update on public.agencies to authenticated;

create policy "members read qualifications" on public.qualifications for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = qualifications.project_id and m.user_id = (select auth.uid())));
create policy "managers insert qualifications" on public.qualifications for insert to authenticated
with check (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = qualifications.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));
create policy "managers update qualifications" on public.qualifications for update to authenticated
using (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = qualifications.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')))
with check (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = qualifications.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));

drop policy if exists "authenticated read agencies" on public.agencies;
create policy "members read agencies" on public.agencies for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = agencies.project_id and m.user_id = (select auth.uid())));
create policy "managers insert agencies" on public.agencies for insert to authenticated
with check (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = agencies.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));
create policy "managers update agencies" on public.agencies for update to authenticated
using (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = agencies.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')))
with check (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = agencies.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));

create policy "members read weekly timesheets" on public.weekly_timesheets for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = weekly_timesheets.project_id and m.user_id = (select auth.uid())));
create policy "managers insert weekly timesheets" on public.weekly_timesheets for insert to authenticated
with check (generated_by = (select auth.uid()) and exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = weekly_timesheets.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));
create policy "managers update weekly timesheets" on public.weekly_timesheets for update to authenticated
using (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = weekly_timesheets.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')))
with check (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = weekly_timesheets.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));

create or replace function public.validate_person_references()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.contract_type = 'interimaire' and new.agency_id is null then
    raise exception 'Une agence existante est obligatoire pour un intérimaire.';
  end if;
  if new.contract_type = 'interne' then new.agency_id := null; end if;
  if new.agency_id is not null and not exists (
    select 1 from public.agencies a where a.id = new.agency_id and a.project_id = new.project_id and a.active
  ) then raise exception 'L’agence sélectionnée est invalide ou inactive.'; end if;
  if new.qualification is not null and not exists (
    select 1 from public.qualifications q where q.project_id = new.project_id and q.name = new.qualification and q.active
  ) then raise exception 'La qualification sélectionnée est invalide ou inactive.'; end if;
  return new;
end;
$$;

drop trigger if exists validate_person_references_trigger on public.people;
create trigger validate_person_references_trigger before insert or update of contract_type, agency_id, qualification, project_id on public.people
for each row execute function public.validate_person_references();

create or replace function public.validate_weekly_timesheet_agency()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.agencies a where a.id = new.agency_id and a.project_id = new.project_id) then
    raise exception 'L’agence doit appartenir au chantier.';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_weekly_timesheet_agency_trigger on public.weekly_timesheets;
create trigger validate_weekly_timesheet_agency_trigger before insert or update on public.weekly_timesheets
for each row execute function public.validate_weekly_timesheet_agency();

revoke execute on function public.validate_person_references() from public, anon, authenticated;
revoke execute on function public.validate_weekly_timesheet_agency() from public, anon, authenticated;

create index if not exists qualifications_project_active_idx on public.qualifications(project_id, active, name);
create index if not exists weekly_timesheets_project_week_idx on public.weekly_timesheets(project_id, week_start);
