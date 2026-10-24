create table if not exists public.task_budget_revisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  previous_budget_hours numeric(10,2) not null check (previous_budget_hours >= 0),
  revised_budget_hours numeric(10,2) not null check (revised_budget_hours >= 0),
  reason text not null check (length(trim(reason)) > 0),
  revised_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists task_budget_revisions_task_created_idx on public.task_budget_revisions(task_id, created_at desc);

alter table public.task_budget_revisions enable row level security;

create policy "authenticated read task budget revisions" on public.task_budget_revisions for select to authenticated using (true);
create policy "authorized insert tasks" on public.tasks for insert to authenticated with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur'))
);
create policy "authorized update tasks" on public.tasks for update to authenticated using (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur'))
) with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur'))
);
create policy "authorized insert task budget revisions" on public.task_budget_revisions for insert to authenticated with check (
  revised_by = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrateur','bureau','conducteur'))
);