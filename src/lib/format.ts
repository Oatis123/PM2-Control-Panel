export function formatUptime(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatMemory(mb: number): string {
  if (!Number.isFinite(mb)) return '—'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

export function formatCpu(cpu: number): string {
  if (!Number.isFinite(cpu)) return '—'
  return `${cpu.toFixed(1)}%`
}
