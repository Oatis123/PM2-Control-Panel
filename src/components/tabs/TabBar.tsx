import { FileCode2, Plus, X } from 'lucide-react'
import type { TabData } from '../../hooks/useSessionTabs'

interface TabBarProps {
  tabs: TabData[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onOpen: () => void
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onOpen }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-surface-border bg-surface-raised">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`group flex max-w-[240px] min-w-[120px] items-center gap-1.5 border-r border-surface-border px-2.5 ${
                active
                  ? 'border-b-2 border-b-white bg-surface text-ink'
                  : 'border-b-2 border-b-transparent text-ink-muted hover:bg-surface-panel hover:text-ink'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm"
                onClick={() => onSelect(tab.id)}
                title={tab.filePath}
              >
                {tab.fileName}
                {tab.error ? ' !' : ''}
              </button>
              <button
                type="button"
                className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${tab.fileName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="btn-icon m-1.5 shrink-0"
        onClick={onOpen}
        title="Open Config"
        aria-label="Open Config"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
