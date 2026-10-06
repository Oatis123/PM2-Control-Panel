import { useEffect, useRef, useState } from 'react'
import { useSystemMetrics, type MetricSeries } from '../../hooks/useSystemMetrics'
import { MetricChart } from './MetricChart'
import { MiniSparkline } from './MiniSparkline'

const CHART_CAPACITY = 60

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function MetricChip({ name, series }: { name: string; series: MetricSeries }) {
  const unavailable = series.current == null
  return (
    <div
      className={`flex items-center gap-1.5 rounded border border-surface-border bg-surface px-1.5 py-0.5 ${
        unavailable ? 'opacity-60' : ''
      }`}
    >
      <span className="w-8 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {name}
      </span>
      <MiniSparkline values={series.history} />
      <span className="w-8 text-right font-mono text-[11px] tabular-nums text-ink">
        {formatPct(series.current)}
      </span>
    </div>
  )
}

function stats(values: number[]): { avg: number; max: number } | null {
  if (values.length === 0) return null
  let sum = 0
  let max = 0
  for (const v of values) {
    sum += v
    if (v > max) max = v
  }
  return { avg: sum / values.length, max }
}

function DetailCard({
  title,
  subtitle,
  series,
  unavailableHint
}: {
  title: string
  subtitle?: string | null
  series: MetricSeries
  unavailableHint?: string
}) {
  const s = stats(series.history)
  return (
    <div className="rounded border border-surface-border bg-surface p-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{title}</span>
        <span className="truncate text-[10px] text-ink-muted" title={subtitle ?? undefined}>
          {subtitle}
        </span>
      </div>
      {series.current == null ? (
        <p className="py-4 text-center text-[11px] text-ink-muted">
          {unavailableHint ?? 'Unavailable'}
        </p>
      ) : (
        <>
          <MetricChart values={series.history} capacity={CHART_CAPACITY} />
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-ink-muted">
            <span>now {series.current.toFixed(0)}%</span>
            <span>avg {s ? s.avg.toFixed(0) : '—'}%</span>
            <span>max {s ? s.max.toFixed(0) : '—'}%</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Header load monitors (CPU / RAM / GPU / VRAM). Owns the metrics polling so the
 * per-second updates only re-render this subtree. Click to open larger charts.
 */
export function SystemMonitors() {
  const { cpu, ram, gpu, vram } = useSystemMetrics()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const gpuName = gpu.label && gpu.label !== 'GPU' ? gpu.label : null
  const tip = [
    `CPU ${formatPct(cpu.current)}`,
    `RAM ${formatPct(ram.current)}${ram.detail ? ` (${ram.detail})` : ''}`,
    `GPU ${formatPct(gpu.current)}${gpuName ? ` · ${gpuName}` : ''}`,
    `VRAM ${formatPct(vram.current)}${vram.detail ? ` (${vram.detail})` : ''}`
  ].join('\n')

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded p-0.5 transition-colors hover:bg-surface-panel ${
          open ? 'bg-surface-panel' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
        title={`${tip}\n\nClick for detailed charts`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <MetricChip name="CPU" series={cpu} />
        <MetricChip name="RAM" series={ram} />
        <MetricChip name="GPU" series={gpu} />
        <MetricChip name="VRAM" series={vram} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="System monitors"
          className="panel absolute left-0 top-full z-30 mt-1.5 grid w-[500px] grid-cols-2 gap-2 rounded-lg p-2 shadow-xl shadow-black/50"
        >
          <DetailCard title="CPU" series={cpu} />
          <DetailCard title="RAM" subtitle={ram.detail} series={ram} />
          <DetailCard
            title="GPU"
            subtitle={gpuName}
            series={gpu}
            unavailableHint="GPU utilization unavailable (install NVIDIA drivers / nvidia-smi)"
          />
          <DetailCard
            title="VRAM"
            subtitle={vram.detail}
            series={vram}
            unavailableHint="Video memory usage unavailable"
          />
          <p className="col-span-2 text-center text-[10px] text-ink-faint">
            Last {CHART_CAPACITY}s · updates every second
          </p>
        </div>
      )}
    </div>
  )
}
