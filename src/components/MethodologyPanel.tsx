import { COMPOSITE_META, DIMENSIONS, SUB_METRICS } from '../content/methodology'
import { DIMENSION_KEYS, DIMENSION_SUB_METRICS } from '../lib/types'

export default function MethodologyPanel() {
  return (
    <section
      id="methodology"
      aria-labelledby="methodology-heading"
      className="scroll-mt-6 rounded-2xl border border-white/10 bg-navy-800/40 p-4 sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-accent"
          />
          <h2
            id="methodology-heading"
            className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-200"
          >
            Methodology
          </h2>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-slate-500">
          Four dimensions · 0 to 100
        </span>
      </div>

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">
        {COMPOSITE_META.why}
      </p>
      <p className="mt-3 max-w-3xl font-mono text-sm leading-relaxed text-slate-400">
        {COMPOSITE_META.formula}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {DIMENSION_KEYS.map((dk) => {
          const dim = DIMENSIONS[dk]
          const subs = DIMENSION_SUB_METRICS[dk]
          return (
            <div
              key={dk}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-50">
                  {dim.label}
                </h3>
                <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                  {Math.round(dim.weight * 100)}%
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {dim.why}
              </p>
              <p className="mt-2 font-mono text-xs leading-relaxed text-slate-500">
                {dim.formula}
              </p>

              <ul className="mt-4 space-y-3 border-t border-white/5 pt-4">
                {subs.map((sk) => {
                  const sm = SUB_METRICS[sk]
                  return (
                    <li key={sk} className="flex flex-col gap-1 text-sm">
                      <span className="flex items-baseline gap-2">
                        <span className="font-medium text-slate-100">
                          {sm.label}
                        </span>
                        {sm.inverted && (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-accent/80">
                            inverted
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-slate-400">{sm.short}</span>
                      <span className="font-mono text-xs text-slate-500">
                        {sm.formula}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
