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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300 sm:gap-2.5 sm:text-sm sm:tracking-[0.2em]">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_14px_0_rgba(251,191,36,0.7)] sm:h-2.5 sm:w-2.5"
            />
            <span>PostHog</span>
            <span className="text-slate-600">/</span>
            <span className="truncate">Engineering Impact</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isMock && (
              <span
                title="Not connected to Supabase — rendering the local fixture."
                className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent sm:px-3 sm:py-1 sm:text-xs"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Mock<span className="hidden sm:inline"> data</span>
              </span>
            )}
            <a
              href="#methodology"
              className="group inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all hover:-translate-y-px hover:border-accent/70 hover:bg-accent/20 hover:shadow-[0_6px_20px_-8px_rgba(251,191,36,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 active:translate-y-0 active:bg-accent/25 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="opacity-80 transition-opacity group-hover:opacity-100 sm:h-[15px] sm:w-[15px]"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Methodology
            </a>
          </div>
        </div>

        <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-tight text-slate-50 sm:mt-6 sm:text-4xl lg:text-5xl">
          Top 5 engineers by composite impact
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400 sm:gap-x-3 sm:text-base">
          <span>Last <span className="text-slate-100">{windowDays}</span> days</span>
          <span className="text-slate-600">·</span>
          <span>{areaLabel}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-xs text-slate-500 sm:text-sm">
            updated {formatTimestamp(updatedAt)}
          </span>
        </p>
      </div>
    </header>
  )
}
