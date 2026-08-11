alter table public.projects add column if not exists vic_warning_days integer not null default 30 check (vic_warning_days between 1 and 365);

create table public.rental_agencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  contact_name text, phone text, email text, active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

create table public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('engin','outillage','acces')),
  access_type text check (access_type is null or access_type in ('pirl','echafaudage')),
  internal_reference text not null,
  rental_reference text,
  rental_agency_id uuid references public.rental_agencies(id),
  brand text, description text not null, serial_number text,
  rental_start_date date, rental_planned_end_date date, rental_actual_end_date date,
  rental_contract_number text, rental_cost numeric check (rental_cost is null or rental_cost >= 0),
  rental_cost_frequency text check (rental_cost_frequency is null or rental_cost_frequency in ('jour','mois')),
  vic_date date, vic_due_date date,
  status text not null default 'disponible' check (status in ('disponible','affecte','maintenance','hors_service','restitue')),
  stock_location_id uuid references public.stock_locations(id),
  person_id uuid references public.people(id),
  notes text, active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, internal_reference),
  check (category = 'acces' or access_type is null),
  check (rental_actual_end_date is null or rental_start_date is null or rental_actual_end_date >= rental_start_date),
  check (vic_due_date is null or vic_date is null or vic_due_date >= vic_date)
);

create table public.equipment_movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.equipment_assets(id) on delete cascade,
  movement_type text not null check (movement_type in ('affectation','retour','transfert','maintenance','remise_service','restitution')),
  person_id uuid references public.people(id),
  stock_location_id uuid references public.stock_locations(id),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.equipment_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.equipment_assets(id) on delete cascade,
  document_type text not null check (document_type in ('contrat_location','rapport_vic','rapport_verification','photo','autre')),
  file_name text not null,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index rental_agencies_project_idx on public.rental_agencies(project_id);
create index rental_agencies_created_by_idx on public.rental_agencies(created_by);
create index equipment_assets_project_category_idx on public.equipment_assets(project_id,category);
create index equipment_assets_vic_due_idx on public.equipment_assets(project_id,vic_due_date) where active;
create index equipment_assets_agency_idx on public.equipment_assets(rental_agency_id);
create index equipment_assets_location_idx on public.equipment_assets(stock_location_id);
create index equipment_assets_person_idx on public.equipment_assets(person_id);
create index equipment_assets_created_by_idx on public.equipment_assets(created_by);
create index equipment_assets_updated_by_idx on public.equipment_assets(updated_by);
create index equipment_movements_asset_idx on public.equipment_movements(asset_id,created_at desc);
create index equipment_movements_project_idx on public.equipment_movements(project_id);
create index equipment_movements_person_idx on public.equipment_movements(person_id);
create index equipment_movements_location_idx on public.equipment_movements(stock_location_id);
create index equipment_movements_created_by_idx on public.equipment_movements(created_by);
create index equipment_documents_asset_idx on public.equipment_documents(asset_id,created_at desc);
create index equipment_documents_project_idx on public.equipment_documents(project_id);
create index equipment_documents_uploaded_by_idx on public.equipment_documents(uploaded_by);

alter table public.rental_agencies enable row level security;
alter table public.equipment_assets enable row level security;
alter table public.equipment_movements enable row level security;
alter table public.equipment_documents enable row level security;
grant select,insert,update on public.rental_agencies,public.equipment_assets to authenticated;
grant select,insert on public.equipment_movements,public.equipment_documents to authenticated;

create policy "members read rental agencies" on public.rental_agencies for select to authenticated using (exists(select 1 from public.project_memberships m where m.project_id=rental_agencies.project_id and m.user_id=(select auth.uid())));
create policy "members read equipment" on public.equipment_assets for select to authenticated using (exists(select 1 from public.project_memberships m where m.project_id=equipment_assets.project_id and m.user_id=(select auth.uid())));
create policy "members read equipment movements" on public.equipment_movements for select to authenticated using (exists(select 1 from public.project_memberships m where m.project_id=equipment_movements.project_id and m.user_id=(select auth.uid())));
create policy "members read equipment documents" on public.equipment_documents for select to authenticated using (exists(select 1 from public.project_memberships m where m.project_id=equipment_documents.project_id and m.user_id=(select auth.uid())));

create policy "stock managers insert rental agencies" on public.rental_agencies for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=rental_agencies.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));
create policy "stock managers update rental agencies" on public.rental_agencies for update to authenticated using (exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=rental_agencies.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier'))) with check (exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=rental_agencies.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));
create policy "stock managers insert equipment" on public.equipment_assets for insert to authenticated with check (created_by=(select auth.uid()) and updated_by=(select auth.uid()) and exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=equipment_assets.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));
create policy "stock managers update equipment" on public.equipment_assets for update to authenticated using (exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=equipment_assets.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier'))) with check (updated_by=(select auth.uid()) and exists(select 1 from public.project_memberships m where m.project_id=equipment_assets.project_id and m.user_id=(select auth.uid())));
create policy "stock managers insert equipment movements" on public.equipment_movements for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=equipment_movements.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));
create policy "stock managers insert equipment documents" on public.equipment_documents for insert to authenticated with check (uploaded_by=(select auth.uid()) and exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=equipment_documents.project_id and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('equipment-documents','equipment-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy "members read equipment files" on storage.objects for select to authenticated using (bucket_id='equipment-documents' and exists(select 1 from public.project_memberships m where m.project_id=(storage.foldername(name))[1]::uuid and m.user_id=(select auth.uid())));
create policy "stock managers upload equipment files" on storage.objects for insert to authenticated with check (bucket_id='equipment-documents' and exists(select 1 from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=(storage.foldername(name))[1]::uuid and m.user_id=(select auth.uid()) and p.role in ('administrateur','bureau','magasinier')));
