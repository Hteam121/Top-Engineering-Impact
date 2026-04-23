// Mock fixture in the exact shape of impact_views.engineers[]. Used only when
// Supabase is unreachable. The `_mockArea` tag is mock-only and supports the
// FilterBar slicing; it is never present on real JSONB rows.

import {
  DIMENSION_KEYS,
  DIMENSION_SUB_METRICS,
  DIMENSION_WEIGHTS,
  SUB_METRIC_KEYS,
  type Area,
  type DimensionKey,
  type EngineerImpact,
  type EngineerRaw,
  type SubMetricKey,
} from '../lib/types'

export type MockEngineerImpact = EngineerImpact & { _mockArea: Area }

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(1337)

function normal(): number {
  const u = Math.max(rand(), 1e-9)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function biasedNormalized(bias: number): number {
  const base = 50 + normal() * 18 + bias * 14
  return Math.max(4, Math.min(99, Math.round(base * 100) / 100))
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function mockArea(i: number): Area {
  const bucket = (i * 17) % 10
  if (bucket < 5) return 'backend'
  if (bucket < 8) return 'frontend'
  return 'rust'
}

const COUNT = 25

const engineers: MockEngineerImpact[] = Array.from({ length: COUNT }, (_, i) => {
  const login = `engineer-${String(i + 1).padStart(2, '0')}`
  const bias = 1.5 - (i / COUNT) * 3.0

  const normalized = {} as Record<SubMetricKey, number>
  for (const k of SUB_METRIC_KEYS) {
    normalized[k] = biasedNormalized(bias)
  }

  const dimensions = {} as Record<DimensionKey, number>
  for (const d of DIMENSION_KEYS) {
    const subs = DIMENSION_SUB_METRICS[d]
    const mean = subs.reduce((s, k) => s + normalized[k], 0) / subs.length
    dimensions[d] = round(mean, 2)
  }

  const composite = round(
    DIMENSION_KEYS.reduce((s, d) => s + DIMENSION_WEIGHTS[d] * dimensions[d], 0),
    2,
  )

  // De-normalize sub-metric scores back to plausible raw values.
  const mergedPrs = Math.round(4 + (normalized.merged_prs / 100) * 31)
  const raw: EngineerRaw = {
    merged_prs: mergedPrs,
    merged_prs_capped: Math.min(mergedPrs, 22), // mock p95 cap
    core_share: round((normalized.core_share / 100) * 0.95, 3),
    file_hub: round((normalized.file_hub / 100) * 8, 2),
    review_depth: round(0.2 + (normalized.review_depth / 100) * 0.8, 3),
    review_breadth: Math.round((normalized.review_breadth / 100) * 32),
    // turnaround is inverted: high normalized score = few hours
    turnaround_hours:
      i === COUNT - 1
        ? null
        : round(2 + ((100 - normalized.turnaround) / 100) * 46, 1),
    reviews_given: Math.round(3 + (normalized.review_depth / 100) * 52),
    user_value_raw: Math.round((normalized.user_value / 100) * 320),
    active_days: Math.round(3 + (normalized.active_days / 100) * 54),
  }

  return {
    login,
    avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${login}`,
    composite,
    dimensions,
    normalized,
    raw,
    _mockArea: mockArea(i),
  }
})

engineers.sort((a, b) => b.composite - a.composite)
engineers.forEach((e, i) => {
  e.rank = i + 1
})

export const mockImpact: MockEngineerImpact[] = engineers
