import { useCallback, useState } from 'react'
import type { SystemMetrics } from '../../shared/types'
import { usePolling } from './usePolling'

const HISTORY = 60
const POLL_MS = 1000

export interface MetricSeries {
  current: number | null
  history: number[]
  label?: string | null
  detail?: string
}

export interface SystemMonitorState {
  cpu: MetricSeries
  ram: MetricSeries
  gpu: MetricSeries
  vram: MetricSeries
  ready: boolean
}

const emptySeries = (): MetricSeries => ({
  current: null,
  history: [],
  label: null
})

function pushHistory(prev: number[], value: number | null): number[] {
  if (value == null || !Number.isFinite(value)) return prev
  const next = prev.length >= HISTORY ? prev.slice(prev.length - HISTORY + 1) : prev.slice()
  next.push(value)
  return next
}

function formatVram(usedMb: number | null, totalMb: number | null): string | undefined {
  if (usedMb == null) return undefined
  const gb = (mb: number): string => (mb / 1024).toFixed(1)
  return totalMb != null ? `${gb(usedMb)}/${gb(totalMb)} GB` : `${gb(usedMb)} GB`
}

/**
 * Host load monitors. Call this from a leaf component (the header) only —
 * it re-renders every second and must not drag the rest of the app with it.
 */
export function useSystemMetrics(): SystemMonitorState {
  const [state, setState] = useState<SystemMonitorState>({
    cpu: emptySeries(),
    ram: emptySeries(),
    gpu: emptySeries(),
    vram: emptySeries(),
    ready: false
  })
  const tick = useCallback(async () => {
    const result = await window.api.system.getMetrics()
    if (!result.ok || !result.data) return
    const m: SystemMetrics = result.data

    setState((prev) => ({
      ready: true,
      cpu: {
        current: m.cpu,
        history: pushHistory(prev.cpu.history, m.cpu),
        label: 'CPU'
      },
      ram: {
        current: m.ram,
        history: pushHistory(prev.ram.history, m.ram),
        label: 'RAM',
        detail: `${m.ramUsedGb}/${m.ramTotalGb} GB`
      },
      gpu: {
        current: m.gpu,
        history: pushHistory(prev.gpu.history, m.gpu),
        label: m.gpuLabel ?? 'GPU'
      },
      vram: {
        current: m.vram,
        history: pushHistory(prev.vram.history, m.vram),
        label: m.gpuLabel ?? 'GPU',
        detail: formatVram(m.vramUsedMb, m.vramTotalMb)
      }
    }))
  }, [])

  usePolling(tick, POLL_MS)

  return state
}
