import { useCallback, useEffect, useState } from 'react'
import type { ProcessMetrics } from '../../shared/types'

const POLL_MS = 2000

export function usePm2Processes(enabled: boolean) {
  const [processes, setProcesses] = useState<ProcessMetrics[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    const result = await window.api.pm2.jlist()
    if (result.ok && result.data) {
      setProcesses(result.data)
      setError(null)
    } else {
      setError(result.error ?? 'Failed to fetch PM2 list')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setProcesses([])
      return
    }

    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, POLL_MS)

    return () => clearInterval(timer)
  }, [enabled, refresh])

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(true)
      try {
        const result = await action()
        if (!result.ok) {
          setError(result.error ?? 'Action failed')
        } else {
          setError(null)
        }
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const startConfig = useCallback(
    (filePath: string) => runAction(() => window.api.pm2.startConfig(filePath)),
    [runAction]
  )

  const stopAll = useCallback(
    (names: string[]) => runAction(() => window.api.pm2.stopAll(names)),
    [runAction]
  )

  const restartAll = useCallback(
    (names: string[]) => runAction(() => window.api.pm2.restartAll(names)),
    [runAction]
  )

  const startApp = useCallback(
    (name: string, configPath?: string) =>
      runAction(() => window.api.pm2.startApp(name, configPath)),
    [runAction]
  )

  const stopApp = useCallback(
    (name: string) => runAction(() => window.api.pm2.stopApp(name)),
    [runAction]
  )

  const restartApp = useCallback(
    (name: string) => runAction(() => window.api.pm2.restartApp(name)),
    [runAction]
  )

  const deleteApp = useCallback(
    (name: string) => runAction(() => window.api.pm2.deleteApp(name)),
    [runAction]
  )

  return {
    processes,
    error,
    busy,
    refresh,
    startConfig,
    stopAll,
    restartAll,
    startApp,
    stopApp,
    restartApp,
    deleteApp
  }
}
