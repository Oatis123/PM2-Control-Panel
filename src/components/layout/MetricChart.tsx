import { memo } from 'react'

interface MetricChartProps {
  values: number[]
  /** Total samples in the window, so a short history hugs the right edge */
  capacity: number
  width?: number
  height?: number
}

function MetricChartImpl({ values, capacity, width = 232, height = 56 }: MetricChartProps) {
  const pad = 4
  const end = width - pad
  const baseline = height - pad
  const step = (end - pad) / Math.max(1, capacity - 1)
  const points = values.map((value, index) => {
    const x = end - step * (values.length - 1 - index)
    const y = baseline - (Math.min(100, Math.max(0, value)) / 100) * (baseline - pad)
    return { x, y }
  })
  const coordinates = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const first = points[0]
  const last = points.at(-1)
  const peak = points.reduce<(typeof points)[number] | undefined>(
    (highest, point) => (!highest || point.y < highest.y) ? point : highest,
    undefined
  )

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block max-w-full"
      aria-hidden="true"
    >
      <path d={`M ${pad} ${pad} V ${baseline} H ${end}`} fill="none" stroke="var(--dim)" />

      {first && last && (
        <>
          <polygon
            points={`${first.x},${baseline} ${coordinates} ${end},${baseline}`}
            fill="var(--raised)"
          />
          <polyline
            points={coordinates}
            fill="none"
            stroke="var(--moss)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {peak && peak !== last && peak.y < baseline && (
            <circle cx={peak.x} cy={peak.y} r="2.5" fill="var(--ochre)" />
          )}
          <circle cx={last.x} cy={last.y} r="2.5" fill="var(--moss)" />
        </>
      )}
    </svg>
  )
}

export const MetricChart = memo(MetricChartImpl)
