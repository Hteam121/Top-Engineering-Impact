import type { EngineerImpact } from '../lib/types'
import InfoTooltip from './InfoTooltip'
import MetricBreakdown, { CompositeInfo } from './MetricBreakdown'

interface Props {
  engineer: EngineerImpact
  windowDays: number
}

export default function EngineerCard({ engineer, windowDays }: Props) {
  const { login, avatar_url, composite, raw, rank } = engineer
  const isTop = rank === 1

  return (
    <article
      className={[
        'relative rounded-2xl border bg-navy-800/40 p-4 transition-colors sm:p-7',
        isTop
          ? 'border-accent/35 shadow-[0_0_60px_-25px_rgba(251,191,36,0.55)]'
          : 'border-white/10',
      ].join(' ')}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,36%)_1fr] md:gap-8 lg:gap-10">
        {/* Left: identity + composite */}
        <div className="flex flex-col gap-5 sm:gap-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex w-9 shrink-0 flex-col items-center sm:w-11">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs">
                Rank
                <InfoTooltip
                  label="About the rank badge"
                  placement="bottom"
                  width={240}
                >
                  <span className="block text-slate-200">
                    Position within the current (window × area) cohort, ordered
                    by composite score. Rank 1 is the highest composite in view.
                  </span>
                </InfoTooltip>
              </span>
              <span
                className={[
                  'font-mono text-2xl font-semibold leading-tight tabular-nums sm:text-3xl',
                  isTop ? 'text-accent' : 'text-slate-100',
                ].join(' ')}
              >
                #{rank ?? '—'}
              </span>
            </div>

            <Avatar url={avatar_url} seed={login} />

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold leading-tight text-slate-50 sm:text-xl">
                @{login}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-slate-400 sm:gap-x-4 sm:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-accent">{raw.merged_prs}</span>
                  <span className="text-slate-500">PRs</span>
                  <InfoTooltip label="About PRs stat" placement="bottom" width={256}>
                    <span className="block text-slate-200">
                      Merged pull requests authored by this engineer in the
                      window. Raw count — the p95-capped value is what feeds the
                      Output Baseline dimension.
                    </span>
                  </InfoTooltip>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-accent">{raw.reviews_given}</span>
                  <span className="text-slate-500">reviews</span>
                  <InfoTooltip label="About reviews stat" placement="bottom" width={256}>
                    <span className="block text-slate-200">
                      Total review submissions by this engineer in the window.
                      The depth (comment count per review) and breadth (distinct
                      authors reviewed) feed Review Leverage.
                    </span>
                  </InfoTooltip>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-accent">{raw.active_days}</span>
                  <span className="text-slate-500">active days</span>
                  <InfoTooltip
                    label="About active days stat"
                    placement="bottom"
                    width={256}
                  >
                    <span className="block text-slate-200">
                      Distinct calendar days with at least one authored PR merge
                      or review submission. Feeds the Output Baseline dimension.
                    </span>
                  </InfoTooltip>
                </span>
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">
                Last {windowDays}d
              </p>
            </div>
          </div>

          <div className="flex flex-col border-t border-white/5 pt-4 sm:pt-5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
              Composite score
              <CompositeInfo />
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={[
                  'font-mono text-4xl font-semibold leading-none tabular-nums sm:text-5xl lg:text-6xl',
                  isTop
                    ? 'text-accent drop-shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                    : 'text-slate-50',
                ].join(' ')}
              >
                {composite.toFixed(1)}
              </span>
              <span className="font-mono text-sm text-slate-500 sm:text-base">/ 100</span>
            </div>
            <span className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500 sm:text-xs">
              cohort-normalized · 0 to 100
            </span>
          </div>
        </div>

        {/* Right: full breakdown */}
        <div className="border-t border-white/5 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0 lg:pl-10">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Dimension breakdown
              <InfoTooltip
                label="About the dimension breakdown"
                placement="bottom"
                width={288}
              >
                <span className="block text-slate-200">
                  Every sub-metric is min-max normalized across the cohort to
                  0–100, then the four dimension scores (each a mean of its
                  sub-metrics) are combined with fixed weights into the
                  composite. Click any <em>i</em> to see what a specific number
                  means.
                </span>
              </InfoTooltip>
            </span>
            <span className="font-mono text-xs uppercase tracking-wider text-slate-500">
              raw · score
            </span>
          </div>
          <MetricBreakdown engineer={engineer} />
        </div>
      </div>
    </article>
  )
}

function Avatar({ url, seed }: { url: string | null; seed: string }) {
  const src = url || `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`
  return (
    <img
      src={src}
      alt=""
      width={64}
      height={64}
      className="h-12 w-12 shrink-0 rounded-full bg-navy-700 ring-2 ring-white/10 sm:h-16 sm:w-16"
      loading="lazy"
    />
  )
}
