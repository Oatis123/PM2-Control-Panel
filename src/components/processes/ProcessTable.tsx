import { memo, useMemo } from 'react'
import type { EcosystemApp, ProcessMetrics, ProcessStatus } from '../../../shared/types'
import { formatCpu, formatMemory, formatUptime } from '../../lib/format'
import { Icon } from '../Icon'
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
        } errored. ${online} of ${total} still running.`
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
    <tr className={selected ? 'sel-bar cursor-pointer' : 'cursor-pointer'} onClick={() => onSelectApp(row.name)}>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusDot status={row.status} />
          <span className={row.status === 'errored' ? 'text-ochre' : 'text-muted'}>{row.status}</span>
        </div>
      </td>
      <td>
        <button
          type="button"
          className={`font-semibold hover:text-moss ${idle ? 'text-muted' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onSelectApp(row.name)
          }}
          aria-label={`View logs for ${row.name}`}
        >
          {row.name}
        </button>
      </td>
      <td className="max-w-[136px] truncate font-code text-[12px] text-muted lg:max-w-[200px]" title={row.script}>
        {row.script ?? '—'}
      </td>
      <td className="r">{formatCpu(row.cpu)}</td>
      <td className="r">{formatMemory(row.memoryMb)}</td>
      <td className="r">{formatUptime(row.uptimeMs)}</td>
      <td className={`r ${row.restarts > 0 ? '' : 'text-muted'}`}>{row.restarts}</td>
      <td>
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-text"
            disabled={busy || row.status === 'online'}
            onClick={() => onStart(row.name)}
          >
            Start
          </button>
          <button
            type="button"
            className="btn-text"
            disabled={busy || row.status === 'stopped'}
            onClick={() => onStop(row.name)}
          >
            Stop
          </button>
          <button
            type="button"
            className="btn-text"
            disabled={busy}
            onClick={() => onRestart(row.name)}
          >
            Restart
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
            Delete
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
        className="grid h-full overflow-auto p-4 text-center"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
      >
        <div className="m-auto flex flex-col items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-moss-wash text-moss">
            <Icon name="folder" size={22} />
          </span>
          <h1 className="head text-[28px] leading-tight">Open a PM2 ecosystem config</h1>
          <p className="max-w-sm font-serif text-[15px] leading-relaxed text-muted">
            {emptyHint ?? 'Choose an ecosystem file or drag it here.'}
          </p>
          <button
            type="button"
            className={`btn mt-1 ${quietOpen ? 'btn-ghost' : ''}`}
            onClick={onOpenConfig}
          >
            <Icon name="folder" />
            Open config
          </button>
        </div>
      </div>
    )
  }

  const names = apps.map((a) => a.name)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h1 className="head text-[28px] leading-tight">Processes</h1>
          <p
            className={`mt-1 truncate font-serif text-[15px] ${error ? 'text-ochre' : 'text-muted'}`}
            title={error ?? summary}
          >
            {error ?? summary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || reloading || !filePath || !onReloadConfig}
            onClick={onReloadConfig}
            title="Reload config from disk"
          >
            {reloading ? <span className="spin" /> : <Icon name="refresh" />}
            Reload
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || names.length === 0}
            onClick={onRestartAll}
          >
            Restart all
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || names.length === 0}
            onClick={onStopAll}
          >
            Stop all
          </button>
          <button type="button" className="btn" disabled={busy || !filePath} onClick={onStartAll}>
            <Icon name="play" />
            Start all
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2">
        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Script</th>
              <th className="r">CPU</th>
              <th className="r">RAM</th>
              <th className="r">Uptime</th>
              <th className="r">Restarts</th>
              <th className="r"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="cursor-default">
                <td colSpan={8} className="font-serif py-8 text-center text-[14px] text-muted">
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
