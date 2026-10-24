
revoke all on public.project_memberships from anon, authenticated;
grant select on public.project_memberships to authenticated;

revoke all on public.zone_task_budget_allocations from anon, authenticated;
grant select, insert, update, delete
  on public.zone_task_budget_allocations to authenticated;

create index if not exists zone_task_budget_allocations_task_idx
  on public.zone_task_budget_allocations(task_id);
create index if not exists zone_task_budget_allocations_created_by_idx
  on public.zone_task_budget_allocations(created_by);
