import { memo } from 'react'

interface MetricChartProps {
  values: number[]
  /** Total samples the chart window holds, so a short history hugs the right edge */
  capacity: number
  width?: number
  height?: number
}

/**
 * Larger monochrome area chart (0–100 %) used in the monitors popover.
 */
function MetricChartImpl({ values, capacity, width = 232, height = 56 }: MetricChartProps) {
  const pad = 1
  const w = width - pad * 2
  const h = height - pad * 2
  const yFor = (v: number): number => pad + h - (Math.min(100, Math.max(0, v)) / 100) * h
  const step = capacity > 1 ? w / (capacity - 1) : w
  const x0 = pad + w - step * (values.length - 1)

  const points = values.map((v, i) => `${(x0 + i * step).toFixed(1)},${yFor(v).toFixed(1)}`)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block text-ink"
      aria-hidden
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <line
          key={tick}
          x1={pad}
          x2={pad + w}
          y1={yFor(tick)}
          y2={yFor(tick)}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray={tick === 0 || tick === 100 ? undefined : '2 3'}
          opacity={tick === 0 || tick === 100 ? 0.25 : 0.12}
        />
      ))}
      {values.length >= 2 && (
        <>
          <polygon
            points={`${x0.toFixed(1)},${pad + h} ${points.join(' ')} ${pad + w},${pad + h}`}
            fill="currentColor"
            opacity="0.14"
          />
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

export const MetricChart = memo(MetricChartImpl)
