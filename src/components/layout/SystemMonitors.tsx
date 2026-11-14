import { useEffect, useRef, useState } from 'react'
import { useSystemMetrics, type MetricSeries } from '../../hooks/useSystemMetrics'
import { Icon } from '../Icon'
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
      <span className="text-xs font-semibold text-muted">{name}</span>
      <MiniSparkline values={series.history} />
      <span className={`w-[4ch] text-right font-code text-xs ${hot ? 'text-ochre' : ''}`}>
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
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="meta truncate" title={subtitle ?? undefined}>
          {subtitle}
        </span>
      </div>
      {series.current == null ? (
        <p className="font-serif py-4 text-[13px] leading-snug text-muted">
          {unavailableHint ?? 'Unavailable.'}
        </p>
      ) : (
        <>
          <MetricChart values={series.history} capacity={CHART_CAPACITY} />
          <div className="meta mt-1.5 flex justify-between">
            <span>
              Now <span className="font-code text-moss">{series.current.toFixed(0)}%</span>
            </span>
            <span>Avg <span className="font-code">{s ? `${s.avg.toFixed(0)}%` : '—'}</span></span>
            <span>Peak <span className="font-code text-ochre">{s ? `${s.max.toFixed(0)}%` : '—'}</span></span>
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
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
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
        ref={triggerRef}
        type="button"
        className={`btn btn-ghost btn-sm gap-3 lg:gap-4 ${open ? 'bg-moss-wash' : 'bg-surface'}`}
        aria-label="System monitors"
        onClick={() => setOpen((v) => !v)}
        title={`${tip}\n\nClick for detailed charts`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <MetricChip name="CPU" series={cpu} />
        <MetricChip name="RAM" series={ram} />
        <MetricChip name="GPU" series={gpu} />
        <MetricChip name="VRAM" series={vram} />
        <Icon name="chevron-down" size={14} className={open ? 'rotate-180 text-moss' : 'text-muted'} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="System monitors"
          className="glass monitor-popover absolute left-0 top-full z-30 mt-2 grid w-[520px] grid-cols-2 gap-x-6 gap-y-5 p-4"
        >
          <DetailCard title="CPU" series={cpu} />
          <DetailCard title="RAM" subtitle={ram.detail} series={ram} />
          <DetailCard
            title="GPU"
            subtitle={gpuName}
            series={gpu}
            unavailableHint="GPU utilization is unavailable. Install the NVIDIA drivers (nvidia-smi)."
          />
          <DetailCard
            title="VRAM"
            subtitle={vram.detail}
            series={vram}
            unavailableHint="Video memory usage is unavailable."
          />
          <p className="meta col-span-2">Last {CHART_CAPACITY}s · updates every second</p>
        </div>
      )}
    </div>
  )
}
