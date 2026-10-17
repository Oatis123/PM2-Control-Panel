import { memo, useMemo } from 'react'
import type { EcosystemApp, ProcessMetrics, ProcessStatus } from '../../../shared/types'
import { formatCpu, formatMemory, formatUptime } from '../../lib/format'
import { PixelSleeper } from '../PixelIcon'
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
  /** Demote the empty-state action when another primary action owns the screen */
  quietOpen?: boolean
  error?: string | null
}

interface Row {
  name: string
  script?: string
  status: ProcessStatus
  cpu: number
  memoryMb: number
  uptimeMs: number | null
  restarts: number
}

function mergeRows(apps: EcosystemApp[], processes: ProcessMetrics[]): Row[] {
  const byName = new Map(processes.map((p) => [p.name, p]))

  return apps.map((app) => {
    const runtime = byName.get(app.name)
    return {
      name: app.name,
      script: typeof app.script === 'string' ? app.script : undefined,
      status: runtime?.status ?? 'stopped',
      cpu: runtime?.cpu ?? 0,
      memoryMb: runtime?.memoryMb ?? 0,
      uptimeMs: runtime?.uptimeMs ?? null,
      restarts: runtime?.restarts ?? 0
    }
  })
}

/** One human sentence above the dense data: what matters right now */
function summarize(rows: Row[]): string {
  if (rows.length === 0) return 'No apps in this config.'

  const online = rows.filter((r) => r.status === 'online').length
  const errored = rows.filter((r) => r.status === 'errored')
  const total = rows.length
  const memory = rows.reduce((sum, r) => sum + (r.status === 'online' ? r.memoryMb : 0), 0)

  const head =
    errored.length > 0
      ? `${errored.length === 1 ? errored[0].name : `${errored.length} processes`} ${
          errored.length === 1 ? 'has' : 'have'
        } errored; ${online} of ${total} still running.`
      : online === total
        ? total === 1
          ? 'The process is running.'
          : `All ${total} processes are running.`
        : online === 0
          ? 'Nothing is running yet.'
          : `${online} of ${total} processes are running.`

  return online > 0 ? `${head} ${formatMemory(memory)} in use.` : head
}

interface ProcessRowProps {
  row: Row
  selected: boolean
  busy: boolean
  onSelectApp: (name: string) => void
  onStart: (name: string) => void
  onStop: (name: string) => void
  onRestart: (name: string) => void
  onDelete: (name: string) => void
}

function rowPropsEqual(prev: ProcessRowProps, next: ProcessRowProps): boolean {
  const a = prev.row
  const b = next.row
  return (
    prev.selected === next.selected &&
    prev.busy === next.busy &&
    prev.onSelectApp === next.onSelectApp &&
    prev.onStart === next.onStart &&
    prev.onStop === next.onStop &&
    prev.onRestart === next.onRestart &&
    prev.onDelete === next.onDelete &&
    a.name === b.name &&
    a.script === b.script &&
    a.status === b.status &&
    a.cpu === b.cpu &&
    a.memoryMb === b.memoryMb &&
    a.uptimeMs === b.uptimeMs &&
    a.restarts === b.restarts
  )
}

const ProcessRow = memo(function ProcessRow({
  row,
  selected,
  busy,
  onSelectApp,
  onStart,
  onStop,
  onRestart,
  onDelete
}: ProcessRowProps) {
  const idle = row.status === 'stopped' || row.status === 'unknown'
  return (
    <tr className={selected ? 'sel-bar' : ''} onClick={() => onSelectApp(row.name)}>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusDot status={row.status} />
          <span className={row.status === 'errored' ? 'text-ochre' : 'text-muted'}>{row.status}</span>
        </div>
      </td>
      <td className={idle ? 'text-muted' : ''}>{row.name}</td>
      <td className="max-w-[200px] truncate font-code text-[11px] text-muted" title={row.script}>
        {row.script ?? '—'}
      </td>
      <td className="r">{formatCpu(row.cpu)}</td>
      <td className="r">{formatMemory(row.memoryMb)}</td>
      <td className="r">{formatUptime(row.uptimeMs)}</td>
      <td className={`r ${row.restarts > 0 ? '' : 'text-muted'}`}>{row.restarts}</td>
      <td>
        <div className="flex items-center justify-end gap-4" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-text"
            disabled={busy || row.status === 'online'}
            onClick={() => onStart(row.name)}
          >
            start
          </button>
          <button
            type="button"
            className="btn-text"
            disabled={busy || row.status === 'stopped'}
            onClick={() => onStop(row.name)}
          >
            stop
          </button>
          <button
            type="button"
            className="btn-text"
            disabled={busy}
            onClick={() => onRestart(row.name)}
          >
            restart
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete process "${row.name}" from PM2?`)) {
                onDelete(row.name)
              }
            }}
          >
            delete
          </button>
        </div>
      </td>
    </tr>
  )
}, rowPropsEqual)

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
  quietOpen = false,
  error
}: ProcessTableProps) {
  const rows = useMemo(() => mergeRows(apps, processes), [apps, processes])
  const summary = useMemo(() => summarize(rows), [rows])

  if (!filePath) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
      >
        <PixelSleeper />
        <h2 className="head text-[20px] leading-tight">Open a PM2 ecosystem config</h2>
        <p className="serif max-w-sm text-[14px] leading-relaxed text-muted">
          {emptyHint ?? 'Nothing is open yet. Pick a .js file, or drag one here.'}
        </p>
        <button
          type="button"
          className={`btn mt-1 ${quietOpen ? 'btn-ghost' : ''}`}
          onClick={onOpenConfig}
        >
          open config
        </button>
      </div>
    )
  }

  const names = apps.map((a) => a.name)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-6 border-b border-line px-4 py-2.5">
        <p
          className={`serif min-w-0 truncate text-[14px] ${error ? 'text-ochre' : ''}`}
          title={error ?? summary}
        >
          {error ?? summary}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || reloading || !filePath || !onReloadConfig}
            onClick={onReloadConfig}
            title="Reload config from disk"
          >
            reload{reloading && <span className="spin" />}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || names.length === 0}
            onClick={onRestartAll}
          >
            restart all
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || names.length === 0}
            onClick={onStopAll}
          >
            stop all
          </button>
          <button type="button" className="btn" disabled={busy || !filePath} onClick={onStartAll}>
            start all
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>status</th>
              <th>name</th>
              <th>script</th>
              <th className="r">cpu</th>
              <th className="r">ram</th>
              <th className="r">uptime</th>
              <th className="r">restarts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="cursor-default">
                <td colSpan={8} className="serif py-8 text-center text-[14px] text-muted">
                  No apps in this config.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ProcessRow
                  key={row.name}
                  row={row}
                  selected={selectedApp === row.name}
                  busy={busy}
                  onSelectApp={onSelectApp}
                  onStart={onStart}
                  onStop={onStop}
                  onRestart={onRestart}
                  onDelete={onDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
