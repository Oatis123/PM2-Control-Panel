import { memo, useId } from 'react'

interface MetricChartProps {
  values: number[]
  /** Total samples the chart window holds, so a short history hugs the right edge */
  capacity: number
  width?: number
  height?: number
}

/**
 * Larger area chart (0–100 %) used in the monitors popover.
 * History = muted checker dither under a text-colored line, now = solid moss,
 * the peak = hollow ochre square. Axes in dim, no gridlines.
 */
function MetricChartImpl({ values, capacity, width = 232, height = 56 }: MetricChartProps) {
  const patternId = useId()
  const pad = 3
  const w = width - pad * 2
  const h = height - pad * 2
  const yFor = (v: number): number => pad + h - (Math.min(100, Math.max(0, v)) / 100) * h
  const step = capacity > 1 ? w / (capacity - 1) : w
  const x0 = pad + w - step * (values.length - 1)

  const points = values.map((v, i) => `${(x0 + i * step).toFixed(1)},${yFor(v).toFixed(1)}`)

  let peakIdx = -1
  let peak = 0
  values.forEach((v, i) => {
    if (v > peak) {
      peak = v
      peakIdx = i
    }
  })
  const lastIdx = values.length - 1
  const showPeak = peakIdx >= 0 && peakIdx !== lastIdx && peak > 0

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <defs>
        <pattern id={patternId} width="2" height="2" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1" height="1" style={{ fill: 'var(--muted)' }} />
          <rect x="1" y="1" width="1" height="1" style={{ fill: 'var(--muted)' }} />
        </pattern>
      </defs>

      {/* axes */}
      <line x1={pad} x2={pad + w} y1={pad + h} y2={pad + h} style={{ stroke: 'var(--dim)' }} />
      <line x1={pad} x2={pad} y1={pad} y2={pad + h} style={{ stroke: 'var(--dim)' }} />

      {values.length >= 2 && (
        <>
          <polygon
            points={`${x0.toFixed(1)},${pad + h} ${points.join(' ')} ${pad + w},${pad + h}`}
            fill={`url(#${patternId})`}
            opacity="0.55"
          />
          <polyline
            points={points.join(' ')}
            fill="none"
            strokeWidth="1"
            style={{ stroke: 'var(--text)' }}
          />
          {showPeak && (
            <rect
              x={x0 + peakIdx * step - 2.5}
              y={yFor(peak) - 2.5}
              width="5"
              height="5"
              fill="var(--bg)"
              strokeWidth="1"
              style={{ stroke: 'var(--ochre)' }}
            />
          )}
          <rect
            x={pad + w - 2}
            y={yFor(values[lastIdx] ?? 0) - 2}
            width="4"
            height="4"
            style={{ fill: 'var(--moss)' }}
          />
        </>
      )}
    </svg>
  )
}

export const MetricChart = memo(MetricChartImpl)
