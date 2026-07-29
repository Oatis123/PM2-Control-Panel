import { useCallback, useEffect, useRef, useState } from 'react'

interface SplitterProps {
  /** Controlled height of the bottom panel in px */
  bottomHeight: number
  onBottomHeightChange: (height: number) => void
  minBottom?: number
  maxBottom?: number
  children: [React.ReactNode, React.ReactNode]
}

export function Splitter({
  bottomHeight,
  onBottomHeightChange,
  minBottom = 120,
  maxBottom = 480,
  children
}: SplitterProps) {
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const fromBottom = rect.bottom - e.clientY
      const clamped = Math.min(maxBottom, Math.max(minBottom, fromBottom))
      onBottomHeightChange(clamped)
    },
    [maxBottom, minBottom, onBottomHeightChange]
  )

  const stopDrag = useCallback(() => {
    dragging.current = false
    setIsDragging(false)
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDrag)
    }
  }, [onPointerMove, stopDrag])

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{children[0]}</div>
      <div
        role="separator"
        aria-orientation="horizontal"
        className={`group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-surface-raised hover:bg-surface-border ${
          isDragging ? 'bg-surface-border' : ''
        }`}
        onPointerDown={(e) => {
          e.preventDefault()
          dragging.current = true
          setIsDragging(true)
        }}
      >
        <div className="h-0.5 w-10 rounded bg-ink-faint group-hover:bg-ink-muted" />
      </div>
      <div className="shrink-0 overflow-hidden" style={{ height: bottomHeight }}>
        {children[1]}
      </div>
    </div>
  )
}
