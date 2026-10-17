import { memo } from 'react'

interface MiniSparklineProps {
  values: number[]
  /** Number of block cells to draw (latest samples win) */
  cells?: number
  /** 0–100 scale max */
  max?: number
}

const BLOCKS = '▁▂▃▄▅▆▇█'

/**
 * Compact block-character sparkline for the header load monitors.
 * Missing history is drawn as dim floor blocks so the width never jumps.
 */
function MiniSparklineImpl({ values, cells = 12, max = 100 }: MiniSparklineProps) {
  const tail = values.slice(-cells)
  const pad = cells - tail.length
  const bars = tail
    .map((v) => {
      const ratio = Math.min(max, Math.max(0, v)) / max
      return BLOCKS[Math.min(BLOCKS.length - 1, Math.round(ratio * (BLOCKS.length - 1)))]
    })
    .join('')

  return (
    <span className="blocks shrink-0 whitespace-pre text-[11px] leading-none" aria-hidden>
      <span className="text-dim">{BLOCKS[0].repeat(pad)}</span>
      {bars}
    </span>
  )
}

export const MiniSparkline = memo(MiniSparklineImpl)
