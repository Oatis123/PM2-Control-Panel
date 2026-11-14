import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { LogLine, LogStreamType } from '../../../shared/types'
import { Icon } from '../Icon'

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
  /** Controlled tab — parent can switch when user picks a process */
  activeTab: LogPanelTab
  onTabChange: (tab: LogPanelTab) => void
}

function LogViewerImpl({
  configName,
  appNames,
  selectedApp,
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
    <div className="flex h-full min-h-0 flex-col">
      {/* Log source tabs */}
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-4 px-4 pt-2">
        <div
          role="group"
          aria-label="Log source"
          className="segmented"
          style={{ '--segments': 2, '--selected': activeTab === 'config' ? 0 : 1 } as CSSProperties}
        >
          <button
            type="button"
            className="tab min-w-0"
            aria-pressed={activeTab === 'config'}
            onClick={() => onTabChange('config')}
            title={configName ? `Merged logs for ${configName}` : 'Merged logs for this config'}
          >
            <Icon name="note" />
            Config
          </button>
          <button
            type="button"
            className="tab min-w-0"
            aria-pressed={activeTab === 'process'}
            onClick={() => onTabChange('process')}
            title={selectedApp ? `Logs for ${selectedApp}` : 'Process logs'}
            disabled={!selectedApp && !hasConfig}
          >
            <Icon name="terminal" />
            <span className="max-w-[160px] truncate">{selectedApp ?? 'Process'}</span>
          </button>
        </div>

        <span
          className={`inline-flex items-center gap-2 text-[13px] ${
            connected || streamError ? 'text-ochre' : 'text-muted'
          }`}
          title={connected ? 'Stream connected' : streamError ?? 'Idle'}
        >
          {connected && <span className="status-dot" aria-hidden="true" />}
          {streamError && <Icon name="warn" />}
          {connected ? 'Live' : streamError ? 'Failed' : 'Idle'}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-2">
        <div
          role="group"
          aria-label="Log stream"
          className="segmented"
          style={{ '--segments': 3, '--selected': filter === 'all' ? 0 : filter === 'out' ? 1 : 2 } as CSSProperties}
        >
          {(['all', 'out', 'err'] as LogStreamType[]).map((type) => (
            <button
              key={type}
              type="button"
              className="tab"
              aria-pressed={filter === type}
              onClick={() => setFilter(type)}
            >
              {type === 'out' ? 'stdout' : type === 'err' ? 'stderr' : 'All'}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter logs"
            placeholder={activeTab === 'config' ? 'Filter by text or app' : 'Filter logs'}
            className="field pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn-text"
            onClick={() => setAutoScroll((v) => !v)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            Follow <span className={autoScroll ? 'text-moss' : ''}>{autoScroll ? 'on' : 'off'}</span>
          </button>
          <button type="button" className="btn-text" onClick={clearView} title="Clear view">
            Clear
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={activeTab === 'process' ? !selectedApp : appNames.length === 0}
            onClick={() => void flush()}
            title="Flush PM2 log files"
          >
            Flush
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="mx-4 mb-3 min-h-0 flex-1 select-text overflow-auto rounded-sm bg-bg px-3 py-2 font-code text-[12px] leading-relaxed"
      >
        {!canShowLines(hasConfig, activeTab, selectedApp) || visible.length === 0 ? (
          <p className="font-serif text-[14px] text-muted">{emptyHint}</p>
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
      <span className="mr-2 text-muted">{timeFormat.format(line.timestamp)}</span>
      {showApp && line.type !== 'system' && (
        <span className="mr-1.5 text-muted">{line.appName}</span>
      )}
      {line.type === 'err' && <span className="mr-1.5 text-ochre">err</span>}
      {line.type === 'out' && showOut && <span className="mr-1.5 text-muted">out</span>}
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
