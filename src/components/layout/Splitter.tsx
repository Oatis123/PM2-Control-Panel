import { useCallback, useEffect, useRef, useState } from 'react'

interface SplitterProps {
  /** Controlled height of the bottom panel in px */
  bottomHeight: number
  onBottomHeightChange: (height: number) => void
  minBottom?: number
  maxBottom?: number
  minTop?: number
  children: [React.ReactNode, React.ReactNode]
}

export function Splitter({
  bottomHeight,
  onBottomHeightChange,
  minBottom = 148,
  /** Upper bound in px; the top pane always keeps at least `minTop` */
  maxBottom = 640,
  minTop = 160,
  children
}: SplitterProps) {
  const dragging = useRef(false)
  const frame = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const fromBottom = rect.bottom - e.clientY
      const upper = Math.max(minBottom, Math.min(maxBottom, rect.height - minTop - 16))
      const clamped = Math.round(Math.min(upper, Math.max(minBottom, fromBottom)))

      // One layout per frame, however fast the pointer moves
      if (frame.current != null) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        onBottomHeightChange(clamped)
      })
    },
    [maxBottom, minBottom, minTop, onBottomHeightChange]
  )

  const stopDrag = useCallback(() => {
    dragging.current = false
    setIsDragging(false)
  }, [])

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current)
    },
    []
  )

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [onPointerMove, stopDrag])

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="panel min-h-0 flex-1 overflow-hidden">{children[0]}</div>
      <div
        role="separator"
        aria-orientation="horizontal"
        className={`grip-wrap flex h-4 shrink-0 cursor-row-resize items-center justify-center ${
          isDragging ? 'active' : ''
        }`}
        onPointerDown={(e) => {
          e.preventDefault()
          dragging.current = true
          setIsDragging(true)
        }}
      >
        <div className="grip" />
      </div>
      <div className="panel min-h-0 shrink-0 overflow-hidden"
        style={{ height: bottomHeight, maxHeight: `calc(100% - ${minTop + 16}px)` }}>
        {children[1]}
      </div>
    </div>
  )
}
