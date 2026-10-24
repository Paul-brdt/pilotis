grant update on table public.people to authenticated;

create policy "team managers update people"
on public.people
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = any (array['administrateur'::text, 'bureau'::text, 'conducteur'::text])
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = any (array['administrateur'::text, 'bureau'::text, 'conducteur'::text])
  )
);