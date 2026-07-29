import type { MetricSeries } from '../../hooks/useSystemMetrics'
import { MiniSparkline } from './MiniSparkline'

interface SystemMonitorsProps {
  cpu: MetricSeries
  ram: MetricSeries
  gpu: MetricSeries
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function MetricChip({
  name,
  series,
  title
}: {
  name: string
  series: MetricSeries
  title?: string
}) {
  const tip =
    title ??
    [series.label ?? name, series.detail, series.current != null ? `${series.current.toFixed(1)}%` : null]
      .filter(Boolean)
      .join(' · ')

  return (
    <div
      className="flex items-center gap-1.5 rounded border border-surface-border bg-surface px-1.5 py-0.5"
      title={tip}
    >
      <span className="w-7 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {name}
      </span>
      <MiniSparkline values={series.history} />
      <span className="w-8 text-right font-mono text-[11px] tabular-nums text-ink">
        {formatPct(series.current)}
      </span>
    </div>
  )
}

export function SystemMonitors({ cpu, ram, gpu }: SystemMonitorsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <MetricChip name="CPU" series={cpu} />
      <MetricChip
        name="GPU"
        series={gpu}
        title={
          gpu.current == null
            ? 'GPU utilization unavailable (install NVIDIA drivers / nvidia-smi)'
            : [gpu.label, `${gpu.current.toFixed(1)}%`].filter(Boolean).join(' · ')
        }
      />
      <MetricChip
        name="RAM"
        series={ram}
        title={ram.detail ? `RAM ${ram.detail} (${formatPct(ram.current)})` : undefined}
      />
    </div>
  )
}
