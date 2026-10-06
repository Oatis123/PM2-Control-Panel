export type ProcessStatus = 'online' | 'stopped' | 'errored' | 'stopping' | 'launching' | 'unknown'

export interface EcosystemApp {
  name: string
  script?: string
  cwd?: string
  instances?: number | string
  exec_mode?: string
  env?: Record<string, string>
  args?: string | string[]
  interpreter?: string
  [key: string]: unknown
}

export interface ParsedConfig {
  filePath: string
  fileName: string
  apps: EcosystemApp[]
}

export interface ProcessMetrics {
  name: string
  pmId: number | null
  status: ProcessStatus
  cpu: number
  memoryMb: number
  uptimeMs: number | null
  restarts: number
  pid: number | null
}

export interface SessionTab {
  id: string
  filePath: string
  fileName: string
}

export interface SessionState {
  tabs: SessionTab[]
  activeTabId: string | null
}

export type EnvComponent = 'node' | 'npm' | 'pm2'

export type EnvStatus = 'checking' | 'ready' | 'installing' | 'error' | 'missing'

export interface EnvVersions {
  node: string | null
  npm: string | null
  pm2: string | null
}

export interface EnvState {
  status: EnvStatus
  versions: EnvVersions
  message?: string
  missing?: EnvComponent[]
}

export type LogStreamType = 'all' | 'out' | 'err'

/** Single process logs vs merged logs for all apps in the open config */
export type LogSubscribeMode = 'app' | 'config'

export interface LogSubscribeRequest {
  mode: LogSubscribeMode
  /** Required when mode === 'app' */
  appName?: string
  /** Required when mode === 'config' — filter to these process names */
  appNames?: string[]
  type?: LogStreamType
}

export interface LogLine {
  id: string
  appName: string
  type: 'out' | 'err' | 'system'
  text: string
  timestamp: number
}

export interface EnvProgressEvent {
  stage: string
  message: string
  percent?: number
}

export interface ApiResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

/** Host machine load snapshot for header monitors */
export interface SystemMetrics {
  cpu: number
  ram: number
  ramUsedGb: number
  ramTotalGb: number
  /** null when GPU utilization cannot be read */
  gpu: number | null
  gpuLabel: string | null
  /** Dedicated video memory usage in percent; null when unavailable */
  vram: number | null
  vramUsedMb: number | null
  vramTotalMb: number | null
  timestamp: number
}
