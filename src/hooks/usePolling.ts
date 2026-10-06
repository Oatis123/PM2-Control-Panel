import { useEffect, useRef } from 'react'

/**
 * Calls `task` immediately and then every `intervalMs`.
 * - never overlaps: a slow task delays the next tick instead of piling up
 * - pauses while the window is hidden/minimized and catches up on show
 */
export function usePolling(task: () => Promise<void> | void, intervalMs: number, enabled = true): void {
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => {
    if (!enabled) return

    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = (): void => {
      if (stopped) return
      timer = setTimeout(() => void tick(), intervalMs)
    }

    const tick = async (): Promise<void> => {
      if (stopped || running) return
      if (document.hidden) {
        // visibilitychange restarts the loop
        timer = null
        return
      }
      running = true
      try {
        await taskRef.current()
      } catch {
        // transient errors must not stop the loop
      } finally {
        running = false
        schedule()
      }
    }

    const onVisibility = (): void => {
      if (document.hidden || running || stopped) return
      if (timer) clearTimeout(timer)
      void tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    void tick()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}
