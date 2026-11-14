import { memo, type CSSProperties } from 'react'
import type { EnvState } from '../../../shared/types'
import { SystemMonitors } from './SystemMonitors'

const THEMES = ['dark', 'light', 'cyber'] as const
export type Theme = (typeof THEMES)[number]

interface StatusBarProps {
  env: EnvState
  progress: string | null
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

function versionLabel(value: string | null, prefix: string): string {
  return `${prefix} ${value ?? '—'}`
}

function EnvStatus({ status }: { status: EnvState['status'] }) {
  switch (status) {
    case 'ready':
      return (
        <span className="inline-flex items-center gap-2">
          <span className="status-dot text-ochre" aria-hidden="true" /> PM2 active
        </span>
      )
    case 'installing':
      return (
        <span>
          Installing <span className="spin" />
        </span>
      )
    case 'checking':
      return (
        <span className="text-muted">
          Checking <span className="spin" />
        </span>
      )
    case 'missing':
      return <span className="text-ochre">Missing dependencies</span>
    default:
      return <span className="text-ochre">Setup error</span>
  }
}

function StatusBarImpl({ env, progress, theme, onThemeChange }: StatusBarProps) {
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        <span className="flex shrink-0 items-baseline gap-2.5">
          <span className="px text-[20px]">pm2</span>
          <span className="meta hidden xl:inline">Control Panel</span>
        </span>
        <SystemMonitors />
        {progress && <span className="meta hidden truncate 2xl:inline">{progress}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-muted">
        <span className="hidden 2xl:inline">{versionLabel(env.versions.pm2, 'pm2')}</span>
        <span className="hidden 2xl:inline">{versionLabel(env.versions.node, 'node')}</span>
        <span className="whitespace-nowrap text-[13px] text-text">
          <EnvStatus status={env.status} />
        </span>
        <div
          role="group"
          aria-label="Color theme"
          className="segmented"
          style={{ '--segments': THEMES.length, '--selected': THEMES.indexOf(theme) } as CSSProperties}
        >
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              className="tab capitalize"
              aria-pressed={theme === option}
              onClick={() => onThemeChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

export const StatusBar = memo(StatusBarImpl)
