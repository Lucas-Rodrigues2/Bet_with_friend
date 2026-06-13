-- Sink DB pour les tests E2E analytics (actif uniquement quand ANALYTICS_TEST_SINK=db)
create table if not exists public.analytics_events_test (
  id          uuid        primary key default gen_random_uuid(),
  distinct_id text        not null,
  event       text        not null,
  properties  jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
