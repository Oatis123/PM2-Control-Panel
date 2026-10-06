import { memo } from 'react'

interface MiniSparklineProps {
  values: number[]
  width?: number
  height?: number
  /** 0–100 scale max */
  max?: number
}

/**
 * Compact monochrome sparkline for header load monitors.
 */
function MiniSparklineImpl({ values, width = 56, height = 18, max = 100 }: MiniSparklineProps) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className="block shrink-0 opacity-40" aria-hidden>
        <line
          x1={0}
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="currentColor"
          strokeWidth="1"
          className="text-ink-faint"
        />
      </svg>
    )
  }

  const pad = 1
  const w = width - pad * 2
  const h = height - pad * 2
  const yFor = (v: number): number => pad + h - (Math.min(max, Math.max(0, v)) / max) * h

  const points = values.map(
    (v, i) => `${(pad + (i / (values.length - 1)) * w).toFixed(1)},${yFor(v).toFixed(1)}`
  )
  const lastY = yFor(values[values.length - 1] ?? 0)

  // Area path under the line
  const area = `${pad},${pad + h} ${points.join(' ')} ${pad + w},${pad + h}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0 text-ink"
      aria-hidden
    >
      <polygon points={area} fill="currentColor" opacity="0.12" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx={pad + w} cy={lastY} r="1.6" fill="currentColor" />
    </svg>
  )
}

export const MiniSparkline = memo(MiniSparklineImpl)
