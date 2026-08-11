alter table public.stock_items add column if not exists active boolean not null default true;

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint stock_locations_name_not_blank check (btrim(name) <> '')
);
create unique index if not exists stock_locations_project_name_uidx on public.stock_locations(project_id, lower(name));
create index if not exists stock_locations_project_idx on public.stock_locations(project_id);
create index if not exists stock_locations_created_by_idx on public.stock_locations(created_by);

alter table public.stock_locations enable row level security;
grant select, insert, update on public.stock_locations to authenticated;

create policy "project members read stock locations" on public.stock_locations for select to authenticated
using (exists (select 1 from public.project_memberships membership where membership.project_id = stock_locations.project_id and membership.user_id = (select auth.uid())));
create policy "stock managers insert locations" on public.stock_locations for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_locations.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));
create policy "stock managers update locations" on public.stock_locations for update to authenticated
using (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_locations.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
)) with check (exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_locations.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));

insert into public.stock_locations(project_id,name,code,created_by)
select project.id, 'Magasin principal', 'MAG-PRINCIPAL', coalesce(
  (select membership.user_id from public.project_memberships membership where membership.project_id = project.id order by membership.created_at limit 1),
  (select id from auth.users order by created_at limit 1)
)
from public.projects project
where exists (select 1 from public.stock_items item where item.project_id = project.id)
on conflict do nothing;

alter table public.stock_movements add column if not exists source_location_id uuid references public.stock_locations(id);
alter table public.stock_movements add column if not exists destination_location_id uuid references public.stock_locations(id);
alter table public.stock_movements add column if not exists inventory_delta numeric;
alter table public.stock_movements add column if not exists counted_quantity numeric;
alter table public.stock_movements add column if not exists previous_quantity numeric;

update public.stock_movements movement set destination_location_id = location.id
from public.stock_locations location where location.project_id = movement.project_id and lower(location.name) = lower('Magasin principal') and movement.movement_type = 'entree' and movement.destination_location_id is null;
update public.stock_movements movement set source_location_id = location.id
from public.stock_locations location where location.project_id = movement.project_id and lower(location.name) = lower('Magasin principal') and movement.movement_type = 'sortie' and movement.source_location_id is null;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in ('entree','sortie','transfert','inventaire'));
alter table public.stock_movements add constraint stock_movements_inventory_delta_check check (movement_type <> 'inventaire' or (inventory_delta is not null and inventory_delta <> 0 and counted_quantity >= 0 and previous_quantity is not null));
create index if not exists stock_movements_source_location_idx on public.stock_movements(source_location_id);
create index if not exists stock_movements_destination_location_idx on public.stock_movements(destination_location_id);

drop policy if exists "authenticated insert stock movements" on public.stock_movements;
drop policy if exists "stock managers insert movements" on public.stock_movements;
create policy "stock managers insert movements" on public.stock_movements for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.project_memberships membership join public.profiles profile on profile.id = membership.user_id
  where membership.project_id = stock_movements.project_id and membership.user_id = (select auth.uid()) and profile.role in ('administrateur','bureau','magasinier')
));
