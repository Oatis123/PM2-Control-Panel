import type { EnvState } from '../../../shared/types'

interface EnvBannerProps {
  env: EnvState
  progress: string | null
  onInstall: () => void
  onRetry?: () => void
}

export function EnvBanner({ env, progress, onInstall, onRetry }: EnvBannerProps) {
  if (env.status === 'ready' || env.status === 'checking') {
    return null
  }

  const installing = env.status === 'installing'
  const isError = env.status === 'error'
  const missingList = env.missing?.length ? env.missing.join(', ') : null

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-panel px-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {installing
            ? 'Installing missing components...'
            : isError
              ? 'Environment setup failed'
              : 'Node.js, npm or PM2 not fully available'}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {progress ??
            env.message ??
            (missingList ? `Missing: ${missingList}` : 'Some features may be unavailable')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry} disabled={installing}>
            Re-check
          </button>
        )}
        {!installing && (env.status === 'missing' || env.status === 'error') && (
          <button type="button" className="btn btn-primary" onClick={onInstall}>
            {isError ? 'Retry Install' : 'Check / Install'}
          </button>
        )}
      </div>
    </div>
  )
}
