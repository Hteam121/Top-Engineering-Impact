import { Fragment } from 'react'
import { COMPOSITE_META, DIMENSIONS, SUB_METRICS } from '../content/methodology'
import {
  DIMENSION_KEYS,
  DIMENSION_SUB_METRICS,
  formatSubMetricRaw,
  type EngineerImpact,
} from '../lib/types'
import InfoTooltip from './InfoTooltip'

interface Props {
  engineer: EngineerImpact
}

export default function MetricBreakdown({ engineer }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {DIMENSION_KEYS.map((dk) => {
        const dim = DIMENSIONS[dk]
        const dimScore = engineer.dimensions[dk]
        const subs = DIMENSION_SUB_METRICS[dk]
        return (
          <div key={dk} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                {dim.label}
                <InfoTooltip label={`About ${dim.label}`} width={288}>
                  <span className="block text-slate-200">{dim.why}</span>
                  <span className="mt-2 block font-mono text-[11px] text-slate-400">
                    {dim.formula}
                  </span>
                </InfoTooltip>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold tabular-nums text-accent">
                  {Math.round(dimScore)}
                </span>
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  · {Math.round(dim.weight * 100)}%
                </span>
              </span>
            </div>

            <div
              className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
              title={`${dim.label} score: ${Math.round(dimScore)} / 100`}
            >
              <div
                className="h-full rounded-full bg-accent/75"
                style={{ width: `${dimScore}%` }}
              />
            </div>

            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_3.5rem_2rem] items-center gap-x-2 gap-y-2 pl-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_6rem_2.5rem] sm:gap-x-4 sm:pl-4">
              {subs.map((sk) => {
                const meta = SUB_METRICS[sk]
                const norm = engineer.normalized[sk]
                return (
                  <Fragment key={sk}>
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-400">
                      <span className="truncate">{meta.label}</span>
                      {meta.inverted && (
                        <span
                          className="font-mono text-[9px] uppercase tracking-wider text-accent/70"
                          title="Inverted — lower raw values score higher"
                        >
                          inv
                        </span>
                      )}
                      <InfoTooltip
                        label={`About ${meta.label}`}
                        placement={dk === 'centrality' ? 'bottom' : 'top'}
                      >
                        <span className="block text-slate-200">{meta.short}</span>
                        <span className="mt-2 block font-mono text-[11px] text-slate-400">
                          {meta.formula}
                        </span>
                      </InfoTooltip>
                    </span>
                    <span className="font-mono text-sm tabular-nums text-slate-200">
                      {formatSubMetricRaw(sk, engineer.raw)}
                    </span>
                    <div
                      className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.05]"
                      title={`${meta.label}: ${Math.round(norm)} / 100`}
                    >
                      <div
                        className="h-full bg-accent/50"
                        style={{ width: `${norm}%` }}
                      />
                    </div>
                    <span className="text-right font-mono text-sm tabular-nums text-slate-400">
                      {Math.round(norm)}
                    </span>
                  </Fragment>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CompositeInfo() {
  return (
    <InfoTooltip label="About the composite score" width={320} placement="bottom">
      <span className="block font-semibold text-slate-100">
        {COMPOSITE_META.label}
      </span>
      <span className="mt-1 block text-slate-300">{COMPOSITE_META.why}</span>
      <span className="mt-2 block font-mono text-[11px] text-slate-400">
        {COMPOSITE_META.formula}
      </span>
    </InfoTooltip>
  )
}
