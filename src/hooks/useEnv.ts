import { useCallback, useEffect, useState } from 'react'
import type { EnvState } from '../../shared/types'

const idle: EnvState = {
  status: 'checking',
  versions: { node: null, npm: null, pm2: null },
  message: 'Checking environment...'
}

export function useEnv() {
  const [env, setEnv] = useState<EnvState>(idle)
  const [progress, setProgress] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setEnv((prev) => ({ ...prev, status: 'checking', message: 'Checking environment...' }))
    const result = await window.api.env.check()
    if (result.ok && result.data) {
      setEnv(result.data)
    } else {
      setEnv({
        status: 'error',
        versions: { node: null, npm: null, pm2: null },
        message: result.error ?? 'Environment check failed'
      })
    }
  }, [])

  const checkAndInstall = useCallback(async () => {
    setEnv((prev) => ({ ...prev, status: 'installing', message: 'Installing components...' }))
    const result = await window.api.env.checkAndInstall()
    if (result.ok && result.data) {
      setEnv(result.data)
    } else {
      setEnv({
        status: 'error',
        versions: { node: null, npm: null, pm2: null },
        message: result.error ?? 'Install failed'
      })
    }
    setProgress(null)
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.api.env.onProgress((event) => {
      setProgress(event.message)
    })
    return unsub
  }, [refresh])

  return { env, progress, refresh, checkAndInstall }
}
