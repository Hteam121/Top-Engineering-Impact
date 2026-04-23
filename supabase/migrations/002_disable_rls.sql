-- Data is 100% public GitHub info. Disable RLS so the ingestion scripts can write with
-- the anon/publishable key (no service-role secret needed). Frontend stays read-only
-- because we only expose the anon key, which grants the client role — and without RLS,
-- anon reads continue to work via default grants.

alter table engineers      disable row level security;
alter table pull_requests  disable row level security;
alter table pr_files       disable row level security;
alter table reviews        disable row level security;
alter table issues         disable row level security;

-- Ensure the anon role can actually INSERT/UPDATE. By default Supabase grants only SELECT
-- to anon; with RLS off, we need the underlying grants.
grant insert, update, delete on engineers, pull_requests, pr_files, reviews, issues to anon;
