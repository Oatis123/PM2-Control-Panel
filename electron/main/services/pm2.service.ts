import type { ProcessMetrics, ProcessStatus } from '../../../shared/types'
import { ensurePathInitialized } from './path.util'
import { runPm2Cli } from './tools.resolver'
import { buildWindowsHiddenStartConfig } from './windows-hide'

async function runPm2(args: string[]): Promise<string> {
  ensurePathInitialized()
  // Do NOT inject --node-args here — breaks non-Node interpreters (Python, etc.)
  try {
    const { stdout, stderr } = await runPm2Cli(args)
    return (stdout || stderr || '').trim()
  } catch (error) {
    const err = error as { stderr?: string; message?: string; stdout?: string }
    const detail =
      err.stderr?.trim() || err.stdout?.trim() || err.message || 'PM2 command failed'
    throw new Error(detail)
  }
}

/**
 * Start from a temp ecosystem:
 * - Node apps get NODE_OPTIONS/--require hide patch
 * - Python and others only get windowsHide (no Node flags)
 */
async function startFromConfig(filePath: string, onlyApp?: string): Promise<string> {
  if (process.platform !== 'win32') {
    return onlyApp
      ? runPm2(['start', filePath, '--only', onlyApp])
      : runPm2(['start', filePath])
  }

  const hiddenConfig = await buildWindowsHiddenStartConfig(filePath, onlyApp)
  const args =
    onlyApp != null
      ? ['start', hiddenConfig, '--only', onlyApp]
      : ['start', hiddenConfig]
  return runPm2(args)
}

function mapStatus(raw: string | undefined): ProcessStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'online':
      return 'online'
    case 'stopped':
      return 'stopped'
    case 'errored':
      return 'errored'
    case 'stopping':
      return 'stopping'
    case 'launching':
      return 'launching'
    default:
      return 'unknown'
  }
}

interface Pm2JlistItem {
  name?: string
  pm_id?: number
  pid?: number
  pm2_env?: {
    status?: string
    restart_time?: number
    pm_uptime?: number
    created_at?: number
  }
  monit?: {
    memory?: number
    cpu?: number
  }
}

export async function getProcessList(): Promise<ProcessMetrics[]> {
  const raw = await runPm2(['jlist'])
  if (!raw) return []

  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw

  let list: Pm2JlistItem[]
  try {
    list = JSON.parse(jsonText) as Pm2JlistItem[]
  } catch {
    throw new Error('Failed to parse pm2 jlist output')
  }

  if (!Array.isArray(list)) return []

  return list.map((item) => {
    const status = mapStatus(item.pm2_env?.status)
    const memory = item.monit?.memory ?? 0
    const startedAt = item.pm2_env?.pm_uptime
    const isRunning = status === 'online' || status === 'launching'
    const uptimeMs =
      isRunning && typeof startedAt === 'number' && startedAt > 0
        ? Math.max(0, Date.now() - startedAt)
        : null

    return {
      name: item.name ?? `pm2-${item.pm_id ?? '?'}`,
      pmId: item.pm_id ?? null,
      status,
      cpu: isRunning ? (item.monit?.cpu ?? 0) : 0,
      memoryMb: isRunning ? Math.round((memory / (1024 * 1024)) * 10) / 10 : 0,
      uptimeMs,
      restarts: item.pm2_env?.restart_time ?? 0,
      pid: item.pid ?? null
    }
  })
}

export async function startConfig(filePath: string): Promise<string> {
  return startFromConfig(filePath)
}

export async function stopApp(appName: string): Promise<string> {
  return runPm2(['stop', appName])
}

export async function restartApp(appName: string, configPath?: string): Promise<string> {
  if (configPath) {
    try {
      await runPm2(['delete', appName])
    } catch {
      // may not exist
    }
    return startFromConfig(configPath, appName)
  }
  return runPm2(['restart', appName])
}

export async function startApp(appName: string, configPath?: string): Promise<string> {
  if (configPath) {
    try {
      await runPm2(['delete', appName])
    } catch {
      // not registered yet
    }
    return startFromConfig(configPath, appName)
  }
  return runPm2(['start', appName])
}

export async function deleteApp(appName: string): Promise<string> {
  try {
    return await runPm2(['delete', appName])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not found|doesn't exist|does not exist|unknown/i.test(message)) {
      return message
    }
    throw error
  }
}

export async function stopAll(appNames: string[]): Promise<void> {
  for (const name of appNames) {
    try {
      await stopApp(name)
    } catch {
      // ignore
    }
  }
}

export async function restartAll(appNames: string[], configPath?: string): Promise<void> {
  if (configPath) {
    for (const name of appNames) {
      try {
        await runPm2(['delete', name])
      } catch {
        // ignore
      }
    }
    await startFromConfig(configPath)
    return
  }
  for (const name of appNames) {
    try {
      await restartApp(name)
    } catch {
      // ignore
    }
  }
}

export async function flushLogs(appName?: string): Promise<string> {
  return appName ? runPm2(['flush', appName]) : runPm2(['flush'])
}
