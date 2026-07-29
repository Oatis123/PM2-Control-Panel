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
let cachedGpu: { value: number | null; at: number; label: string | null } = {
  value: null,
  at: 0,
  label: null
}

const GPU_CACHE_MS = 1500

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

async function sampleGpuNvidia(): Promise<{ percent: number; label: string } | null> {
  try {
    const smi = await resolveCommand('nvidia-smi')
    if (!smi) return null

    const { stdout } = await execFileAsync(
      smi,
      [
        '--query-gpu=utilization.gpu,name',
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

    // e.g. "12, NVIDIA GeForce RTX 3060"
    const [utilPart, ...nameParts] = line.split(',')
    const percent = clampPercent(Number.parseFloat(utilPart.trim()))
    const label = nameParts.join(',').trim() || 'NVIDIA GPU'
    if (Number.isNaN(percent)) return null
    return { percent, label }
  } catch {
    return null
  }
}

/**
 * Windows Performance Counter for GPU Engine utilization (avg of 3D engines).
 * Slower and noisier than nvidia-smi — used as fallback.
 */
async function sampleGpuWindowsCounter(): Promise<{ percent: number; label: string } | null> {
  if (process.platform !== 'win32') return null

  try {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$samples = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue
if (-not $samples) { exit 1 }
$vals = $samples.CounterSamples |
  Where-Object { $_.InstanceName -match 'engtype_3D' -or $_.InstanceName -match 'engtype_Graphics' } |
  ForEach-Object { [double]$_.CookedValue }
if (-not $vals -or $vals.Count -eq 0) {
  $vals = $samples.CounterSamples | ForEach-Object { [double]$_.CookedValue }
}
if (-not $vals -or $vals.Count -eq 0) { exit 1 }
$avg = ($vals | Measure-Object -Average).Average
[Math]::Round([Math]::Min(100, [Math]::Max(0, $avg)), 1)
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

    const percent = clampPercent(Number.parseFloat(stdout.trim()))
    if (Number.isNaN(percent)) return null
    return { percent, label: 'GPU' }
  } catch {
    return null
  }
}

async function sampleGpu(): Promise<{ percent: number | null; label: string | null }> {
  const now = Date.now()
  if (now - cachedGpu.at < GPU_CACHE_MS) {
    return { percent: cachedGpu.value, label: cachedGpu.label }
  }

  ensurePathInitialized()

  const nvidia = await sampleGpuNvidia()
  if (nvidia) {
    cachedGpu = { value: nvidia.percent, at: now, label: nvidia.label }
    return { percent: nvidia.percent, label: nvidia.label }
  }

  const win = await sampleGpuWindowsCounter()
  if (win) {
    cachedGpu = { value: win.percent, at: now, label: win.label }
    return { percent: win.percent, label: win.label }
  }

  cachedGpu = { value: null, at: now, label: null }
  return { percent: null, label: null }
}

/** Warm CPU sampler so the first public read is meaningful. */
export function primeCpuSampler(): void {
  prevCpu = readCpuSnapshot()
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const cpu = sampleCpuPercent()
  const ram = sampleRam()
  const gpu = await sampleGpu()

  return {
    cpu,
    ram: ram.percent,
    ramUsedGb: ram.usedGb,
    ramTotalGb: ram.totalGb,
    gpu: gpu.percent,
    gpuLabel: gpu.label,
    timestamp: Date.now()
  }
}
