-- The first policies let any signed-in account read every project's data and
-- book hours anywhere. Scope reads to project members and writes to the roles
-- that do that work on that project.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Security definer so policies can look at memberships without being
-- filtered by the memberships table's own policy.
create or replace function private.is_project_member(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.project_memberships membership
    where membership.project_id = target_project
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_project_role(target_project uuid, allowed_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = target_project
      and membership.user_id = (select auth.uid())
      and profile.role = any (allowed_roles)
  );
$$;

revoke all on function private.is_project_member(uuid) from public, anon;
revoke all on function private.has_project_role(uuid, text[]) from public, anon;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.has_project_role(uuid, text[]) to authenticated;

-- Profiles: each account reads its own row.
drop policy if exists "authenticated read profiles" on public.profiles;
create policy "users read own profile" on public.profiles for select to authenticated
using (id = (select auth.uid()));

-- Projects
drop policy if exists "authenticated read projects" on public.projects;
create policy "members read projects" on public.projects for select to authenticated
using (private.is_project_member(id));
drop policy if exists "authorized update projects" on public.projects;
create policy "managers update projects" on public.projects for update to authenticated
using (private.has_project_role(id, array['administrateur','bureau','conducteur']))
with check (private.has_project_role(id, array['administrateur','bureau','conducteur']));

-- Zones
drop policy if exists "authenticated read zones" on public.zones;
create policy "members read zones" on public.zones for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authorized insert zones" on public.zones;
create policy "managers insert zones" on public.zones for insert to authenticated
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));
drop policy if exists "authorized update zones" on public.zones;
create policy "managers update zones" on public.zones for update to authenticated
using (private.has_project_role(project_id, array['administrateur','bureau','conducteur']))
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));

-- Tasks
drop policy if exists "authenticated read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authorized insert tasks" on public.tasks;
create policy "managers insert tasks" on public.tasks for insert to authenticated
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));
drop policy if exists "authorized update tasks" on public.tasks;
create policy "managers update tasks" on public.tasks for update to authenticated
using (private.has_project_role(project_id, array['administrateur','bureau','conducteur']))
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));

-- Task budget revisions (scoped through their task)
drop policy if exists "authenticated read task budget revisions" on public.task_budget_revisions;
create policy "members read task budget revisions" on public.task_budget_revisions for select to authenticated
using (exists (
  select 1 from public.tasks task
  where task.id = task_budget_revisions.task_id
    and private.is_project_member(task.project_id)
));
drop policy if exists "authorized insert task budget revisions" on public.task_budget_revisions;
create policy "managers insert task budget revisions" on public.task_budget_revisions for insert to authenticated
with check (
  revised_by = (select auth.uid())
  and exists (
    select 1 from public.tasks task
    where task.id = task_budget_revisions.task_id
      and private.has_project_role(task.project_id, array['administrateur','bureau','conducteur'])
  )
);

-- People
drop policy if exists "authenticated read people" on public.people;
create policy "members read people" on public.people for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "team managers insert people" on public.people;
create policy "managers insert people" on public.people for insert to authenticated
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));
drop policy if exists "team managers update people" on public.people;
create policy "managers update people" on public.people for update to authenticated
using (private.has_project_role(project_id, array['administrateur','bureau','conducteur']))
with check (private.has_project_role(project_id, array['administrateur','bureau','conducteur']));

-- Agencies: drop the duplicate insert policy that skipped the project check.
drop policy if exists "team managers insert agencies" on public.agencies;

-- Time entries: read by members, booked by site managers of that project.
drop policy if exists "authenticated read time entries" on public.time_entries;
create policy "members read time entries" on public.time_entries for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authenticated insert time entries" on public.time_entries;
create policy "site managers insert time entries" on public.time_entries for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_project_role(project_id, array['administrateur','bureau','conducteur','chef_chantier'])
);

-- Stock
drop policy if exists "authenticated read stock items" on public.stock_items;
create policy "members read stock items" on public.stock_items for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authenticated read stock movements" on public.stock_movements;
create policy "members read stock movements" on public.stock_movements for select to authenticated
using (private.is_project_member(project_id));

-- Cables
drop policy if exists "authenticated read cables" on public.cables;
create policy "members read cables" on public.cables for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authenticated read cable imports" on public.cable_imports;
create policy "members read cable imports" on public.cable_imports for select to authenticated
using (private.is_project_member(project_id));
drop policy if exists "authenticated insert cable imports" on public.cable_imports;
create policy "managers insert cable imports" on public.cable_imports for insert to authenticated
with check (
  imported_by = (select auth.uid())
  and private.has_project_role(project_id, array['administrateur','bureau','conducteur'])
);

-- Audit trail: members read their project's events; accounts log their own
-- actions on projects they belong to. User management events (no project)
-- are written by the admin-users function with the service role.
drop policy if exists "authenticated read audit" on public.audit_events;
create policy "members read audit" on public.audit_events for select to authenticated
using (project_id is not null and private.is_project_member(project_id));
drop policy if exists "authenticated insert audit" on public.audit_events;
create policy "members insert audit" on public.audit_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and project_id is not null
  and private.is_project_member(project_id)
);
