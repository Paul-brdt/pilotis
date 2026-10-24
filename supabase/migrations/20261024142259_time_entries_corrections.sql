-- Allow site managers to correct or delete booked hours. Corrections are
-- traced in audit_events by the API.
alter table public.time_entries enable row level security;

grant update, delete on public.time_entries to authenticated;

drop policy if exists "site managers update time entries" on public.time_entries;
create policy "site managers update time entries"
on public.time_entries for update to authenticated
using (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = time_entries.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = time_entries.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
);

drop policy if exists "site managers delete time entries" on public.time_entries;
create policy "site managers delete time entries"
on public.time_entries for delete to authenticated
using (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = time_entries.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur','bureau','conducteur','chef_chantier')
  )
);
