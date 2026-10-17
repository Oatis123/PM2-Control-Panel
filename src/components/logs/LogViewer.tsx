import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LogLine, LogStreamType } from '../../../shared/types'
import { PixelIcon } from '../PixelIcon'

/** Lines kept in memory (search runs over all of them) */
const MAX_LINES = 3000
/** Lines actually rendered — keeps the DOM small while logs stream */
const RENDER_CAP = 1000

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })

export type LogPanelTab = 'config' | 'process'

interface LogViewerProps {
  /** Ecosystem file name for labels */
  configName: string | null
  /** Process names from the active config */
  appNames: string[]
  /** Currently selected process (for process tab) */
  selectedApp: string | null
  height: number
  /** Controlled tab — parent can switch when user picks a process */
  activeTab: LogPanelTab
  onTabChange: (tab: LogPanelTab) => void
}

function LogViewerImpl({
  configName,
  appNames,
  selectedApp,
  height,
  activeTab,
  onTabChange
}: LogViewerProps) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [filter, setFilter] = useState<LogStreamType>('all')
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasConfig = Boolean(configName && appNames.length > 0)
  const streamKey =
    activeTab === 'config'
      ? `config:${configName ?? ''}:${appNames.join(',')}`
      : `app:${selectedApp ?? ''}`

  // Live stream subscription
  useEffect(() => {
    let cancelled = false
    setLines([])
    setStreamError(null)
    setConnected(false)

    const canStream =
      activeTab === 'config'
        ? hasConfig
        : Boolean(selectedApp)

    if (!canStream) {
      void window.api.pm2.unsubscribeLogs()
      return
    }

    // Main process sends batches (~60 ms) — one state update per batch
    const unsubLine = window.api.pm2.onLogLines((batch) => {
      if (cancelled || batch.length === 0) return
      setLines((prev) => {
        const next = prev.concat(batch)
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    })

    void (async () => {
      const result =
        activeTab === 'config'
          ? await window.api.pm2.subscribeLogs({
              mode: 'config',
              appNames,
              type: 'all'
            })
          : await window.api.pm2.subscribeLogs({
              mode: 'app',
              appName: selectedApp!,
              type: 'all'
            })

      if (cancelled) return
      if (!result.ok) {
        setStreamError(result.error ?? 'Failed to subscribe to logs')
        setConnected(false)
        setLines([
          {
            id: `err-${Date.now()}`,
            appName: activeTab === 'config' ? 'config' : selectedApp ?? 'app',
            type: 'system',
            text: result.error ?? 'Failed to subscribe to logs',
            timestamp: Date.now()
          }
        ])
      } else {
        setConnected(true)
      }
    })()

    return () => {
      cancelled = true
      unsubLine()
      void window.api.pm2.unsubscribeLogs()
    }
    // streamKey captures relevant deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey])

  const visible = useMemo(() => {
    return lines.filter((line) => {
      if (filter === 'out' && line.type !== 'out' && line.type !== 'system') return false
      if (filter === 'err' && line.type !== 'err' && line.type !== 'system') return false
      if (query) {
        const q = query.toLowerCase()
        const hay = `${line.appName} ${line.text}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [lines, filter, query])

  const rendered = useMemo(
    () => (visible.length > RENDER_CAP ? visible.slice(visible.length - RENDER_CAP) : visible),
    [visible]
  )

  useLayoutEffect(() => {
    if (!autoScroll || !containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [rendered, autoScroll])

  const handleScroll = (): void => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  const clearView = (): void => setLines([])

  const flush = async (): Promise<void> => {
    if (activeTab === 'process' && selectedApp) {
      const result = await window.api.pm2.flush(selectedApp)
      setLines((prev) => [
        ...prev,
        {
          id: `flush-${Date.now()}`,
          appName: selectedApp,
          type: 'system',
          text: result.ok
            ? `Flushed PM2 logs for ${selectedApp}`
            : `Flush failed: ${result.error ?? 'unknown error'}`,
          timestamp: Date.now()
        }
      ])
      return
    }

    // Config: flush each app (best-effort)
    if (appNames.length === 0) return
    let okCount = 0
    for (const name of appNames) {
      const result = await window.api.pm2.flush(name)
      if (result.ok) okCount += 1
    }
    setLines((prev) => [
      ...prev,
      {
        id: `flush-${Date.now()}`,
        appName: 'config',
        type: 'system',
        text: `Flushed logs for ${okCount}/${appNames.length} processes`,
        timestamp: Date.now()
      }
    ])
  }

  const emptyHint = !hasConfig
    ? 'Open a config to see its logs.'
    : activeTab === 'process' && !selectedApp
      ? 'Select a process to see its logs.'
      : streamError ?? 'Waiting for the first log line.'

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" style={{ height }}>
      {/* Log source tabs */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
        <div className="tabs min-w-0">
          <button
            type="button"
            className={`tab ${activeTab === 'config' ? 'on' : ''}`}
            onClick={() => onTabChange('config')}
            title="Merged logs for all processes in this config"
          >
            <PixelIcon name="note" />
            <span className="max-w-[160px] truncate">
              {configName ? `config · ${configName}` : 'config'}
            </span>
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'process' ? 'on' : ''}`}
            onClick={() => onTabChange('process')}
            title={selectedApp ? `Logs for ${selectedApp}` : 'Process logs'}
            disabled={!selectedApp && !hasConfig}
          >
            <PixelIcon name="terminal" />
            <span className="max-w-[160px] truncate">{selectedApp ? selectedApp : 'process'}</span>
          </button>
        </div>

        <span
          className={connected ? 'text-ochre' : streamError ? 'text-ochre' : 'text-dim'}
          title={connected ? 'Stream connected' : streamError ?? 'Idle'}
        >
          {connected ? '● live' : streamError ? '× failed' : '○ idle'}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-5 border-b border-line px-4 py-2">
        <div className="toggle">
          {(['all', 'out', 'err'] as LogStreamType[]).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={filter === type}
              onClick={() => setFilter(type)}
            >
              {type === 'out' ? 'stdout' : type === 'err' ? 'stderr' : 'all'}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs flex-1">
          <PixelIcon
            name="search"
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeTab === 'config' ? 'filter by text or app' : 'filter logs'}
            className="field pl-5"
          />
        </div>

        <div className="ml-auto flex items-center gap-5">
          <button
            type="button"
            className="btn-text"
            onClick={() => setAutoScroll((v) => !v)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            follow <span className={autoScroll ? 'text-moss' : 'text-dim'}>{autoScroll ? 'on' : 'off'}</span>
          </button>
          <button type="button" className="btn-text" onClick={clearView} title="Clear view">
            clear
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={activeTab === 'process' ? !selectedApp : appNames.length === 0}
            onClick={() => void flush()}
            title="Flush PM2 log files"
          >
            flush
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 select-text overflow-auto bg-surface px-4 py-2 font-code text-[12px] leading-relaxed"
      >
        {!canShowLines(hasConfig, activeTab, selectedApp) || visible.length === 0 ? (
          <p className="serif text-[14px] text-muted">{emptyHint}</p>
        ) : (
          <>
            {visible.length > rendered.length && (
              <p className="mb-1 text-dim">
                … {visible.length - rendered.length} older lines hidden (showing last {RENDER_CAP})
              </p>
            )}
            {rendered.map((line) => (
              <LogRow
                key={line.id}
                line={line}
                showApp={activeTab === 'config'}
                showOut={filter === 'all' && activeTab === 'process'}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

interface LogRowProps {
  line: LogLine
  showApp: boolean
  showOut: boolean
}

const LogRow = memo(function LogRow({ line, showApp, showOut }: LogRowProps) {
  return (
    <div className={line.type === 'system' ? 'text-muted' : 'text-text'}>
      <span className="mr-2 text-dim">{timeFormat.format(line.timestamp)}</span>
      {showApp && line.type !== 'system' && (
        <span className="mr-1.5 text-muted">{line.appName}</span>
      )}
      {line.type === 'err' && <span className="mr-1.5 text-ochre">err</span>}
      {line.type === 'out' && showOut && <span className="mr-1.5 text-dim">out</span>}
      {line.text}
    </div>
  )
})

function canShowLines(
  hasConfig: boolean,
  activeTab: LogPanelTab,
  selectedApp: string | null
): boolean {
  if (!hasConfig) return false
  if (activeTab === 'process' && !selectedApp) return false
  return true
}

export const LogViewer = memo(LogViewerImpl)
