import { useEffect, useRef, useState } from 'react'
import type { SystemMetrics } from '../../shared/types'

const HISTORY = 36
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
  ready: boolean
}

const emptySeries = (): MetricSeries => ({
  current: null,
  history: [],
  label: null
})

function pushHistory(prev: number[], value: number | null): number[] {
  if (value == null || !Number.isFinite(value)) return prev
  const next = [...prev, value]
  if (next.length > HISTORY) next.splice(0, next.length - HISTORY)
  return next
}

export function useSystemMetrics(): SystemMonitorState {
  const [state, setState] = useState<SystemMonitorState>({
    cpu: emptySeries(),
    ram: emptySeries(),
    gpu: emptySeries(),
    ready: false
  })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    let timer: ReturnType<typeof setInterval> | null = null

    async function tick() {
      try {
        const result = await window.api.system.getMetrics()
        if (!mounted.current || !result.ok || !result.data) return
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
          }
        }))
      } catch {
        // ignore transient errors
      }
    }

    void tick()
    timer = setInterval(() => {
      void tick()
    }, POLL_MS)

    return () => {
      mounted.current = false
      if (timer) clearInterval(timer)
    }
  }, [])

  return state
}
