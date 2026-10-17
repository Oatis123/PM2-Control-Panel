import { useEffect, useRef, useState } from 'react'
import { useSystemMetrics, type MetricSeries } from '../../hooks/useSystemMetrics'
import { MetricChart } from './MetricChart'
import { MiniSparkline } from './MiniSparkline'

const CHART_CAPACITY = 60
/** Load at or above this reads as "look at this" */
const HOT = 90

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function MetricChip({ name, series }: { name: string; series: MetricSeries }) {
  const unavailable = series.current == null
  const hot = series.current != null && series.current >= HOT
  return (
    <span className={`flex items-center gap-2 ${unavailable ? 'text-dim' : ''}`}>
      <span className="w-[4ch] text-left text-muted">{name}</span>
      <MiniSparkline values={series.history} />
      <span className={`w-[4ch] text-right ${hot ? 'text-ochre' : ''}`}>
        {formatPct(series.current)}
      </span>
    </span>
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
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span>{title}</span>
        <span className="meta truncate" title={subtitle ?? undefined}>
          {subtitle}
        </span>
      </div>
      {series.current == null ? (
        <p className="serif py-4 text-[13px] leading-snug text-muted">
          {unavailableHint ?? 'Unavailable.'}
        </p>
      ) : (
        <>
          <MetricChart values={series.history} capacity={CHART_CAPACITY} />
          <div className="meta mt-1.5 flex justify-between">
            <span>
              now <span className="text-moss">{series.current.toFixed(0)}%</span>
            </span>
            <span>avg {s ? s.avg.toFixed(0) : '—'}%</span>
            <span>peak {s ? s.max.toFixed(0) : '—'}%</span>
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
        className={`flex items-center gap-5 py-1 hover:text-text ${
          open ? 'shadow-[inset_0_-1px_0_var(--moss)]' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
        title={`${tip}\n\nClick for detailed charts`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <MetricChip name="cpu" series={cpu} />
        <MetricChip name="ram" series={ram} />
        <MetricChip name="gpu" series={gpu} />
        <MetricChip name="vram" series={vram} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="System monitors"
          className="absolute left-0 top-full z-30 mt-2 grid w-[520px] grid-cols-2 gap-x-6 gap-y-5 border border-dim bg-surface p-4"
        >
          <DetailCard title="cpu" series={cpu} />
          <DetailCard title="ram" subtitle={ram.detail} series={ram} />
          <DetailCard
            title="gpu"
            subtitle={gpuName}
            series={gpu}
            unavailableHint="GPU utilization is unavailable. Install the NVIDIA drivers (nvidia-smi)."
          />
          <DetailCard
            title="vram"
            subtitle={vram.detail}
            series={vram}
            unavailableHint="Video memory usage is unavailable."
          />
          <p className="meta col-span-2 text-dim">last {CHART_CAPACITY}s · updates every second</p>
        </div>
      )}
    </div>
  )
}
