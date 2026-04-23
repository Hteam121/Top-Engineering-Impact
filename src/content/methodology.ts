import type { DimensionKey, SubMetricKey } from '../lib/types'

export interface SubMetricMeta {
  label: string
  short: string
  formula: string
  /** True when lower raw values score higher (turnaround hours). */
  inverted?: boolean
}

export const SUB_METRICS: Record<SubMetricKey, SubMetricMeta> = {
  core_share: {
    label: 'Core-PR share',
    short: 'Fraction of merged PRs that touch core product directories.',
    formula:
      'share of PRs with ≥1 file under posthog/, frontend/src/scenes/, ee/, or rust/',
  },
  file_hub: {
    label: 'File hub score',
    short:
      'Average number of other distinct authors who also touched the files this engineer edited.',
    formula:
      'per file touched, count of distinct co-authors across the window; averaged over the engineer’s touched files',
  },
  review_depth: {
    label: 'Review depth',
    short:
      'Average substantive weight of reviews given — more inline comments means a deeper review.',
    formula:
      '0 comments → 0.2, 1 → 0.4, 2 → 0.6, 3 → 0.8, 5+ → 1.0; averaged across the reviewer’s reviews',
  },
  review_breadth: {
    label: 'Review breadth',
    short: 'Distinct PR authors whose PRs this engineer reviewed.',
    formula: 'count of distinct authors reviewed in the window',
  },
  turnaround: {
    label: 'Turnaround',
    short: 'Median hours from PR open to this reviewer’s first review. Lower is better.',
    formula:
      'median hours across the reviewer’s first-review events; normalized inverted so faster reviews score higher',
    inverted: true,
  },
  user_value: {
    label: 'Issue-engagement weight',
    short:
      'Reactions and comments on the issues this engineer’s fix/feature PRs closed.',
    formula:
      'for each fix/feat PR, sum (👍/❤️/🎉/🚀 reactions + comments) on linked issues; summed per author',
  },
  merged_prs: {
    label: 'Merged PRs (capped)',
    short:
      'Count of merged PRs, capped at the cohort 95th percentile so a prolific author can’t dominate on volume.',
    formula: 'min(merged PR count, cohort p95)',
  },
  active_days: {
    label: 'Active days',
    short:
      'Distinct days with at least one authored PR merge or review submission.',
    formula: 'count of distinct dates with any PR/review activity in the window',
  },
}

export interface DimensionMeta {
  label: string
  weight: number
  short: string
  why: string
  formula: string
}

export const DIMENSIONS: Record<DimensionKey, DimensionMeta> = {
  centrality: {
    label: 'Architectural Centrality',
    weight: 0.3,
    short: 'How much of the work lands in core, load-bearing code.',
    why:
      'Not every PR is equal. Changes to core product code carry more weight than peripheral tweaks, and files edited by many authors are the load-bearing parts of the repo — work there ripples through everyone else.',
    formula:
      'Mean of core-PR share and file-hub score, each min-max normalized to 0–100 across the cohort.',
  },
  review_leverage: {
    label: 'Review Leverage',
    weight: 0.3,
    short: 'Review quality, reach, and how fast reviews come back.',
    why:
      'Senior engineers unblock others. Substantive reviews, wide authorship reach, and fast turnaround all directly accelerate the team — all three are undercounted in raw PR numbers and deserve explicit weight.',
    formula:
      'Mean of review depth, review breadth, and (inverted) turnaround, each normalized to 0–100.',
  },
  user_value: {
    label: 'User Value Delivery',
    weight: 0.25,
    short: 'Engagement on issues this engineer actually closed.',
    why:
      'Shipping features no one asked for isn’t impact. This dimension grounds the score in whether the PRs are closing issues people actually care about, weighted by the reactions and discussion on those issues.',
    formula:
      'Per fix/feature PR, sum the positive reactions + comments on each linked issue; normalized 0–100.',
  },
  output_baseline: {
    label: 'Output Baseline',
    weight: 0.15,
    short: 'A hygiene floor for volume and sustained presence.',
    why:
      'A small share of the score is reserved for consistent output so quality extremes can’t crowd out dependable contributors. The PR count is capped at cohort p95 so no one dominates on volume alone.',
    formula:
      'Mean of p95-capped merged PR count and active-day count, each normalized 0–100.',
  },
}

export const COMPOSITE_META = {
  label: 'Composite impact score',
  short: 'Four independent dimensions combined on a single 0–100 scale.',
  why:
    'No single metric captures engineering impact. Breaking it into four auditable dimensions — centrality, review leverage, user-value delivery, and an output-baseline floor — lets engineers in very different roles rank on legitimate grounds. Every sub-metric is visible on the card so any ranking can be validated by hand.',
  formula:
    'composite = 0.30·centrality + 0.30·review_leverage + 0.25·user_value_delivery + 0.15·output_baseline. Each dimension is the mean of its sub-metrics, all min-max normalized to 0–100 across the cohort in the selected window and area.',
}
