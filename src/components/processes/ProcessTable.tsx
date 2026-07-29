import {
  FolderOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2
} from 'lucide-react'
import type { EcosystemApp, ProcessMetrics, ProcessStatus } from '../../../shared/types'
import { formatCpu, formatMemory, formatUptime } from '../../lib/format'
import { StatusDot } from '../StatusDot'

interface ProcessTableProps {
  apps: EcosystemApp[]
  processes: ProcessMetrics[]
  filePath: string | null
  busy: boolean
  selectedApp: string | null
  onSelectApp: (name: string) => void
  onStartAll: () => void
  onStopAll: () => void
  onRestartAll: () => void
  onStart: (name: string) => void
  onStop: (name: string) => void
  onRestart: (name: string) => void
  onDelete: (name: string) => void
  onOpenConfig: () => void
  onReloadConfig?: () => void
  reloading?: boolean
  emptyHint?: string
  error?: string | null
}

function mergeRows(
  apps: EcosystemApp[],
  processes: ProcessMetrics[]
): Array<{
  name: string
  script?: string
  status: ProcessStatus
  cpu: number
  memoryMb: number
  uptimeMs: number | null
  restarts: number
  inPm2: boolean
}> {
  const byName = new Map(processes.map((p) => [p.name, p]))
  const names = new Set<string>()

  const rows = apps.map((app) => {
    names.add(app.name)
    const runtime = byName.get(app.name)
    return {
      name: app.name,
      script: typeof app.script === 'string' ? app.script : undefined,
      status: runtime?.status ?? 'stopped',
      cpu: runtime?.cpu ?? 0,
      memoryMb: runtime?.memoryMb ?? 0,
      uptimeMs: runtime?.uptimeMs ?? null,
      restarts: runtime?.restarts ?? 0,
      inPm2: Boolean(runtime)
    }
  })

  // Optionally show PM2 processes not in config? Spec says list apps from config — keep config-only.
  return rows
}

export function ProcessTable({
  apps,
  processes,
  filePath,
  busy,
  selectedApp,
  onSelectApp,
  onStartAll,
  onStopAll,
  onRestartAll,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onOpenConfig,
  onReloadConfig,
  reloading = false,
  emptyHint,
  error
}: ProcessTableProps) {
  if (!filePath) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
      >
        <div className="panel flex max-w-md flex-col items-center gap-3 rounded-lg p-8">
          <FolderOpen className="h-10 w-10 text-ink-muted" />
          <p className="text-sm text-ink">Open a PM2 ecosystem config</p>
          <p className="text-xs text-ink-muted">
            {emptyHint ?? 'Click «Open Config» or drag & drop a .js file here'}
          </p>
          <button type="button" className="btn btn-primary mt-2" onClick={onOpenConfig}>
            Open Config
          </button>
        </div>
      </div>
    )
  }

  const rows = mergeRows(apps, processes)
  const names = apps.map((a) => a.name)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-surface-border px-3 py-2">
        <button
          type="button"
          className="btn"
          disabled={busy || !filePath}
          onClick={onStartAll}
          title="Start All"
        >
          <Play className="h-3.5 w-3.5" />
          Start All
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || names.length === 0}
          onClick={onStopAll}
          title="Stop All"
        >
          <Square className="h-3.5 w-3.5" />
          Stop All
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || names.length === 0}
          onClick={onRestartAll}
          title="Restart All"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Restart All
        </button>
        {onReloadConfig && (
          <button
            type="button"
            className="btn"
            disabled={busy || reloading || !filePath}
            onClick={onReloadConfig}
            title="Reload config from disk"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${reloading ? 'animate-spin' : ''}`} />
            Reload
          </button>
        )}
        {error && (
          <span className="ml-auto truncate text-xs text-ink-muted" title={error}>
            {error}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-raised text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Script</th>
              <th className="px-3 py-2 font-medium">CPU</th>
              <th className="px-3 py-2 font-medium">RAM</th>
              <th className="px-3 py-2 font-medium">Uptime</th>
              <th className="px-3 py-2 font-medium">Restarts</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-muted">
                  No apps in this config
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = selectedApp === row.name
                return (
                  <tr
                    key={row.name}
                    className={`cursor-pointer border-t border-surface-border transition-colors ${
                      selected ? 'bg-surface-panel' : 'hover:bg-surface-raised'
                    }`}
                    onClick={() => onSelectApp(row.name)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusDot status={row.status} />
                        <span className="text-xs capitalize text-ink-muted">{row.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{row.name}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-ink-muted">
                      {row.script ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatCpu(row.cpu)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatMemory(row.memoryMb)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatUptime(row.uptimeMs)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.restarts}</td>
                    <td className="px-3 py-2">
                      <div
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn-icon"
                          disabled={busy || row.status === 'online'}
                          onClick={() => onStart(row.name)}
                          title="Start"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          disabled={busy || row.status === 'stopped'}
                          onClick={() => onStop(row.name)}
                          title="Stop"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          disabled={busy}
                          onClick={() => onRestart(row.name)}
                          title="Restart"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete process "${row.name}" from PM2?`)) {
                              onDelete(row.name)
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
