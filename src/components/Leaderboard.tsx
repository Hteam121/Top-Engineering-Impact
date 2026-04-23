import { useState } from 'react'
import type { EngineerImpact } from '../lib/types'
import CompactRankRow from './CompactRankRow'
import EngineerCard from './EngineerCard'

interface Props {
  engineers: EngineerImpact[]
  windowDays: number
}

export default function Leaderboard({ engineers, windowDays }: Props) {
  const [expandedLogin, setExpandedLogin] = useState<string | null>(null)

  if (engineers.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-10 text-center text-base text-slate-400">
        No engineers match the current filters.
      </div>
    )
  }

  const top5 = engineers.slice(0, 5)
  const rest = engineers.slice(5)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Top {top5.length} · by composite
        </h2>
        <div className="flex flex-col gap-4">
          {top5.map((e) => (
            <EngineerCard key={e.login} engineer={e} windowDays={windowDays} />
          ))}
        </div>
      </section>

      {rest.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Ranks 6 to {engineers.length}
          </h2>
          <div className="flex flex-col gap-2">
            {rest.map((e) => (
              <CompactRankRow
                key={e.login}
                engineer={e}
                isExpanded={expandedLogin === e.login}
                onToggle={() =>
                  setExpandedLogin((cur) => (cur === e.login ? null : e.login))
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
