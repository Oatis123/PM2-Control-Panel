import type { EnvState } from '../../../shared/types'
import type { SystemMonitorState } from '../../hooks/useSystemMetrics'
import { SystemMonitors } from './SystemMonitors'

interface StatusBarProps {
  env: EnvState
  progress: string | null
  metrics: SystemMonitorState
}

function versionLabel(value: string | null, prefix: string): string {
  if (!value) return `${prefix}: —`
  return `${prefix}: ${value}`
}

export function StatusBar({ env, progress, metrics }: StatusBarProps) {
  const statusLabel =
    env.status === 'ready'
      ? 'Active'
      : env.status === 'installing'
        ? 'Installing'
        : env.status === 'checking'
          ? 'Checking'
          : env.status === 'missing'
            ? 'Missing deps'
            : 'Error'

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-sm font-semibold tracking-wide text-ink">
          PM2 Control Panel
        </span>
        <SystemMonitors cpu={metrics.cpu} ram={metrics.ram} gpu={metrics.gpu} />
        {progress && (
          <span className="hidden truncate text-xs text-ink-muted lg:inline">{progress}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-ink-muted sm:gap-3 sm:text-xs">
        <span className="hidden sm:inline">{versionLabel(env.versions.pm2, 'PM2')}</span>
        <span className="hidden text-surface-border sm:inline">|</span>
        <span className="hidden md:inline">{versionLabel(env.versions.node, 'Node')}</span>
        <span className="hidden text-surface-border md:inline">|</span>
        <span>
          Status:{' '}
          <span className={env.status === 'ready' ? 'text-ink' : 'text-ink-muted'}>
            {statusLabel}
          </span>
        </span>
      </div>
    </header>
  )
}
