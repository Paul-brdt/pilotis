create table if not exists public.project_memberships (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_memberships_user_idx
  on public.project_memberships(user_id, project_id);

alter table public.project_memberships enable row level security;

revoke all on public.project_memberships from anon;
revoke insert, update, delete on public.project_memberships from authenticated;
grant select on public.project_memberships to authenticated;

drop policy if exists "members read own project memberships"
  on public.project_memberships;
create policy "members read own project memberships"
  on public.project_memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- Le chantier existant doit rester accessible après activation du cloisonnement.
-- Les nouvelles appartenances seront ensuite gérées par le service administrateur.
insert into public.project_memberships (project_id, user_id)
select project.id, profile.id
from public.projects as project
cross join public.profiles as profile
where project.code = '24-018'
  and profile.role = 'administrateur'
on conflict (project_id, user_id) do nothing;

create table if not exists public.zone_task_budget_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  allocated_hours numeric(10,2) not null check (allocated_hours > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(zone_id, task_id)
);

create index if not exists zone_task_budget_allocations_project_idx
  on public.zone_task_budget_allocations(project_id, zone_id, task_id);

alter table public.zone_task_budget_allocations enable row level security;

revoke all on public.zone_task_budget_allocations from anon;
grant select, insert, update, delete
  on public.zone_task_budget_allocations to authenticated;

drop policy if exists "members read zone task allocations"
  on public.zone_task_budget_allocations;
create policy "members read zone task allocations"
  on public.zone_task_budget_allocations for select to authenticated
  using (
    project_id in (
      select membership.project_id
      from public.project_memberships as membership
      where membership.user_id = (select auth.uid())
    )
  );

drop policy if exists "project managers insert zone task allocations"
  on public.zone_task_budget_allocations;
create policy "project managers insert zone task allocations"
  on public.zone_task_budget_allocations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and project_id in (
      select membership.project_id
      from public.project_memberships as membership
      where membership.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role in ('administrateur', 'bureau', 'conducteur')
    )
  );

drop policy if exists "project managers update zone task allocations"
  on public.zone_task_budget_allocations;
create policy "project managers update zone task allocations"
  on public.zone_task_budget_allocations for update to authenticated
  using (
    project_id in (
      select membership.project_id
      from public.project_memberships as membership
      where membership.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role in ('administrateur', 'bureau', 'conducteur')
    )
  )
  with check (
    project_id in (
      select membership.project_id
      from public.project_memberships as membership
      where membership.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role in ('administrateur', 'bureau', 'conducteur')
    )
  );

drop policy if exists "project managers delete zone task allocations"
  on public.zone_task_budget_allocations;
create policy "project managers delete zone task allocations"
  on public.zone_task_budget_allocations for delete to authenticated
  using (
    project_id in (
      select membership.project_id
      from public.project_memberships as membership
      where membership.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role in ('administrateur', 'bureau', 'conducteur')
    )
  );

create or replace function public.validate_zone_task_budget_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_project uuid;
  zone_project uuid;
  global_budget numeric(10,2);
  allocated_elsewhere numeric(10,2);
begin
  if tg_op = 'UPDATE' and new.created_by <> old.created_by then
    raise exception 'Le créateur d’une allocation ne peut pas être modifié.';
  end if;

  select task.project_id, task.budget_hours
    into task_project, global_budget
    from public.tasks as task
    where task.id = new.task_id;

  select zone.project_id
    into zone_project
    from public.zones as zone
    where zone.id = new.zone_id;

  if task_project is null or zone_project is null
     or new.project_id <> task_project or new.project_id <> zone_project then
    raise exception 'La tâche et la zone doivent appartenir au même chantier.';
  end if;

  if not exists (
    select 1
    from public.project_memberships as membership
    where membership.project_id = new.project_id
      and membership.user_id = new.created_by
  ) then
    raise exception 'Le créateur de l’allocation doit appartenir au chantier.';
  end if;

  select coalesce(sum(allocation.allocated_hours), 0)
    into allocated_elsewhere
    from public.zone_task_budget_allocations as allocation
    where allocation.task_id = new.task_id
      and allocation.id <> new.id;

  if allocated_elsewhere + new.allocated_hours > global_budget then
    raise exception 'L’allocation dépasse le budget global disponible pour cette tâche.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_zone_task_budget_allocation_trigger
  on public.zone_task_budget_allocations;
create trigger validate_zone_task_budget_allocation_trigger
before insert or update on public.zone_task_budget_allocations
for each row execute function public.validate_zone_task_budget_allocation();

create or replace function public.validate_task_budget_against_allocations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocated_total numeric(10,2);
begin
  select coalesce(sum(allocation.allocated_hours), 0)
    into allocated_total
    from public.zone_task_budget_allocations as allocation
    where allocation.task_id = new.id;

  if new.budget_hours < allocated_total then
    raise exception 'Le budget global ne peut pas être inférieur au total déjà alloué aux zones.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_task_budget_against_allocations_trigger
  on public.tasks;
create trigger validate_task_budget_against_allocations_trigger
before update of budget_hours on public.tasks
for each row execute function public.validate_task_budget_against_allocations();

-- Convertit les anciennes affectations directes en allocations sans perte.
insert into public.zone_task_budget_allocations (
  project_id, zone_id, task_id, allocated_hours, created_by
)
select task.project_id, task.zone_id, task.id, task.budget_hours, membership.user_id
from public.tasks as task
cross join lateral (
  select project_membership.user_id
  from public.project_memberships as project_membership
  join public.profiles as profile on profile.id = project_membership.user_id
  where project_membership.project_id = task.project_id
  order by (profile.role = 'administrateur') desc, project_membership.created_at
  limit 1
) as membership
where task.zone_id is not null
  and task.budget_hours > 0
on conflict (zone_id, task_id) do nothing;

-- tasks.zone_id reste nullable pour la compatibilité des anciennes sauvegardes.
