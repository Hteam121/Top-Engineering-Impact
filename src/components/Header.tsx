import { AREA_LABELS, type AreaFilter } from '../lib/types'

interface Props {
  windowDays: number
  area: AreaFilter
  isMock: boolean
  updatedAt: Date
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  )
}

export default function Header({ windowDays, area, isMock, updatedAt }: Props) {
  const areaLabel = area === 'all' ? 'All areas' : AREA_LABELS[area]

  return (
    <header className="border-b border-white/5 bg-navy-950/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-8 lg:px-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.2em] text-slate-300">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_14px_0_rgba(251,191,36,0.7)]"
            />
            <span>PostHog</span>
            <span className="text-slate-600">/</span>
            <span>Engineering Impact</span>
          </div>

          <div className="flex items-center gap-3">
            {isMock && (
              <span
                title="Not connected to Supabase — rendering the local fixture."
                className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-accent"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Mock data
              </span>
            )}
            <a
              href="#methodology"
              className="group inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all hover:-translate-y-px hover:border-accent/70 hover:bg-accent/20 hover:shadow-[0_6px_20px_-8px_rgba(251,191,36,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 active:translate-y-0 active:bg-accent/25"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="opacity-80 transition-opacity group-hover:opacity-100"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Methodology
            </a>
          </div>
        </div>

        <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
          Top 5 engineers by composite impact
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-slate-400">
          <span>Last <span className="text-slate-100">{windowDays}</span> days</span>
          <span className="text-slate-600">·</span>
          <span>{areaLabel}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-sm text-slate-500">
            updated {formatTimestamp(updatedAt)}
          </span>
        </p>
      </div>
    </header>
  )
}
