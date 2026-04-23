import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  type EngineerImpact,
} from '../lib/types'
import MetricBreakdown, { CompositeInfo } from './MetricBreakdown'

interface Props {
  engineer: EngineerImpact
  isExpanded: boolean
  onToggle: () => void
}

export default function CompactRankRow({ engineer, isExpanded, onToggle }: Props) {
  const { login, avatar_url, composite, raw, rank, dimensions } = engineer

  return (
    <div
      className={[
        'rounded-lg border bg-navy-800/30 transition-colors',
        isExpanded ? 'border-white/20' : 'border-white/5 hover:border-white/15',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="grid w-full grid-cols-[2.5rem_2.25rem_1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-3 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 sm:grid-cols-[3rem_2.25rem_1fr_auto_6rem_auto_auto] sm:gap-5 sm:px-5 sm:py-3"
      >
        <span className="font-mono text-base tabular-nums text-slate-400">
          #{rank ?? '—'}
        </span>
        <Avatar url={avatar_url} seed={login} />
        <div className="min-w-0">
          <div className="truncate font-mono text-base font-medium text-slate-100">
            @{login}
          </div>
          <div className="truncate font-mono text-xs tabular-nums text-slate-500">
            <span className="text-slate-300">{raw.merged_prs}</span> PRs ·{' '}
            <span className="text-slate-300">{raw.reviews_given}</span> reviews
          </div>
        </div>
        <div className="hidden items-baseline gap-1.5 font-mono text-sm tabular-nums sm:flex">
          <span className="text-accent">{raw.active_days}</span>
          <span className="text-xs uppercase tracking-wider text-slate-500">
            days
          </span>
        </div>
        <DimensionPreview dimensions={dimensions} />
        <span
          className="inline-flex items-baseline gap-1.5 font-mono text-xl font-semibold tabular-nums text-accent"
        >
          {composite.toFixed(1)}
          <span
            // Swallow the row's onClick so the tooltip trigger doesn't also expand the row.
            onClick={(e) => e.stopPropagation()}
            role="presentation"
            className="text-slate-500"
          >
            <CompositeInfo />
          </span>
        </span>
        <span className="hidden font-mono text-xs uppercase tracking-wider text-slate-500 sm:inline">
          / 100
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-white/5 px-3 py-5 sm:px-8 sm:py-6">
          <div className="mx-auto max-w-3xl">
            <MetricBreakdown engineer={engineer} />
          </div>
        </div>
      )}
    </div>
  )
}

function DimensionPreview({
  dimensions,
}: {
  dimensions: EngineerImpact['dimensions']
}) {
  return (
    <div className="flex h-7 items-end gap-1">
      {DIMENSION_KEYS.map((dk) => (
        <div
          key={dk}
          title={`${DIMENSION_LABELS[dk]}: ${Math.round(dimensions[dk])}`}
          className="flex h-full w-3 items-end"
        >
          <div
            className="w-full rounded-[2px] bg-accent/65"
            style={{ height: `${Math.max(10, dimensions[dk])}%` }}
          />
        </div>
      ))}
    </div>
  )
}

function Avatar({ url, seed }: { url: string | null; seed: string }) {
  const src = url || `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`
  return (
    <img
      src={src}
      alt=""
      className="h-9 w-9 rounded-full bg-navy-700 ring-1 ring-white/10"
      loading="lazy"
    />
  )
}
