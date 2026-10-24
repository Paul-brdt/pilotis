alter table public.projects
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists primary_color text not null default '#27745d' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists logo_url text,
  add column if not exists session_timeout_minutes integer not null default 30 check (session_timeout_minutes in (15, 30, 60));

create policy "authorized update projects" on public.projects for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur')))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur')));

create policy "authorized insert zones" on public.zones for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur')));

create policy "authorized update zones" on public.zones for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur')))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur')));