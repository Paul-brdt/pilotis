create table if not exists public.project_work_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_working_day boolean not null default true,
  start_time time not null default '07:00',
  end_time time not null default '16:00',
  break_minutes integer not null default 60 check (break_minutes between 0 and 480),
  theoretical_hours numeric(5,2) not null default 8 check (theoretical_hours between 0 and 24),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (project_id, weekday)
);

create table if not exists public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  work_date date not null,
  status text not null default 'non_renseigne' check (status in ('non_renseigne','present','absent','conge','formation','maladie')),
  arrival_time time,
  departure_time time,
  scheduled_hours numeric(5,2) not null default 0 check (scheduled_hours between 0 and 24),
  regular_hours numeric(5,2) not null default 0 check (regular_hours between 0 and 24),
  automatic_overtime_hours numeric(5,2) not null default 0 check (automatic_overtime_hours between 0 and 24),
  manual_overtime_hours numeric(5,2) check (manual_overtime_hours between 0 and 24),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id, work_date),
  check ((status = 'present') or (arrival_time is null and departure_time is null))
);

create table if not exists public.attendance_history (
  id bigint generated always as identity primary key,
  attendance_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  work_date date not null,
  previous_data jsonb,
  new_data jsonb not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists daily_attendance_project_date_idx on public.daily_attendance(project_id, work_date);
create index if not exists attendance_history_attendance_idx on public.attendance_history(attendance_id, changed_at desc);

alter table public.project_work_schedules enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.attendance_history enable row level security;

grant select, insert, update on public.project_work_schedules to authenticated;
grant select, insert, update on public.daily_attendance to authenticated;
grant select on public.attendance_history to authenticated;
grant usage, select on sequence public.attendance_history_id_seq to authenticated;

create policy "members read work schedules" on public.project_work_schedules for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = project_work_schedules.project_id and m.user_id = (select auth.uid())));
create policy "managers create work schedules" on public.project_work_schedules for insert to authenticated
with check (updated_by = (select auth.uid()) and exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = project_work_schedules.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')));
create policy "managers update work schedules" on public.project_work_schedules for update to authenticated
using (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = project_work_schedules.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur')))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.project_memberships m where m.project_id = project_work_schedules.project_id and m.user_id = (select auth.uid())));

create policy "members read attendance" on public.daily_attendance for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = daily_attendance.project_id and m.user_id = (select auth.uid())));
create policy "site managers create attendance" on public.daily_attendance for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = daily_attendance.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur','chef_chantier')));
create policy "site managers update attendance" on public.daily_attendance for update to authenticated
using (exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id where m.project_id = daily_attendance.project_id and m.user_id = (select auth.uid()) and p.role in ('administrateur','bureau','conducteur','chef_chantier')))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.project_memberships m where m.project_id = daily_attendance.project_id and m.user_id = (select auth.uid())));
create policy "members read attendance history" on public.attendance_history for select to authenticated
using (exists (select 1 from public.project_memberships m where m.project_id = attendance_history.project_id and m.user_id = (select auth.uid())));

create or replace function public.log_attendance_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.attendance_history(attendance_id, project_id, person_id, work_date, previous_data, new_data, changed_by)
  values (new.id, new.project_id, new.person_id, new.work_date, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new), new.updated_by);
  return new;
end;
$$;
revoke all on function public.log_attendance_change() from public, anon, authenticated;
drop trigger if exists daily_attendance_history_trigger on public.daily_attendance;
create trigger daily_attendance_history_trigger after insert or update on public.daily_attendance for each row execute function public.log_attendance_change();

insert into public.project_work_schedules(project_id, weekday, is_working_day, start_time, end_time, break_minutes, theoretical_hours, updated_by)
select p.id, d.weekday, d.weekday between 1 and 5, '07:00', '16:00', 60, case when d.weekday between 1 and 5 then 8 else 0 end, m.user_id
from public.projects p
cross join generate_series(0,6) as d(weekday)
join lateral (select user_id from public.project_memberships where project_id = p.id order by created_at limit 1) m on true
on conflict (project_id, weekday) do nothing;
