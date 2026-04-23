import { useEffect, useState } from 'react'
import { mockImpact, type MockEngineerImpact } from '../data/mockImpact'
import { supabase } from './supabase'
import type { AreaFilter, EngineerImpact, WindowDays } from './types'

export interface UseImpactResult {
  engineers: EngineerImpact[]
  loading: boolean
  /** True when the data shown is the local fixture rather than impact_views. */
  isMock: boolean
  error: string | null
}

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return Boolean(
    url && key && !String(key).includes('your-anon-key') && !String(url).includes('your-project'),
  )
}

function mockFor(area: AreaFilter): EngineerImpact[] {
  const base: MockEngineerImpact[] =
    area === 'all' ? mockImpact : mockImpact.filter((e) => e._mockArea === area)
  return base
    .slice()
    .sort((a, b) => b.composite - a.composite)
    .map((e, i) => ({ ...e, rank: i + 1 }))
}

export function useEngineerImpact({
  windowDays,
  area,
}: {
  windowDays: WindowDays
  area: AreaFilter
}): UseImpactResult {
  const [state, setState] = useState<UseImpactResult>(() => {
    const configured = isSupabaseConfigured()
    return {
      engineers: mockFor(area),
      loading: configured,
      isMock: !configured,
      error: null,
    }
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({
        engineers: mockFor(area),
        loading: false,
        isMock: true,
        error: null,
      })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    supabase
      .from('impact_views')
      .select('engineers')
      .eq('window_days', windowDays)
      .eq('area', area)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          // Fall back to mock so the UI never looks broken in demo.
          setState({
            engineers: mockFor(area),
            loading: false,
            isMock: true,
            error: error?.message ?? 'impact_views row not found',
          })
          return
        }
        const rows = ((data.engineers as EngineerImpact[]) ?? []).map(
          (e, i) => ({ ...e, rank: i + 1 }),
        )
        setState({
          engineers: rows,
          loading: false,
          isMock: false,
          error: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [windowDays, area])

  return state
}
