-- Single table the frontend reads. One row per (window_days, area); `engineers` is the
-- fully-ranked, pre-normalized leaderboard as JSON so the client does zero aggregation.

create table if not exists impact_views (
  window_days  integer not null,
  area         text    not null,
  engineers    jsonb   not null,
  computed_at  timestamptz not null default now(),
  primary key (window_days, area)
);

alter table impact_views disable row level security;
grant select, insert, update, delete on impact_views to anon;
