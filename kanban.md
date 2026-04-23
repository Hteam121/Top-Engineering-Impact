# PostHog Engineering Impact Dashboard — Kanban

**Deadline:** 1h 30min total. Target: ship a working, hosted dashboard showing top 25 PostHog engineers by composite impact, with methodology transparency for every metric.

**Stack:** React (Vite) + Cloudflare Pages (frontend). Supabase (Postgres + a single edge function for GitHub ingestion, or local Node script that writes to Supabase). All GitHub data lives in Supabase tables; the React app reads from Supabase via the JS client with the anon key.

**Time budget:**
- 0:00–0:10 — Setup (parallel)
- 0:10–0:50 — Data ingestion + Frontend scaffold (parallel)
- 0:50–1:10 — Metrics computation + UI wiring (parallel)
- 1:10–1:25 — Polish + deploy
- 1:25–1:30 — Smoke test + submit

---

## Legend — Tracks

- **[DATA]** GitHub ingestion → Supabase raw tables
- **[ANALYTICS]** SQL views / functions that compute impact metrics
- **[FE]** React dashboard
- **[OPS]** Supabase project, Cloudflare Pages deploy
- **[DOC]** Methodology copy shown in UI tooltips

Each task lists `(track, est. minutes, depends-on)`.

---

## BACKLOG

### Setup & infra
- **S1** Create Supabase project via MCP, grab URL + anon key `(OPS, 3m, -)`
- **S2** `npm create vite@latest` → React + TS, install `@supabase/supabase-js`, `recharts`, `tailwindcss` `(FE, 5m, -)`
- **S3** Get a GitHub personal access token (user provides; read-only public repo scope) `(DATA, 1m, -)`

### Schema (Supabase)
- **DB1** `engineers` table: `login`, `name`, `avatar_url`, `first_seen`, `last_seen` `(OPS, 2m, S1)`
- **DB2** `pull_requests`: `number`, `author_login`, `title`, `body`, `created_at`, `merged_at`, `additions`, `deletions`, `labels[]`, `linked_issues[]`, `core_score` (derived later) `(OPS, 2m, S1)`
- **DB3** `pr_files`: `pr_number`, `path`, `additions`, `deletions` `(OPS, 1m, S1)`
- **DB4** `reviews`: `pr_number`, `reviewer_login`, `author_login`, `state`, `submitted_at`, `comment_count`, `hours_to_first_review` `(OPS, 2m, S1)`
- **DB5** `issues`: `number`, `title`, `reactions_total`, `comments`, `closed_by_pr` `(OPS, 2m, S1)`
- **DB6** Apply all schema via `mcp__supabase__apply_migration` in one migration file `(OPS, 2m, DB1-DB5)`

### Ingestion scripts (Node, run locally, write to Supabase)
- **I1** `scripts/fetch-prs.ts` — GitHub REST `/repos/PostHog/posthog/pulls?state=closed&sort=updated&direction=desc`, paginate until `updated_at < now-90d`. Upsert into `pull_requests` + `engineers` `(DATA, 10m, DB6, S3)`
- **I2** `scripts/fetch-pr-files.ts` — for each PR from I1, GET `/pulls/{n}/files`. Upsert into `pr_files` `(DATA, 8m, I1)`
- **I3** `scripts/fetch-reviews.ts` — for each PR, GET `/pulls/{n}/reviews` + `/pulls/{n}/comments`. Compute `comment_count` per review, `hours_to_first_review` per PR. Upsert into `reviews` `(DATA, 10m, I1)`
- **I4** `scripts/fetch-issues.ts` — for each `linked_issues[]` from I1, GET `/issues/{n}`. Upsert `reactions_total`, `comments` into `issues` `(DATA, 6m, I1)`
- **I5** Body parser: regex `/(?:fixes|closes|resolves)\s+#(\d+)/gi` on PR body to populate `linked_issues[]` `(DATA, 3m, I1)`

### Analytics (SQL views / RPC functions in Supabase)
- **A1** `v_file_centrality`: per-file count of distinct authors touching it in 90d. Top 5% flagged as "central" `(ANALYTICS, 5m, I2)`
- **A2** `v_core_score`: per-PR weight = share of changed files matching core globs (`posthog/`, `frontend/src/scenes/`, `plugin-server/`, `rust/`, `ee/`) minus peripheral globs (`docs/`, `bin/`, `cypress/`, `.github/`) `(ANALYTICS, 5m, I2)`
- **A3** `v_review_quality`: per reviewer, sum(comment_count per review) and distinct authors reviewed `(ANALYTICS, 4m, I3)`
- **A4** `v_turnaround`: per reviewer, median `hours_to_first_review` `(ANALYTICS, 3m, I3)`
- **A5** `v_issue_impact`: per PR author, sum of linked-issue `reactions_total + comments` `(ANALYTICS, 3m, I4, I5)`
- **A6** `v_bug_vs_feature`: per author, count PRs where title matches `^fix[:(]` or labels contain `bug`, vs `^feat[:(]` or `enhancement` `(ANALYTICS, 3m, I1)`
- **A7** `v_engineer_impact` (the money view) — joins A1–A6 into one row per engineer, computes normalized z-scores per metric, exposes both raw values AND the final composite. Returns top 25 `(ANALYTICS, 8m, A1-A6)`

### Frontend
- **F1** `src/lib/supabase.ts` — client init with env vars `(FE, 2m, S2, S1)`
- **F2** `useEngineerImpact()` hook — fetches `v_engineer_impact`, caches in state `(FE, 3m, F1, A7)`
- **F3** `<EngineerCard />` — avatar, name, composite score, rank, sparkline of PR activity. Click expands `(FE, 8m, F1)`
- **F4** `<MetricBreakdown />` — inside expanded card, bar chart of the 6 sub-scores (z-score normalized) with info tooltip per bar `(FE, 10m, F3, D1)`
- **F5** `<MethodologyPanel />` — collapsible sidebar explaining composite formula + each metric `(FE, 6m, D1)`
- **F6** `<Leaderboard />` — grid of 25 cards, sorted by composite, 5 per row × 5 rows to fit one laptop page. Sort-by dropdown for each metric `(FE, 8m, F3)`
- **F7** `<Header />` — title, date range badge ("last 90 days through 2026-04-23"), repo link `(FE, 3m, -)`
- **F8** Tailwind polish — dense layout, readable at 1440×900, no scroll beyond fold for top-5 view `(FE, 6m, F6)`

### Methodology copy (writable in parallel with everything)
- **D1** Write tooltip text for each of: file centrality, core/peripheral, review quality, cross-team glue, turnaround, issue impact, bug/feature mix, and composite formula. Each ≤2 sentences, explains the "why" `(DOC, 10m, -)`

### Deploy
- **DEP1** `wrangler`-less Cloudflare Pages: `npm run build` → manual drag-upload OR `git push` to a GitHub repo connected to Pages. User said they'll handle wrangler themselves — just produce a clean `dist/` and commit it `(OPS, 5m, F8)`
- **DEP2** Set Supabase URL + anon key as Pages env vars (user does manually) `(OPS, 2m, DEP1)`
- **DEP3** Smoke test hosted URL, verify <10s load, verify all 25 cards render `(OPS, 3m, DEP2)`

---

## PARALLEL EXECUTION PLAN

Run up to **4 background agents** simultaneously. Agents must not touch each other's files.

### Wave 1 — 0:00–0:10 (setup, fully parallel)
| Agent | Tasks | Files owned |
|-------|-------|-------------|
| A (ops) | S1, DB1–DB6 via Supabase MCP | `supabase/migrations/*` |
| B (fe-scaffold) | S2, F1, F7 | `package.json`, `src/lib/supabase.ts`, `src/components/Header.tsx` |
| C (doc) | D1 | `src/content/methodology.ts` |
| You | S3 + coordinate, write `.env.local` once A finishes S1 | `.env.local` |

**Sync point:** migration applied, React app boots, methodology copy drafted.

### Wave 2 — 0:10–0:50 (the long pole: ingestion + UI in parallel)
| Agent | Tasks | Files owned |
|-------|-------|-------------|
| A (ingest) | I1 → I2 → I3 → I4 (sequential inside the agent; I5 folded into I1) | `scripts/fetch-*.ts` |
| B (fe) | F3, F6, F8 (mock data until A7 is ready) | `src/components/EngineerCard.tsx`, `Leaderboard.tsx` |
| C (fe-detail) | F4, F5 wired to mocked data | `src/components/MetricBreakdown.tsx`, `MethodologyPanel.tsx` |
| You | As soon as I1 produces rows, start A1–A6 via Supabase MCP SQL. A7 last. | `supabase/migrations/002_views.sql` |

**Critical:** Agents B and C build against a `mockImpact.ts` fixture (20 fake engineers) so they never block on real data. Swap to live data at the sync point.

**Sync point:** all raw tables populated, all views exist, `v_engineer_impact` returns 25 rows.

### Wave 3 — 0:50–1:10 (integration, parallel shrinks)
| Agent | Tasks |
|-------|-------|
| A | A7 tuning — inspect scores, sanity-check that rank 1 is a real senior engineer. If the ranking looks wrong, adjust weights in A7 |
| B | F2 hook swap: mock → live. Verify `EngineerCard` renders real data |
| You | Write the composite-score formula into D1 tooltip, matching A7's actual weights |

**Sync point:** dashboard shows real top-25 locally at `localhost:5173`.

### Wave 4 — 1:10–1:30 (solo, serial)
- Build → deploy (DEP1) → env vars (DEP2) → smoke test (DEP3) → submit form

---

## CRITICAL-PATH DEPENDENCIES (what blocks what)

```
S1 ──► DB1–DB6 ──► I1 ──► I2,I3,I4,I5 ──► A1–A6 ──► A7 ──► F2 ──► DEP1
                    │                                 ▲
                    └─────────(mock data)────► F3,F4,F6 (unblocked early)
```

The only real blocker is **I1** (PR list). Everything downstream waits on it. So I1 must start at 0:10 sharp and finish by 0:25.

---

## IMPACT SCORE FORMULA (reference for A7 + D1 tooltip)

```
composite = 0.20 * z(core_weighted_PRs)
          + 0.15 * z(central_files_touched)
          + 0.15 * z(review_quality)        // sum of comments-per-review across reviews given
          + 0.15 * z(cross_team_glue)       // distinct authors reviewed
          + 0.10 * z(fast_turnaround)       // inverted: lower hours = higher z
          + 0.15 * z(issue_impact)          // reactions + comments on linked issues
          + 0.10 * z(bug_fix_ratio)         // reliability signal, capped
```

Each component is a z-score so the 6 pillars are commensurable. Weights sum to 1.0. The card UI shows raw values, not just the z, so a leader can validate by eye.

---

## RED-FLAG GUARDRAILS (self-check before submit)

- [ ] Link loads in <10s → use Supabase views (pre-computed), not client-side aggregation
- [ ] Every number has a tooltip explaining how it was computed
- [ ] Date range stated in header ("Last 90 days through 2026-04-23")
- [ ] Composite score and its 6 component scores both visible
- [ ] Top 5 engineers visible above the fold at 1440×900
- [ ] No "Score: 207" with no context — every score has a tooltip + breakdown
- [ ] Answers "who are the most impactful engineers at PostHog" — title of page is literally that question

---

## WHAT NOT TO DO (scope discipline)

- No auth — dashboard is public read
- No realtime subscriptions — data is a static 90-day snapshot
- No backfill beyond 90 days
- No commit-level data — PRs + reviews + issues is enough
- No manual engineer curation — the ranking must come from the formula
- No custom design system — Tailwind defaults are fine
- No unit tests — smoke test the deployed URL, that's it
