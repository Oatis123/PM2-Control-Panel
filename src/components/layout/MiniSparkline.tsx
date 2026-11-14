import { memo } from 'react'

interface MiniSparklineProps {
  values: number[]
}

const WIDTH = 32
const HEIGHT = 14
const SAMPLES = 12

export const MiniSparkline = memo(function MiniSparkline({ values }: MiniSparklineProps) {
  const tail = values.slice(-SAMPLES)
  const step = (WIDTH - 2) / (SAMPLES - 1)
  const yFor = (value: number) =>
    HEIGHT - 1 - (Math.max(0, Math.min(value, 100)) / 100) * (HEIGHT - 2)
  const points = tail.map((value, index) => {
    const x = WIDTH - 1 - step * (tail.length - 1 - index)
    return `${x},${yFor(value)}`
  })

  return (
    <svg
      className="hidden shrink-0 text-moss xl:block"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
    >
      {tail.length === 1 && (
        <circle cx={WIDTH - 1} cy={yFor(tail[0])} r="1" fill="currentColor" />
      )}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
})
