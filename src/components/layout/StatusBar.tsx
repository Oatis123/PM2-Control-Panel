import { memo } from 'react'
import type { EnvState } from '../../../shared/types'
import { SystemMonitors } from './SystemMonitors'

interface StatusBarProps {
  env: EnvState
  progress: string | null
}

function versionLabel(value: string | null, prefix: string): string {
  return `${prefix} ${value ?? '—'}`
}

function EnvStatus({ status }: { status: EnvState['status'] }) {
  switch (status) {
    case 'ready':
      return (
        <span>
          <span className="text-ochre">●</span> active
        </span>
      )
    case 'installing':
      return (
        <span>
          installing <span className="spin" />
        </span>
      )
    case 'checking':
      return (
        <span className="text-muted">
          checking <span className="spin" />
        </span>
      )
    case 'missing':
      return <span className="text-ochre">missing deps</span>
    default:
      return <span className="text-ochre">error</span>
  }
}

function StatusBarImpl({ env, progress }: StatusBarProps) {
  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-6">
        <span className="flex shrink-0 items-baseline gap-2.5">
          <span className="px text-[14px]">pm2</span>
          <span className="meta hidden md:inline">control panel</span>
        </span>
        <SystemMonitors />
        {progress && <span className="meta hidden truncate xl:inline">{progress}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-4 text-muted">
        <span className="hidden xl:inline">{versionLabel(env.versions.pm2, 'pm2')}</span>
        <span className="hidden 2xl:inline">{versionLabel(env.versions.node, 'node')}</span>
        <span className="text-text">
          <EnvStatus status={env.status} />
        </span>
      </div>
    </header>
  )
}

export const StatusBar = memo(StatusBarImpl)
