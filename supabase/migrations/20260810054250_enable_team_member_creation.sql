create unique index if not exists agencies_name_lower_unique on public.agencies (lower(name));

create policy "team managers insert people"
on public.people
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('administrateur','bureau','conducteur')
  )
);

create policy "team managers insert agencies"
on public.agencies
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('administrateur','bureau','conducteur')
  )
);

grant select, insert on public.people to authenticated;
grant select, insert on public.agencies to authenticated;