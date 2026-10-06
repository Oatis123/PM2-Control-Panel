import { memo } from 'react'
import type { EnvState } from '../../../shared/types'
import { SystemMonitors } from './SystemMonitors'

interface StatusBarProps {
  env: EnvState
  progress: string | null
}

function versionLabel(value: string | null, prefix: string): string {
  if (!value) return `${prefix}: —`
  return `${prefix}: ${value}`
}

function StatusBarImpl({ env, progress }: StatusBarProps) {
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
    <header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-sm font-semibold tracking-wide text-ink">
          PM2 Control Panel
        </span>
        <SystemMonitors />
        {progress && (
          <span className="hidden truncate text-xs text-ink-muted xl:inline">{progress}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-ink-muted sm:gap-3 sm:text-xs">
        <span className="hidden lg:inline">{versionLabel(env.versions.pm2, 'PM2')}</span>
        <span className="hidden text-surface-border lg:inline">|</span>
        <span className="hidden xl:inline">{versionLabel(env.versions.node, 'Node')}</span>
        <span className="hidden text-surface-border xl:inline">|</span>
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

export const StatusBar = memo(StatusBarImpl)
