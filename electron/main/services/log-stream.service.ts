import type { ChildProcess } from 'child_process'
import { createReadStream, existsSync, readdirSync, statSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { IpcChannels } from '../../../shared/ipc'
import type { LogLine, LogStreamType, LogSubscribeRequest } from '../../../shared/types'
import { ensurePathInitialized } from './path.util'

const MAX_BUFFER_CHARS = 64_000
const POLL_MS = 400
const INITIAL_TAIL_BYTES = 48_768
/** Lines are sent to the renderer in batches to keep IPC and React updates cheap */
const FLUSH_MS = 60
const MAX_BATCH = 500

interface ActiveStream {
  mode: 'app' | 'config'
  label: string
  allowedApps: Set<string>
  type: LogStreamType
  webContents: WebContents
  /** Optional legacy pm2 logs child — never killed with taskkill /T */
  proc: ChildProcess | null
  watchers: FSWatcher[]
  pollTimer: ReturnType<typeof setInterval> | null
  filePositions: Map<string, number>
  fileMeta: Map<string, { app: string; kind: 'out' | 'err' }>
  /** Files with a read in flight — reads of one file must never overlap */
  reading: Set<string>
  /** Files that changed while a read was in flight */
  rereadPending: Set<string>
  lineSeq: number
  pending: LogLine[]
  flushTimer: ReturnType<typeof setTimeout> | null
  killed: boolean
}

let active: ActiveStream | null = null

function emitLine(
  stream: ActiveStream,
  partial: Omit<LogLine, 'id' | 'timestamp'> & { timestamp?: number }
): void {
  if (stream.killed || stream.webContents.isDestroyed()) return

  if (stream.type === 'out' && partial.type === 'err') return
  if (stream.type === 'err' && partial.type === 'out') return

  if (
    stream.mode === 'config' &&
    stream.allowedApps.size > 0 &&
    partial.type !== 'system'
  ) {
    const key = partial.appName.toLowerCase()
    if (key && key !== 'config' && !stream.allowedApps.has(key)) {
      return
    }
  }

  stream.lineSeq += 1
  const line: LogLine = {
    id: `${stream.label}-${stream.lineSeq}-${Date.now()}`,
    appName: partial.appName,
    type: partial.type,
    text: partial.text,
    timestamp: partial.timestamp ?? Date.now()
  }

  stream.pending.push(line)
  if (stream.pending.length >= MAX_BATCH) {
    flushPending(stream)
  } else if (!stream.flushTimer) {
    stream.flushTimer = setTimeout(() => flushPending(stream), FLUSH_MS)
  }
}

function flushPending(stream: ActiveStream): void {
  if (stream.flushTimer) {
    clearTimeout(stream.flushTimer)
    stream.flushTimer = null
  }
  if (stream.pending.length === 0) return
  const lines = stream.pending
  stream.pending = []
  if (stream.killed || stream.webContents.isDestroyed()) return
  stream.webContents.send(IpcChannels.PM2_LOG_LINES, lines)
}

function emitSystem(stream: ActiveStream, text: string): void {
  emitLine(stream, { appName: stream.label, type: 'system', text })
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function cleanLine(raw: string): string {
  return stripAnsi(raw).replace(/\r/g, '').trimEnd()
}

/**
 * Soft-kill only the log viewer process itself.
 * Never use taskkill /T /F — on Windows that can take down PM2-managed apps
 * that share a process tree / console group with `pm2 logs`.
 */
function softKill(proc: ChildProcess | null): void {
  if (!proc || proc.killed) return
  try {
    // Detach stdio handlers first
    proc.stdout?.removeAllListeners()
    proc.stderr?.removeAllListeners()
    proc.removeAllListeners()
    if (process.platform === 'win32') {
      // Kill only this PID, not the tree
      proc.kill()
    } else {
      proc.kill('SIGTERM')
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL')
        } catch {
          // ignore
        }
      }, 500)
    }
  } catch {
    // ignore
  }
}

function pm2LogsDir(): string {
  const home = process.env.PM2_HOME || join(homedir(), '.pm2')
  return join(home, 'logs')
}

function findLogFiles(appName: string): { out: string[]; err: string[] } {
  const dir = pm2LogsDir()
  const out: string[] = []
  const err: string[] = []
  if (!existsSync(dir)) return { out, err }

  let files: string[] = []
  try {
    files = readdirSync(dir)
  } catch {
    return { out, err }
  }

  const safe = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const errRe = new RegExp(`^${safe}-error(-\\d+)?\\.log$`, 'i')
  const outRe = new RegExp(`^${safe}-out(-\\d+)?\\.log$`, 'i')
  const bareRe = new RegExp(`^${safe}(-\\d+)?\\.log$`, 'i')

  for (const f of files) {
    const full = join(dir, f)
    if (errRe.test(f)) err.push(full)
    else if (outRe.test(f)) out.push(full)
    else if (bareRe.test(f) && !/-error/i.test(f)) out.push(full)
  }

  return { out, err }
}

function readNewBytes(stream: ActiveStream, filePath: string): void {
  if (stream.killed) return

  // fs.watch events and the poll timer fire independently. If two reads of the
  // same file overlap they both start from the same offset and every line is
  // emitted twice, so serialize per file and re-read once the current one ends.
  if (stream.reading.has(filePath)) {
    stream.rereadPending.add(filePath)
    return
  }

  const finish = (): void => {
    stream.reading.delete(filePath)
    if (stream.killed) return
    if (stream.rereadPending.delete(filePath)) readNewBytes(stream, filePath)
  }

  try {
    if (!existsSync(filePath)) return
    const meta = stream.fileMeta.get(filePath)
    if (!meta) return

    const size = statSync(filePath).size
    const prev = stream.filePositions.get(filePath) ?? 0

    // Truncated / rotated
    const start = size < prev ? 0 : prev
    if (size === start) return

    // Cap single read to avoid huge spikes
    const maxChunk = 256 * 1024
    const end = Math.min(size - 1, start + maxChunk - 1)

    stream.reading.add(filePath)

    const rs = createReadStream(filePath, {
      start,
      end,
      encoding: 'utf8',
      flags: 'r' // shared read — does not lock writers on Windows
    })

    let buf = ''
    rs.on('data', (chunk: string | Buffer) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    })
    rs.on('end', () => {
      // Only advance after successful read
      stream.filePositions.set(filePath, end + 1)

      if (!stream.killed) {
        const lines = buf.split(/\r?\n/)
        if (lines.length && lines[lines.length - 1] === '') lines.pop()

        for (const line of lines) {
          const text = cleanLine(line)
          if (!text) continue
          emitLine(stream, {
            appName: meta.app,
            type: meta.kind,
            text
          })
        }

        // If we didn't catch up to EOF (capped chunk), continue immediately
        if (end + 1 < size) stream.rereadPending.add(filePath)
      }

      finish()
    })
    rs.on('error', () => {
      // leave position unchanged so next poll retries
      finish()
    })
  } catch {
    stream.reading.delete(filePath)
  }
}

function seedFilePositions(stream: ActiveStream, files: string[]): void {
  for (const file of files) {
    try {
      if (!existsSync(file)) continue
      const size = statSync(file).size
      stream.filePositions.set(file, Math.max(0, size - INITIAL_TAIL_BYTES))
    } catch {
      stream.filePositions.set(file, 0)
    }
  }
}

function pollAllFiles(stream: ActiveStream): void {
  if (stream.killed) return
  const files = Array.from(stream.fileMeta.keys())
  for (let i = 0; i < files.length; i++) {
    readNewBytes(stream, files[i])
  }
}

/**
 * Primary log source: tail ~/.pm2/logs files.
 * Safe when switching tabs — no child process / taskkill involved.
 */
function startFileTail(stream: ActiveStream, appNames: string[]): boolean {
  const targets = Array.from(
    new Set(
      appNames.length > 0
        ? appNames
        : stream.mode === 'app'
          ? [stream.label]
          : []
    )
  )

  if (targets.length === 0) return false

  let totalOut = 0
  let totalErr = 0

  for (const app of targets) {
    const { out, err } = findLogFiles(app)
    totalOut += out.length
    totalErr += err.length
    // Skip files already tailed (overlapping app-name patterns, duplicate names)
    const all = [...out, ...err].filter((f) => !stream.fileMeta.has(f))
    if (all.length === 0) continue

    seedFilePositions(stream, all)

    for (const f of out) {
      if (all.includes(f)) stream.fileMeta.set(f, { app, kind: 'out' })
    }
    for (const f of err) {
      if (all.includes(f)) stream.fileMeta.set(f, { app, kind: 'err' })
    }

    // Initial historical tail
    for (const f of all) {
      readNewBytes(stream, f)
    }

    // Watch for changes + polling fallback (more reliable on Windows)
    for (const file of all) {
      try {
        const watcher = watch(file, { persistent: true }, () => {
          if (stream.killed) return
          // Truncation/rotation is detected in readNewBytes via size < position;
          // resetting to 0 here would replay the whole file.
          readNewBytes(stream, file)
        })
        stream.watchers.push(watcher)
      } catch {
        // polling still covers this file
      }
    }
  }

  if (totalOut + totalErr === 0) return false

  // Polling backup: fs.watch is flaky on some Windows editors/AV setups
  stream.pollTimer = setInterval(() => pollAllFiles(stream), POLL_MS)

  emitSystem(
    stream,
    stream.mode === 'config'
      ? `Tailing config logs (${targets.length} apps, ${totalOut} out / ${totalErr} err files)`
      : `Tailing logs for "${stream.label}" (${totalOut} out, ${totalErr} err)`
  )
  return true
}

function stopStream(stream: ActiveStream): void {
  stream.killed = true

  if (stream.pollTimer) {
    clearInterval(stream.pollTimer)
    stream.pollTimer = null
  }

  softKill(stream.proc)
  stream.proc = null

  for (const w of stream.watchers) {
    try {
      w.close()
    } catch {
      // ignore
    }
  }
  stream.watchers = []
  stream.filePositions.clear()
  stream.fileMeta.clear()
  stream.reading.clear()
  stream.rereadPending.clear()
  stream.pending = []
  if (stream.flushTimer) {
    clearTimeout(stream.flushTimer)
    stream.flushTimer = null
  }
}

export async function subscribeLogs(
  webContents: WebContents,
  request: LogSubscribeRequest
): Promise<void> {
  ensurePathInitialized()

  const type: LogStreamType =
    request.type === 'out' || request.type === 'err' || request.type === 'all'
      ? request.type
      : 'all'

  await unsubscribeLogs()

  if (request.mode === 'app') {
    const appName = request.appName?.trim()
    if (!appName) throw new Error('App name is required')

    const stream: ActiveStream = {
      mode: 'app',
      label: appName,
      allowedApps: new Set([appName.toLowerCase()]),
      type,
      webContents,
      proc: null,
      watchers: [],
      pollTimer: null,
      filePositions: new Map(),
      fileMeta: new Map(),
      reading: new Set(),
      rereadPending: new Set(),
      lineSeq: 0,
      pending: [],
      flushTimer: null,
      killed: false
    }
    active = stream

    emitSystem(stream, `Subscribing to logs for "${appName}"...`)

    // File tail only — never spawn `pm2 logs` (avoids killing apps on tab switch)
    const tailed = startFileTail(stream, [appName])
    if (!tailed) {
      emitSystem(
        stream,
        `No log files yet for "${appName}". Start the process; logs appear under ~/.pm2/logs/`
      )
    }
    return
  }

  // --- config mode ---
  const names = (request.appNames ?? []).map((n) => n.trim()).filter(Boolean)
  const stream: ActiveStream = {
    mode: 'config',
    label: 'config',
    allowedApps: new Set(names.map((n) => n.toLowerCase())),
    type,
    webContents,
    proc: null,
    watchers: [],
    pollTimer: null,
    filePositions: new Map(),
    fileMeta: new Map(),
    reading: new Set(),
    rereadPending: new Set(),
    lineSeq: 0,
    pending: [],
    flushTimer: null,
    killed: false
  }
  active = stream

  emitSystem(
    stream,
    names.length
      ? `Subscribing to config logs (${names.length} processes)...`
      : 'Subscribing to config logs...'
  )

  const tailed = startFileTail(stream, names)
  if (!tailed) {
    emitSystem(
      stream,
      'No log files yet for this config. Start processes; logs appear under ~/.pm2/logs/'
    )
  }
}

export async function unsubscribeLogs(): Promise<void> {
  if (!active) return
  const stream = active
  active = null
  stopStream(stream)
}

export function stopAllLogStreams(): void {
  void unsubscribeLogs()
}
