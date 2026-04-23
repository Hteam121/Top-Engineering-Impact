import {
  AREAS,
  AREA_LABELS,
  WINDOW_OPTIONS,
  type AreaFilter,
  type WindowDays,
} from '../lib/types'
import InfoTooltip from './InfoTooltip'

interface Props {
  windowDays: WindowDays
  area: AreaFilter
  onWindowChange: (w: WindowDays) => void
  onAreaChange: (a: AreaFilter) => void
  cohortSize: number
  medianPRs: number
}

const AREA_OPTIONS: AreaFilter[] = ['all', ...AREAS]

export default function FilterBar({
  windowDays,
  area,
  onWindowChange,
  onAreaChange,
  cohortSize,
  medianPRs,
}: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800/50 p-4 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Segmented
            label="Window"
            info={
              <>
                <span className="block text-slate-200">
                  Rolling time window for the ranking. Changing it swaps to a
                  different pre-computed row in <code className="font-mono text-slate-300">impact_views</code>.
                </span>
                <span className="mt-1 block text-slate-400">
                  All sub-metrics (PR count, reviews, turnaround, etc.) are
                  re-aggregated per window.
                </span>
              </>
            }
            value={windowDays}
            options={WINDOW_OPTIONS.map((d) => ({ value: d, label: `${d}d` }))}
            onChange={onWindowChange}
          />
          <Segmented
            label="Area"
            info={
              <>
                <span className="block text-slate-200">
                  Restrict the cohort to engineers whose PRs touched a specific
                  area of the repo. Each area has its own normalization cohort,
                  so rank 1 in Backend ≠ rank 1 in Frontend.
                </span>
              </>
            }
            value={area}
            options={AREA_OPTIONS.map((a) => ({ value: a, label: AREA_LABELS[a] }))}
            onChange={onAreaChange}
          />
        </div>

        <dl className="flex items-center gap-6 text-sm text-slate-400 lg:justify-end">
          <div className="flex items-baseline gap-2">
            <dt className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-500">
              Ranked
              <InfoTooltip
                label="About the ranked count"
                placement="bottom"
                width={288}
              >
                <span className="block text-slate-200">
                  Number of engineers in the current (window × area) cohort
                  that clear the activity floor: at least 5 merged PRs or at
                  least 3 reviews given in the window. Tiny samples are dropped
                  so they can't fluke to the top via min-max normalization.
                </span>
              </InfoTooltip>
            </dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-accent">
              {cohortSize}
            </dd>
            <span className="text-slate-500">authors</span>
          </div>
          <div className="h-6 w-px bg-white/10" aria-hidden="true" />
          <div className="flex items-baseline gap-2">
            <dt className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-500">
              Median
              <InfoTooltip
                label="About the median PRs stat"
                placement="bottom"
                width={256}
              >
                <span className="block text-slate-200">
                  Median count of merged PRs across the ranked cohort. A quick
                  sanity check on how active the group is for the selected
                  window and area.
                </span>
              </InfoTooltip>
            </dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-accent">
              {medianPRs}
            </dd>
            <span className="text-slate-500">PRs</span>
          </div>
        </dl>
      </div>
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  label: string
  info?: React.ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

function Segmented<T extends string | number>({
  label,
  info,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-500">
        {label}
        {info && (
          <InfoTooltip
            label={`About the ${label.toLowerCase()} filter`}
            placement="bottom"
            width={288}
          >
            {info}
          </InfoTooltip>
        )}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-lg border border-white/10 bg-navy-900 p-0.5"
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:text-slate-100',
              ].join(' ')}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
