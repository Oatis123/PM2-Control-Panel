import { X } from 'lucide-react'
import type { ProcessStatus } from '../../shared/types'

interface StatusDotProps {
  status: ProcessStatus
}

export function StatusDot({ status }: StatusDotProps) {
  if (status === 'errored') {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center text-ink"
        title="errored"
        aria-label="errored"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    )
  }

  if (status === 'online' || status === 'launching') {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-white"
        title={status}
        aria-label={status}
      />
    )
  }

  // stopped / stopping / unknown — hollow circle
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full border border-ink-muted"
      title={status}
      aria-label={status}
    />
  )
}
