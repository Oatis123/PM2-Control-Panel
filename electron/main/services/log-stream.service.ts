import { type ChildProcess, spawn } from 'child_process'
import { createReadStream, existsSync, readdirSync, statSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import { IpcChannels } from '../../../shared/ipc'
import type { LogLine, LogStreamType, LogSubscribeRequest } from '../../../shared/types'
import { ensurePathInitialized, getProcessEnv } from './path.util'
import { resolveTools } from './tools.resolver'

const MAX_BUFFER_CHARS = 64_000

interface ActiveStream {
  mode: 'app' | 'config'
  /** Display / single-app target */
  label: string
  /** Allowed process names (lowercase) for filtering; empty = no filter */
  allowedApps: Set<string>
  type: LogStreamType
  webContents: WebContents
  proc: ChildProcess | null
  watchers: FSWatcher[]
  filePositions: Map<string, number>
  /** filePath → source app name for multi-file tail */
  fileAppNames: Map<string, string>
  lineSeq: number
  killed: boolean
  stdoutBuf: string
  stderrBuf: string
}

let active: ActiveStream | null = null

function emitLine(
  stream: ActiveStream,
  partial: Omit<LogLine, 'id' | 'timestamp'> & { timestamp?: number }
): void {
  if (stream.killed || stream.webContents.isDestroyed()) return

  if (stream.type === 'out' && partial.type === 'err') return
  if (stream.type === 'err' && partial.type === 'out') return

  // Config mode: drop lines from processes not in this ecosystem
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

  stream.webContents.send(IpcChannels.PM2_LOG_LINE, line)
}

function emitSystem(stream: ActiveStream, text: string): void {
  emitLine(stream, { appName: stream.label, type: 'system', text })
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Parse a raw pm2 log line into app name + message body.
 * Formats: "0|name  | msg", "name | msg", plain text
 */
function parseLogLine(
  raw: string,
  fallbackApp: string
): { appName: string; text: string } | null {
  let text = stripAnsi(raw).replace(/\r/g, '').trimEnd()
  if (!text) return null

  // Timestamp prefix from --timestamp
  text = text.replace(
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\s*:?\s*/,
    ''
  )

  // "id|name  | message" or "name | message"
  const pipe = text.match(/^\s*(?:\d+\|)?\s*([^\s|]+)\s*\|\s?(.*)$/)
  if (pipe) {
    return {
      appName: pipe[1].trim() || fallbackApp,
      text: pipe[2] ?? ''
    }
  }

  return { appName: fallbackApp, text }
}

function flushBuffer(
  stream: ActiveStream,
  which: 'stdout' | 'stderr',
  chunk: string,
  eof = false
): void {
  const key = which === 'stdout' ? 'stdoutBuf' : 'stderrBuf'
  stream[key] += chunk
  if (stream[key].length > MAX_BUFFER_CHARS) {
    stream[key] = stream[key].slice(-MAX_BUFFER_CHARS)
  }

  const parts = stream[key].split('\n')
  if (!eof) {
    stream[key] = parts.pop() ?? ''
  } else {
    stream[key] = ''
  }

  const defaultType = which === 'stderr' ? 'err' : 'out'
  const fallbackApp = stream.mode === 'app' ? stream.label : 'config'

  for (const part of parts) {
    const parsed = parseLogLine(part, fallbackApp)
    if (!parsed || !parsed.text) continue

    const type =
      defaultType === 'err' ||
      (/error|exception|fatal/i.test(part) && which === 'stdout')
        ? 'err'
        : 'out'

    emitLine(stream, {
      appName: parsed.appName,
      type,
      text: parsed.text
    })
  }
}

function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) {
    try {
      proc.kill()
    } catch {
      // ignore
    }
    return
  }

  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    } catch {
      try {
        proc.kill()
      } catch {
        // ignore
      }
    }
  } else {
    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }
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
  // Older layout sometimes omits -out
  const bareRe = new RegExp(`^${safe}(-\\d+)?\\.log$`, 'i')

  for (const f of files) {
    const full = join(dir, f)
    if (errRe.test(f)) err.push(full)
    else if (outRe.test(f)) out.push(full)
    else if (bareRe.test(f) && !/-error/i.test(f)) out.push(full)
  }

  return { out, err }
}

function readNewBytes(
  stream: ActiveStream,
  filePath: string,
  type: 'out' | 'err',
  sourceApp: string
): void {
  try {
    if (!existsSync(filePath)) return
    const size = statSync(filePath).size
    const prev = stream.filePositions.get(filePath) ?? 0
    const start = size < prev ? 0 : prev
    if (size === start) return

    const rs = createReadStream(filePath, { start, end: size - 1, encoding: 'utf8' })
    let buf = ''
    rs.on('data', (chunk: string | Buffer) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    })
    rs.on('end', () => {
      stream.filePositions.set(filePath, size)
      const lines = buf.split(/\r?\n/)
      if (lines.length && lines[lines.length - 1] === '') lines.pop()
      for (const line of lines) {
        const parsed = parseLogLine(line, sourceApp)
        if (!parsed || !parsed.text) continue
        emitLine(stream, {
          appName: sourceApp,
          type,
          text: parsed.text
        })
      }
    })
    rs.on('error', () => {
      // ignore
    })
  } catch {
    // ignore
  }
}

function seedFilePositions(stream: ActiveStream, files: string[], tailBytes = 32_768): void {
  for (const file of files) {
    try {
      if (!existsSync(file)) continue
      const size = statSync(file).size
      stream.filePositions.set(file, Math.max(0, size - tailBytes))
    } catch {
      stream.filePositions.set(file, 0)
    }
  }
}

function startFileTail(stream: ActiveStream, appNames: string[]): boolean {
  const targets =
    appNames.length > 0
      ? appNames
      : stream.mode === 'app'
        ? [stream.label]
        : []

  if (targets.length === 0) return false

  let totalOut = 0
  let totalErr = 0

  for (const app of targets) {
    const { out, err } = findLogFiles(app)
    totalOut += out.length
    totalErr += err.length
    const all = [...out, ...err]
    if (all.length === 0) continue

    seedFilePositions(stream, all)
    for (const f of out) {
      stream.fileAppNames.set(f, app)
      readNewBytes(stream, f, 'out', app)
    }
    for (const f of err) {
      stream.fileAppNames.set(f, app)
      readNewBytes(stream, f, 'err', app)
    }

    for (const file of all) {
      try {
        const logType: 'out' | 'err' = err.includes(file) ? 'err' : 'out'
        const watcher = watch(file, { persistent: true }, (event) => {
          if (stream.killed) return
          if (event === 'rename') stream.filePositions.set(file, 0)
          readNewBytes(stream, file, logType, app)
        })
        stream.watchers.push(watcher)
      } catch {
        // ignore
      }
    }
  }

  if (totalOut + totalErr === 0) return false

  emitSystem(
    stream,
    stream.mode === 'config'
      ? `Tailing config logs (${targets.length} apps, ${totalOut} out / ${totalErr} err files)`
      : `Tailing log files for "${stream.label}" (${totalOut} out, ${totalErr} err)`
  )
  return true
}

async function startPm2LogsProcess(
  stream: ActiveStream,
  /** undefined = all processes (config mode) */
  pm2Target?: string
): Promise<boolean> {
  ensurePathInitialized()
  const tools = await resolveTools()

  let command: string
  let args: string[]

  const baseArgs =
    pm2Target != null && pm2Target.length > 0
      ? ['logs', pm2Target, '--lines', '150', '--timestamp']
      : ['logs', '--lines', '150', '--timestamp']

  if (stream.type === 'out') baseArgs.push('--out')
  if (stream.type === 'err') baseArgs.push('--err')

  if (tools.node && tools.pm2Entry) {
    command = tools.node
    args = [tools.pm2Entry, ...baseArgs]
  } else if (tools.pm2Cmd) {
    command = process.env.ComSpec || 'cmd.exe'
    args = ['/d', '/s', '/c', `"${tools.pm2Cmd}" ${baseArgs.join(' ')}`]
  } else {
    return false
  }

  return await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn(command, args, {
        windowsHide: true,
        env: getProcessEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      })

      stream.proc = proc
      let settled = false

      const ok = (): void => {
        if (settled) return
        settled = true
        resolve(true)
      }

      proc.stdout?.on('data', (buf: Buffer) => {
        ok()
        flushBuffer(stream, 'stdout', buf.toString('utf8'))
      })
      proc.stderr?.on('data', (buf: Buffer) => {
        ok()
        flushBuffer(stream, 'stderr', buf.toString('utf8'))
      })

      proc.on('error', (err) => {
        if (!settled) {
          settled = true
          resolve(false)
        } else {
          emitSystem(stream, `Log stream error: ${err.message}`)
        }
      })

      proc.on('close', (code) => {
        flushBuffer(stream, 'stdout', '', true)
        flushBuffer(stream, 'stderr', '', true)
        if (!stream.killed) {
          emitSystem(stream, `Log stream ended (code ${code ?? '?'})`)
        }
        if (!settled) {
          settled = true
          resolve(code === 0)
        }
      })

      setTimeout(() => {
        if (!settled && !stream.killed && proc.exitCode == null) {
          settled = true
          resolve(true)
        }
      }, 800)
    } catch {
      resolve(false)
    }
  })
}

export async function subscribeLogs(
  webContents: WebContents,
  request: LogSubscribeRequest
): Promise<void> {
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
      filePositions: new Map(),
      fileAppNames: new Map(),
      lineSeq: 0,
      killed: false,
      stdoutBuf: '',
      stderrBuf: ''
    }
    active = stream

    emitSystem(stream, `Subscribing to logs for "${appName}"...`)

    const started = await startPm2LogsProcess(stream, appName)
    if (!started || stream.killed) {
      if (stream.proc) {
        killProcessTree(stream.proc)
        stream.proc = null
      }
      const tailed = startFileTail(stream, [appName])
      if (!tailed) {
        emitSystem(
          stream,
          `No log stream available for "${appName}". Start the process or check ~/.pm2/logs/`
        )
      }
    } else {
      emitSystem(stream, `Streaming pm2 logs for "${appName}"`)
    }
    return
  }

  // --- config mode: merged logs for all apps in ecosystem ---
  const names = (request.appNames ?? []).map((n) => n.trim()).filter(Boolean)
  const stream: ActiveStream = {
    mode: 'config',
    label: 'config',
    allowedApps: new Set(names.map((n) => n.toLowerCase())),
    type,
    webContents,
    proc: null,
    watchers: [],
    filePositions: new Map(),
    fileAppNames: new Map(),
    lineSeq: 0,
    killed: false,
    stdoutBuf: '',
    stderrBuf: ''
  }
  active = stream

  emitSystem(
    stream,
    names.length
      ? `Subscribing to config logs (${names.length} processes)...`
      : 'Subscribing to config logs...'
  )

  // Prefer global pm2 logs stream (filtered by allowedApps)
  const started = await startPm2LogsProcess(stream, undefined)
  if (!started || stream.killed) {
    if (stream.proc) {
      killProcessTree(stream.proc)
      stream.proc = null
    }
    const tailed = startFileTail(stream, names)
    if (!tailed) {
      emitSystem(
        stream,
        'No config log stream available. Start processes or check ~/.pm2/logs/'
      )
    }
  } else {
    emitSystem(stream, 'Streaming merged config logs')
    // Also attach file tails so we get typed out/err even if pm2 merges poorly
    // Skip dual source to avoid duplicates when process stream works.
  }
}

export async function unsubscribeLogs(): Promise<void> {
  if (!active) return

  const stream = active
  stream.killed = true
  active = null

  if (stream.proc) {
    killProcessTree(stream.proc)
    stream.proc = null
  }

  for (const w of stream.watchers) {
    try {
      w.close()
    } catch {
      // ignore
    }
  }
  stream.watchers = []
}

export function stopAllLogStreams(): void {
  void unsubscribeLogs()
}
