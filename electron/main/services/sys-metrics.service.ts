import { cpus, freemem, totalmem } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SystemMetrics } from '../../../shared/types'
import { ensurePathInitialized, resolveCommand } from './path.util'

const execFileAsync = promisify(execFile)

interface CpuSnapshot {
  idle: number
  total: number
}

let prevCpu: CpuSnapshot | null = null
interface GpuSample {
  percent: number
  label: string
  vramUsedMb: number | null
  vramTotalMb: number | null
}

const GPU_REFRESH_MS = 1500
/** How long to wait before retrying a GPU source that failed */
const GPU_RETRY_MS = 30_000

let cachedGpu: GpuSample | null = null
let gpuRefreshedAt = 0
let gpuInFlight: Promise<void> | null = null
/** Resolved once — `where.exe` must not run on every sample */
let nvidiaSmiPath: string | null | undefined
let nvidiaFailedAt = 0
let counterFailedAt = 0
let vramTotalCacheMb: number | null | undefined

function readCpuSnapshot(): CpuSnapshot {
  let idle = 0
  let total = 0
  for (const cpu of cpus()) {
    const t = cpu.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

function sampleCpuPercent(): number {
  const cur = readCpuSnapshot()
  if (!prevCpu) {
    prevCpu = cur
    return 0
  }

  const idleDelta = cur.idle - prevCpu.idle
  const totalDelta = cur.total - prevCpu.total
  prevCpu = cur

  if (totalDelta <= 0) return 0
  const usage = (1 - idleDelta / totalDelta) * 100
  return clampPercent(usage)
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10))
}

function sampleRam(): { percent: number; usedGb: number; totalGb: number } {
  const total = totalmem()
  const free = freemem()
  const used = Math.max(0, total - free)
  return {
    percent: clampPercent((used / total) * 100),
    usedGb: Math.round((used / 1024 ** 3) * 10) / 10,
    totalGb: Math.round((total / 1024 ** 3) * 10) / 10
  }
}

async function sampleGpuNvidia(): Promise<GpuSample | null> {
  try {
    if (nvidiaSmiPath === undefined) nvidiaSmiPath = await resolveCommand('nvidia-smi')
    if (!nvidiaSmiPath) return null

    const { stdout } = await execFileAsync(
      nvidiaSmiPath,
      [
        '--query-gpu=utilization.gpu,memory.used,memory.total,name',
        '--format=csv,noheader,nounits'
      ],
      {
        windowsHide: true,
        timeout: 4000,
        env: process.env
      }
    )

    const line = stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0]
    if (!line) return null

    // e.g. "12, 1861, 8188, NVIDIA GeForce RTX 4060"
    const [utilPart, usedPart, totalPart, ...nameParts] = line.split(',')
    const percent = Number.parseFloat(utilPart.trim())
    if (Number.isNaN(percent)) return null
    const used = Number.parseFloat(usedPart?.trim() ?? '')
    const total = Number.parseFloat(totalPart?.trim() ?? '')

    return {
      percent: clampPercent(percent),
      label: nameParts.join(',').trim() || 'NVIDIA GPU',
      vramUsedMb: Number.isFinite(used) ? used : null,
      vramTotalMb: Number.isFinite(total) && total > 0 ? total : null
    }
  } catch {
    return null
  }
}

/**
 * Windows Performance Counters (GPU Engine utilization + GPU Adapter Memory).
 * Slower and noisier than nvidia-smi — used as fallback for AMD / Intel GPUs.
 * Output: "<util>|<vramUsedMb>|<vramTotalMb>" (empty field when unknown).
 */
async function sampleGpuWindowsCounter(): Promise<GpuSample | null> {
  if (process.platform !== 'win32') return null

  try {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @('\\GPU Engine(*)\\Utilization Percentage', '\\GPU Adapter Memory(*)\\Dedicated Usage')
$samples = (Get-Counter -Counter $paths -ErrorAction SilentlyContinue).CounterSamples
if (-not $samples) { exit 1 }
$engine = $samples | Where-Object { $_.Path -like '*gpu engine*' }
$vals = $engine |
  Where-Object { $_.InstanceName -match 'engtype_3D' -or $_.InstanceName -match 'engtype_Graphics' } |
  ForEach-Object { [double]$_.CookedValue }
if (-not $vals) { $vals = $engine | ForEach-Object { [double]$_.CookedValue } }
$util = ''
if ($vals) { $util = [Math]::Round([Math]::Min(100, [Math]::Max(0, ($vals | Measure-Object -Sum).Sum)), 1) }
$mem = $samples | Where-Object { $_.Path -like '*gpu adapter memory*' } | ForEach-Object { [double]$_.CookedValue }
$used = ''
if ($mem) { $used = [Math]::Round(($mem | Measure-Object -Maximum).Maximum / 1MB, 0) }
$total = ''
if (${vramTotalCacheMb === undefined ? '$true' : '$false'}) {
  $max = 0
  Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' |
    ForEach-Object {
      $v = (Get-ItemProperty $_.PSPath -Name 'HardwareInformation.qwMemorySize').'HardwareInformation.qwMemorySize'
      if ($v -gt $max) { $max = [double]$v }
    }
  if ($max -gt 0) { $total = [Math]::Round($max / 1MB, 0) }
}
"$util|$used|$total"
`.trim()

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      {
        windowsHide: true,
        timeout: 8000,
        env: process.env,
        maxBuffer: 2 * 1024 * 1024
      }
    )

    const [utilPart = '', usedPart = '', totalPart = ''] = stdout.trim().split('|')
    const util = Number.parseFloat(utilPart)
    const used = Number.parseFloat(usedPart)
    const total = Number.parseFloat(totalPart)

    if (vramTotalCacheMb === undefined) {
      vramTotalCacheMb = Number.isFinite(total) && total > 0 ? total : null
    }
    if (!Number.isFinite(util) && !Number.isFinite(used)) return null

    return {
      percent: Number.isFinite(util) ? clampPercent(util) : 0,
      label: 'GPU',
      vramUsedMb: Number.isFinite(used) ? used : null,
      vramTotalMb: vramTotalCacheMb ?? null
    }
  } catch {
    return null
  }
}

async function refreshGpu(): Promise<void> {
  ensurePathInitialized()
  const now = Date.now()

  let sample: GpuSample | null = null
  if (now - nvidiaFailedAt > GPU_RETRY_MS) {
    sample = await sampleGpuNvidia()
    if (!sample) nvidiaFailedAt = Date.now()
  }
  if (!sample && now - counterFailedAt > GPU_RETRY_MS) {
    sample = await sampleGpuWindowsCounter()
    if (!sample) counterFailedAt = Date.now()
  }

  cachedGpu = sample
  gpuRefreshedAt = Date.now()
}

/**
 * Never blocks the metrics call: returns the last sample and refreshes in the
 * background (one refresh at a time) when it is stale.
 */
function sampleGpu(): GpuSample | null {
  if (!gpuInFlight && Date.now() - gpuRefreshedAt >= GPU_REFRESH_MS) {
    gpuInFlight = refreshGpu()
      .catch(() => {
        cachedGpu = null
      })
      .finally(() => {
        gpuInFlight = null
      })
  }
  return cachedGpu
}

/** Warm CPU sampler so the first public read is meaningful. */
export function primeCpuSampler(): void {
  prevCpu = readCpuSnapshot()
}

/** Start the first GPU sample early so the first UI poll already has data. */
export function primeGpuSampler(): void {
  sampleGpu()
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const cpu = sampleCpuPercent()
  const ram = sampleRam()
  const gpu = sampleGpu()

  const vramUsed = gpu?.vramUsedMb ?? null
  const vramTotal = gpu?.vramTotalMb ?? null
  const vramPercent =
    vramUsed != null && vramTotal != null ? clampPercent((vramUsed / vramTotal) * 100) : null

  return {
    cpu,
    ram: ram.percent,
    ramUsedGb: ram.usedGb,
    ramTotalGb: ram.totalGb,
    gpu: gpu?.percent ?? null,
    gpuLabel: gpu?.label ?? null,
    vram: vramPercent,
    vramUsedMb: vramUsed,
    vramTotalMb: vramTotal,
    timestamp: Date.now()
  }
}
