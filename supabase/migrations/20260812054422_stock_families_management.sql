create table if not exists public.stock_families (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_families_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists stock_families_project_name_uidx on public.stock_families(project_id, lower(name));
create index if not exists stock_families_project_idx on public.stock_families(project_id);
create index if not exists stock_families_created_by_idx on public.stock_families(created_by);

alter table public.stock_families enable row level security;
grant select, insert, update, delete on public.stock_families to authenticated;
grant delete on public.stock_locations to authenticated;

create policy "project members read stock families" on public.stock_families for select to authenticated
using (exists (select 1 from public.project_memberships membership where membership.project_id = stock_families.project_id and membership.user_id = (select auth.uid())));
create policy "stock managers insert families" on public.stock_families for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_families.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));
create policy "stock managers update families" on public.stock_families for update to authenticated
using (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_families.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
)) with check (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_families.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));
create policy "stock managers delete families" on public.stock_families for delete to authenticated
using (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_families.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));
create policy "stock managers delete locations" on public.stock_locations for delete to authenticated
using (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_locations.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));

insert into public.stock_families(project_id, name, created_by)
select project.id, family.name, membership.user_id
from public.projects project
cross join (values ('Câble'),('Cheminements'),('Luminaires'),('Supportage'),('Boulonnerie'),('Colliers'),('Galva')) family(name)
join lateral (
  select user_id from public.project_memberships where project_id = project.id order by created_at limit 1
) membership on true
on conflict do nothing;

insert into public.stock_families(project_id, name, created_by)
select distinct item.project_id, item.category, membership.user_id
from public.stock_items item
join lateral (
  select user_id from public.project_memberships where project_id = item.project_id order by created_at limit 1
) membership on true
where btrim(item.category) <> ''
on conflict do nothing;
