create unique index if not exists stock_items_project_reference_uidx
on public.stock_items(project_id, upper(reference));

grant insert, update on public.stock_items to authenticated;

create policy "stock managers create items"
on public.stock_items for insert to authenticated
with check (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = stock_items.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur', 'bureau', 'magasinier')
  )
);

create policy "stock managers update items"
on public.stock_items for update to authenticated
using (
  exists (
    select 1
    from public.project_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.project_id = stock_items.project_id
      and membership.user_id = (select auth.uid())
      and profile.role in ('administrateur', 'bureau', 'magasinier')
  )
)
with check (
  exists (
    select 1
    from public.project_memberships membership
    where membership.project_id = stock_items.project_id
      and membership.user_id = (select auth.uid())
  )
);
