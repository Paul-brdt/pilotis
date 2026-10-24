alter table public.equipment_movements
  add column if not exists zone_id uuid references public.zones(id);

create index if not exists equipment_movements_zone_idx
  on public.equipment_movements(zone_id);

create table public.extra_works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject text not null check (btrim(subject) <> ''),
  hours numeric check (hours is null or hours >= 0),
  materials text,
  comments text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index extra_works_project_updated_idx
  on public.extra_works(project_id, updated_at desc);

alter table public.extra_works enable row level security;
grant select, insert, update on public.extra_works to authenticated;

create policy "members read extra works"
on public.extra_works for select to authenticated
using (
  exists (
    select 1 from public.project_memberships membership
    where membership.project_id = extra_works.project_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "site managers create extra works"
on public.extra_works for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = extra_works.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
);

create policy "site managers update extra works"
on public.extra_works for update to authenticated
using (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = extra_works.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = extra_works.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
);
