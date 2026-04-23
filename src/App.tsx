import { useMemo, useState } from 'react'
import BackToTop from './components/BackToTop'
import FilterBar from './components/FilterBar'
import Header from './components/Header'
import Leaderboard from './components/Leaderboard'
import MethodologyPanel from './components/MethodologyPanel'
import { useEngineerImpact } from './lib/useEngineerImpact'
import type { AreaFilter, WindowDays } from './lib/types'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export default function App() {
  const [windowDays, setWindowDays] = useState<WindowDays>(90)
  const [area, setArea] = useState<AreaFilter>('all')

  const { engineers, isMock, loading } = useEngineerImpact({ windowDays, area })
  const updatedAt = useMemo(() => new Date(), [])
  const medianPRs = useMemo(
    () => median(engineers.map((e) => e.raw.merged_prs)),
    [engineers],
  )

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100">
      <Header
        windowDays={windowDays}
        area={area}
        isMock={isMock}
        updatedAt={updatedAt}
      />
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:space-y-8 sm:px-8 sm:py-8 lg:px-10">
        <FilterBar
          windowDays={windowDays}
          area={area}
          onWindowChange={setWindowDays}
          onAreaChange={setArea}
          cohortSize={engineers.length}
          medianPRs={medianPRs}
        />
        {loading && engineers.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center font-mono text-sm uppercase tracking-wider text-slate-500">
            Loading impact_views…
          </div>
        ) : (
          <Leaderboard engineers={engineers} windowDays={windowDays} />
        )}
        <MethodologyPanel />
      </main>
      <BackToTop />
    </div>
  )
}
