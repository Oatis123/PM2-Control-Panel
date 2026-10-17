import type { ProcessStatus } from '../../shared/types'

interface StatusDotProps {
  status: ProcessStatus
}

/** ochre = alive / needs a look, muted = at rest. Glyphs, not colors, tell the states apart. */
export function StatusDot({ status }: StatusDotProps) {
  if (status === 'errored') {
    return (
      <span className="font-code text-ochre" title="errored" aria-label="errored">
        ×
      </span>
    )
  }

  if (status === 'online') {
    return (
      <span className="font-code text-ochre" title="online" aria-label="online">
        ●
      </span>
    )
  }

  if (status === 'launching' || status === 'stopping') {
    return (
      <span className="font-code text-ochre" title={status} aria-label={status}>
        ◐
      </span>
    )
  }

  // stopped / unknown — hollow circle
  return (
    <span className="font-code text-muted" title={status} aria-label={status}>
      ○
    </span>
  )
}
