// Types mirror the `impact_views` table in Supabase. Each row is one
// (window_days, area) view with a pre-computed, pre-ranked engineers[] JSONB
// so the client does zero aggregation.

export const AREAS = [
  'backend',
  'frontend',
  'rust',
] as const

export type Area = (typeof AREAS)[number]
export type AreaFilter = Area | 'all'

export const AREA_FILTERS: AreaFilter[] = ['all', ...AREAS]

export const AREA_LABELS: Record<AreaFilter, string> = {
  all: 'All',
  backend: 'Backend',
  frontend: 'Frontend',
  rust: 'Rust',
}

export const WINDOW_OPTIONS = [30, 60, 90] as const
export type WindowDays = (typeof WINDOW_OPTIONS)[number]

// ---- The four scoring dimensions --------------------------------------------

export const DIMENSION_KEYS = [
  'centrality',
  'review_leverage',
  'user_value',
  'output_baseline',
] as const

export type DimensionKey = (typeof DIMENSION_KEYS)[number]

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  centrality: 'Architectural Centrality',
  review_leverage: 'Review Leverage',
  user_value: 'User Value Delivery',
  output_baseline: 'Output Baseline',
}

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  centrality: 0.3,
  review_leverage: 0.3,
  user_value: 0.25,
  output_baseline: 0.15,
}

// ---- The eight normalized sub-metrics --------------------------------------

export const SUB_METRIC_KEYS = [
  'core_share',
  'file_hub',
  'review_depth',
  'review_breadth',
  'turnaround',
  'user_value',
  'merged_prs',
  'active_days',
] as const

export type SubMetricKey = (typeof SUB_METRIC_KEYS)[number]

export const DIMENSION_SUB_METRICS: Record<DimensionKey, SubMetricKey[]> = {
  centrality: ['core_share', 'file_hub'],
  review_leverage: ['review_depth', 'review_breadth', 'turnaround'],
  user_value: ['user_value'],
  output_baseline: ['merged_prs', 'active_days'],
}

// ---- Engineer record (one element of impact_views.engineers[]) -------------

export interface EngineerRaw {
  merged_prs: number
  merged_prs_capped: number
  core_share: number
  file_hub: number
  review_depth: number
  review_breadth: number
  /** Null for reviewers with no first-review samples in the window. */
  turnaround_hours: number | null
  reviews_given: number
  user_value_raw: number
  active_days: number
}

export interface EngineerImpact {
  login: string
  /** GitHub avatar URL; null for reviewers who never authored a PR. */
  avatar_url: string | null
  /** Composite score on the 0–100 scale. */
  composite: number
  /** Each dimension score on 0–100. */
  dimensions: Record<DimensionKey, number>
  /** Each sub-metric's cohort-normalized score on 0–100. */
  normalized: Record<SubMetricKey, number>
  raw: EngineerRaw
  /** Frontend-assigned from array position. Not present in the DB row. */
  rank?: number
}

/** Row shape of the impact_views table. */
export interface ImpactView {
  window_days: WindowDays
  area: AreaFilter
  engineers: EngineerImpact[]
  computed_at: string
}

// ---- Formatting helpers ----------------------------------------------------

export function formatSubMetricRaw(key: SubMetricKey, raw: EngineerRaw): string {
  switch (key) {
    case 'core_share':
      return `${Math.round(raw.core_share * 100)}%`
    case 'file_hub':
      return raw.file_hub.toFixed(1)
    case 'review_depth':
      return raw.review_depth.toFixed(2)
    case 'review_breadth':
      return String(raw.review_breadth)
    case 'turnaround':
      return raw.turnaround_hours === null
        ? '—'
        : `${raw.turnaround_hours.toFixed(1)}h`
    case 'user_value':
      return raw.user_value_raw.toLocaleString()
    case 'merged_prs':
      return String(raw.merged_prs)
    case 'active_days':
      return String(raw.active_days)
  }
}
