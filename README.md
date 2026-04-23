# PostHog Engineering Impact Dashboard

A public leaderboard that ranks PostHog engineers by a composite impact score, computed from the last 30–90 days of merged PRs, code reviews, and linked-issue engagement on the [PostHog/posthog](https://github.com/PostHog/posthog) repo. Every number on every card has a tooltip that spells out the formula behind it.

Built end-to-end in **1.5 hours** using Claude Code with a kanban-style parallel-agent strategy (see below).

---

## Purpose

"Who are the most impactful engineers at PostHog?" is a question that gets asked a lot, and usually gets answered with a single metric — merged PR count, or reviews given, or lines changed — that any one person can game or accidentally top by being in the wrong role.

This dashboard tries to do better by:

1. **Breaking impact into four independent dimensions** (centrality, review leverage, user-value delivery, output baseline) so engineers in very different roles rank on legitimate grounds.
2. **Normalizing every sub-metric across the cohort** so a score of "80" means the same thing for a backend IC as it does for a frontend reviewer.
3. **Showing the raw numbers next to the normalized ones**, so any ranking can be hand-audited in a few seconds.
4. **Pre-computing the ranking in Postgres**, so the client does zero aggregation and the page loads in well under 10s.

The dashboard is read-only, public, and ships with a local mock fixture so you can see it in action without a Supabase connection.

---

## Methodology

The composite score is a weighted sum of four dimensions, each a mean of min-max-normalized sub-metrics on a 0–100 scale:

```
composite = 0.30 · centrality
          + 0.30 · review_leverage
          + 0.25 · user_value_delivery
          + 0.15 · output_baseline
```

| Dimension | Weight | Sub-metrics | What it measures |
|---|---|---|---|
| **Architectural Centrality** | 30% | core-PR share, file-hub score | How much of the work lands in load-bearing code that many authors touch. |
| **Review Leverage** | 30% | review depth, review breadth, turnaround (inverted) | Substantive reviews, wide authorship reach, and fast turnaround — how much the engineer unblocks the rest of the team. |
| **User Value Delivery** | 25% | issue-engagement weight | Reactions + comments on the issues this engineer's fix/feature PRs actually closed. Grounds the score in what users asked for. |
| **Output Baseline** | 15% | merged PRs (p95-capped), active days | A hygiene floor for consistent output. Capped at cohort p95 so no one wins on volume alone. |

### Cohort rules

- An engineer must clear a floor of **≥5 merged PRs OR ≥3 reviews given** in the window to appear — tiny samples are dropped so they can't fluke to the top via min-max normalization.
- Each (window × area) combination is its own cohort. Rank 1 in Backend is a different bar than rank 1 in Frontend.
- "Core" files are defined by a glob set: `posthog/`, `frontend/src/scenes/`, `ee/`, `rust/`, minus peripheral globs like `docs/`, `bin/`, `cypress/`, `.github/`.
- The turnaround sub-metric is inverted (lower hours → higher score) and displayed with an `inv` tag in the breakdown so it's never misread.

All of this lives in `src/content/methodology.ts` and is rendered in the Methodology panel at the bottom of the page plus in tooltips next to every score.

---

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite, styled with Tailwind.
- **Data layer:** Supabase (Postgres). All aggregation happens server-side in SQL views; the client reads one pre-ranked JSONB row per `(window_days, area)` via `@supabase/supabase-js`.
- **Ingestion:** Python scripts (`scripts/fetch.py`, `scripts/analyze.py`) that hit the GitHub REST API, upsert PRs / files / reviews / issues into Supabase, then populate the `impact_views` table.
- **Hosting:** Cloudflare Pages (static build of `dist/`).
- **Fallback:** If `VITE_SUPABASE_URL` is unset or the query fails, the UI renders a local mock fixture (`src/data/mockImpact.ts`) with a visible "Mock data" badge — so contributors can develop without any credentials.

---

## How it was built — Claude Code + parallel kanban agents

The whole project was scoped, planned, and shipped in 1.5 hours. The strategy was to use Claude Code's subagent capability to work on disjoint parts of the codebase in parallel, orchestrated like a kanban board.

### The carefully-scripted initial prompt

Before spawning any agents, I wrote one prompt that produced `kanban.md` — a file that laid out:

- A 90-minute time budget broken into four waves.
- Every task tagged with a track (`DATA` / `ANALYTICS` / `FE` / `OPS` / `DOC`), an estimate, and explicit dependencies.
- File ownership per agent per wave, so agents could not step on each other's files.
- A mock-data decoupling strategy: frontend agents built against a fake `mockImpact.ts` fixture while ingestion was still running, so the critical path (GitHub fetch → SQL views) never blocked UI work.
- A "what not to do" section to pin scope (no auth, no realtime, no unit tests, no 90+ day backfill).

That single planning doc became the contract every subagent worked against. It's still in the repo as `kanban.md`.

### The Supabase MCP connection

I connected Claude Code to the Supabase MCP server so agents could:

- Apply migrations directly (`mcp__supabase__apply_migration`) instead of hand-editing SQL files.
- Run `execute_sql` to sanity-check queries and iterate on the `v_engineer_impact` view's weights without leaving the session.
- Read `list_tables` and `get_advisors` for live schema validation.

This was the single biggest productivity unlock. Without it, every schema change would have been a round-trip through the dashboard UI.

### Wave structure (what actually ran)

- **Wave 1 (0:00–0:10) — Setup.** Three agents in parallel: one provisioned Supabase + migrations via MCP, one scaffolded Vite + Tailwind + the Header component, one drafted the methodology tooltip copy. I handled GitHub PAT + `.env.local`.
- **Wave 2 (0:10–0:50) — The long pole.** Ingestion agent ran the GitHub fetches sequentially (PRs → files → reviews → issues) while two frontend agents built `EngineerCard`, `Leaderboard`, `MetricBreakdown`, and `MethodologyPanel` against the mock fixture. I started SQL view work as soon as the PR table had rows.
- **Wave 3 (0:50–1:10) — Integration.** Swapped the hook from mock data to the live `impact_views` row. Inspected rank 1 by eye to verify the weights weren't producing nonsense; adjusted once.
- **Wave 4 (1:10–1:30) — Deploy.** Build, Cloudflare Pages, env vars, smoke test.

### What I did while agents worked

I didn't just watch the agents run. In parallel I was:

- Drafting the follow-up prompts each agent would get at its next sync point, so nobody idled waiting for me.
- Setting up the Cloudflare Pages project and wiring env vars in advance, so Wave 4 was mechanical.
- Watching ingestion logs — when the first PR batch landed I noticed the initial schema was missing some columns the analytics views would need, and I adjusted the architecture (moving normalization into the SQL view instead of the client) before any frontend agent committed to the wrong API shape.

The monitoring step mattered. The kanban's original composite formula had 6 dimensions with slightly different weights (visible in `kanban.md`); after looking at real data I collapsed it to the 4-dimension structure that actually shipped, because two of the original dimensions were nearly collinear on real PostHog data.

### What I'd do differently

- The ingestion track was serial-by-design (PR list blocks everything downstream), so I couldn't parallelize harder there. Next time I'd pre-fetch a single page of PRs manually at t=0 and hand that cached list to the analytics agent, so SQL view work could start at minute 2 instead of minute 25.
- I had the agents own whole component files, which worked, but I'd be stricter next time about also owning their types. Two agents briefly disagreed on the `EngineerImpact` interface before I centralized it in `src/lib/types.ts`.

---

## Running locally

```bash
npm install
npm run dev          # starts Vite at http://localhost:5173
```

If `.env.local` is missing Supabase credentials, the app renders the mock fixture automatically with a "Mock data" badge in the header — no setup required to see the UI.

To run against real data:

```bash
# .env.local
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Ingestion (Python):

```bash
cd scripts
pip install -r requirements.txt
python fetch.py      # populates raw tables from GitHub
python analyze.py    # computes impact_views rows
```

Build:

```bash
npm run build        # outputs to dist/
```

---

## Project structure

```
src/
  App.tsx                       # layout + filter state
  components/
    Header.tsx                  # title, Methodology jump link, date range
    FilterBar.tsx               # window (30/60/90) and area filters
    Leaderboard.tsx             # top 5 cards + ranks 6..N compact rows
    EngineerCard.tsx            # full card for top 5
    CompactRankRow.tsx          # expandable row for ranks 6+
    MetricBreakdown.tsx         # per-dimension bars + sub-metric grid
    MethodologyPanel.tsx        # full methodology at the bottom of the page
    InfoTooltip.tsx             # the (i) tooltip used everywhere
    BackToTop.tsx               # floating scroll-to-top button
  content/methodology.ts        # tooltip + panel copy for every metric
  data/mockImpact.ts            # local fallback fixture
  lib/
    supabase.ts                 # client
    types.ts                    # Area / DimensionKey / SubMetricKey unions
    useEngineerImpact.ts        # the one data hook

supabase/migrations/
  001_initial_schema.sql        # engineers, pull_requests, pr_files, reviews, issues
  002_disable_rls.sql           # public read access
  003_impact_views.sql          # the pre-ranked impact_views table

scripts/
  fetch.py                      # GitHub → Supabase ingestion
  analyze.py                    # raw tables → impact_views rows

kanban.md                       # the original planning doc the agents worked from
```
