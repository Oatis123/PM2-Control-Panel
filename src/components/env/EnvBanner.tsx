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
    <div className="flex shrink-0 items-center justify-between gap-4 rounded-md bg-ochre-wash px-4 py-3">
      <div className="min-w-0">
        <p className={`font-serif text-[14px] leading-snug ${isError ? 'text-ochre' : ''}`}>
          {installing
            ? 'Installing the missing components.'
            : isError
              ? 'The environment setup failed.'
              : 'Node.js, npm or PM2 is not fully available.'}
          {installing && <span className="spin ml-2" />}
        </p>
        <p className="meta mt-0.5 truncate">
          {progress ??
            env.message ??
            (missingList ? `missing: ${missingList}` : 'some features may be unavailable')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {onRetry && (
          <button type="button" className="btn btn-ghost" onClick={onRetry} disabled={installing}>
            Recheck
          </button>
        )}
        {!installing && (env.status === 'missing' || env.status === 'error') && (
          <button type="button" className="btn" onClick={onInstall}>
            {isError ? 'Retry install' : 'Check and install'}
          </button>
        )}
      </div>
    </div>
  )
}
