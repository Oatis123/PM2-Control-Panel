import { memo } from 'react'

/** 9×9 pixel bitmaps from the oatis-style set; '#' = pixel, drawn in currentColor */
const ICONS = {
  note: ['#######..', '#.....##.', '#.###..##', '#.......#', '#.#####.#', '#.......#', '#.####..#', '#.......#', '#########'],
  search: ['..###....', '.#...#...', '#.....#..', '#.....#..', '#.....#..', '.#...#...', '..####...', '......##.', '.......##'],
  folder: ['.........', '###......', '#..####..', '#########', '#.......#', '#.......#', '#.......#', '#########', '.........'],
  plus: ['.........', '....#....', '....#....', '....#....', '.#######.', '....#....', '....#....', '....#....', '.........'],
  close: ['#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '..#...#..', '.#.....#.', '#.......#'],
  terminal: ['#########', '#.......#', '#.#.....#', '#..#....#', '#...#...#', '#..#....#', '#.#..##.#', '#.......#', '#########']
} as const

export type PixelIconName = keyof typeof ICONS

interface PixelIconProps {
  name: PixelIconName
  size?: number
  className?: string
}

function PixelIconImpl({ name, size = 9, className }: PixelIconProps) {
  const rects: JSX.Element[] = []
  ICONS[name].forEach((row, y) => {
    for (let x = 0; x < 9; x++) {
      if (row[x] === '#') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />)
    }
  })
  return (
    <svg
      className={className}
      viewBox="0 0 9 9"
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rects}
    </svg>
  )
}

export const PixelIcon = memo(PixelIconImpl)

/** Sleeping avatar for empty states: moss body, bg cut-outs */
const SLEEPING = [
  '................',
  '................',
  '....######......',
  '...########.....',
  '..##########....',
  '..##########....',
  '..#--##--###....',
  '..##########....',
  '..####--####....',
  '...########.....',
  '....######......',
  '................',
  '..##############',
  '..##############',
  '................',
  '................'
]

export const PixelSleeper = memo(function PixelSleeper({ size = 64 }: { size?: number }) {
  const rects: JSX.Element[] = []
  SLEEPING.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={ch === '#' ? 'var(--moss)' : 'var(--bg)'}
        />
      )
    }
  })
  return (
    <svg
      className="pixel"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rects}
    </svg>
  )
})
