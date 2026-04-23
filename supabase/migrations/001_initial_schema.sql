-- Engineering impact dashboard — initial schema
-- DB1–DB5 tables, plus RLS with public-read policies so the anon key can SELECT.

create table if not exists engineers (
  login        text primary key,
  name         text,
  avatar_url   text,
  first_seen   timestamptz,
  last_seen    timestamptz
);

create table if not exists pull_requests (
  number          integer primary key,
  author_login    text references engineers(login) on delete set null,
  title           text,
  body            text,
  created_at      timestamptz,
  merged_at       timestamptz,
  additions       integer,
  deletions       integer,
  labels          text[] default '{}',
  linked_issues   integer[] default '{}',
  core_score      double precision
);
create index if not exists pull_requests_author_idx on pull_requests(author_login);
create index if not exists pull_requests_merged_at_idx on pull_requests(merged_at);

create table if not exists pr_files (
  pr_number   integer references pull_requests(number) on delete cascade,
  path        text,
  additions   integer,
  deletions   integer,
  primary key (pr_number, path)
);
create index if not exists pr_files_path_idx on pr_files(path);

create table if not exists reviews (
  pr_number              integer references pull_requests(number) on delete cascade,
  reviewer_login         text references engineers(login) on delete set null,
  author_login           text,
  state                  text,
  submitted_at           timestamptz,
  comment_count          integer default 0,
  hours_to_first_review  double precision,
  primary key (pr_number, reviewer_login, submitted_at)
);
create index if not exists reviews_reviewer_idx on reviews(reviewer_login);
create index if not exists reviews_author_idx on reviews(author_login);

create table if not exists issues (
  number          integer primary key,
  title           text,
  reactions_total integer default 0,
  comments        integer default 0,
  closed_by_pr    integer references pull_requests(number) on delete set null
);

alter table engineers      enable row level security;
alter table pull_requests  enable row level security;
alter table pr_files       enable row level security;
alter table reviews        enable row level security;
alter table issues         enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'engineers' and policyname = 'public_read') then
    create policy public_read on engineers for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pull_requests' and policyname = 'public_read') then
    create policy public_read on pull_requests for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pr_files' and policyname = 'public_read') then
    create policy public_read on pr_files for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'reviews' and policyname = 'public_read') then
    create policy public_read on reviews for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'issues' and policyname = 'public_read') then
    create policy public_read on issues for select using (true);
  end if;
end $$;
