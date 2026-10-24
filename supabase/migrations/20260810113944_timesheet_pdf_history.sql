alter table public.weekly_timesheets
  add column if not exists snapshot jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists weekly_timesheets_agency_history_idx
  on public.weekly_timesheets(project_id, agency_id, week_start desc);

comment on column public.weekly_timesheets.snapshot is
  'Instantané immuable des données métier utilisées pour générer la feuille PDF.';