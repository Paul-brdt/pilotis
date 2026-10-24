create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'consultation' check (role in ('administrateur','conducteur','chef_chantier','magasinier','bureau','consultation')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  physical_progress numeric(5,2) not null default 0 check (physical_progress between 0 and 100),
  unique(project_id, code)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  code text not null,
  name text not null,
  budget_hours numeric(10,2) not null default 0,
  unique(project_id, code)
);

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  address text,
  postal_code text,
  city text,
  contact_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete set null,
  full_name text not null,
  qualification text,
  contract_type text not null check (contract_type in ('interne','interimaire')),
  coefficient text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id),
  task_id uuid not null references public.tasks(id),
  zone_id uuid references public.zones(id),
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  comment text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference text not null,
  name text not null,
  category text not null,
  unit text not null,
  ordered_quantity numeric(12,2) not null default 0,
  received_quantity numeric(12,2) not null default 0,
  minimum_quantity numeric(12,2) not null default 0,
  unique(project_id, reference)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id),
  movement_type text not null check (movement_type in ('entree','sortie')),
  quantity numeric(12,2) not null check (quantity > 0),
  person_id uuid references public.people(id),
  zone_id uuid references public.zones(id),
  storage_zone text,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((movement_type = 'entree' and storage_zone is not null) or movement_type = 'sortie')
);

create table public.cable_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  row_count integer not null default 0,
  status text not null default 'pending',
  imported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.cables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  import_id uuid references public.cable_imports(id) on delete set null,
  marker text not null,
  origin text,
  destination text,
  cable_type text,
  length_m numeric(12,2),
  status text not null default 'a_tirer',
  unique(project_id, marker)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index time_entries_project_date_idx on public.time_entries(project_id, work_date);
create index stock_movements_project_created_idx on public.stock_movements(project_id, created_at desc);
create index audit_events_project_created_idx on public.audit_events(project_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.zones enable row level security;
alter table public.tasks enable row level security;
alter table public.agencies enable row level security;
alter table public.people enable row level security;
alter table public.time_entries enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cable_imports enable row level security;
alter table public.cables enable row level security;
alter table public.audit_events enable row level security;

create policy "authenticated read profiles" on public.profiles for select to authenticated using (true);
create policy "authenticated read projects" on public.projects for select to authenticated using (true);
create policy "authenticated read zones" on public.zones for select to authenticated using (true);
create policy "authenticated read tasks" on public.tasks for select to authenticated using (true);
create policy "authenticated read agencies" on public.agencies for select to authenticated using (true);
create policy "authenticated read people" on public.people for select to authenticated using (true);
create policy "authenticated read time entries" on public.time_entries for select to authenticated using (true);
create policy "authenticated insert time entries" on public.time_entries for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated read stock items" on public.stock_items for select to authenticated using (true);
create policy "authenticated read stock movements" on public.stock_movements for select to authenticated using (true);
create policy "authenticated insert stock movements" on public.stock_movements for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated read cable imports" on public.cable_imports for select to authenticated using (true);
create policy "authenticated insert cable imports" on public.cable_imports for insert to authenticated with check (imported_by = auth.uid());
create policy "authenticated read cables" on public.cables for select to authenticated using (true);
create policy "authenticated read audit" on public.audit_events for select to authenticated using (true);
create policy "authenticated insert audit" on public.audit_events for insert to authenticated with check (actor_id = auth.uid());

insert into storage.buckets (id, name, public) values ('chantier-files', 'chantier-files', false)
on conflict (id) do nothing;
create policy "authenticated upload chantier files" on storage.objects for insert to authenticated with check (bucket_id = 'chantier-files');
create policy "authenticated read chantier files" on storage.objects for select to authenticated using (bucket_id = 'chantier-files');

insert into public.projects(code, name, location) values ('24-018', 'Extension usine · Phase 2', 'Saint-Pierre') on conflict (code) do nothing;
