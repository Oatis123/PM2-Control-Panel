import { memo } from 'react'
import type { TabData } from '../../hooks/useSessionTabs'
import { PixelIcon } from '../PixelIcon'

interface TabBarProps {
  tabs: TabData[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onOpen: () => void
}

function TabBarImpl({ tabs, activeTabId, onSelect, onClose, onOpen }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
      <div className="tabs min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div key={tab.id} className="group flex shrink-0 items-center gap-2">
              <button
                type="button"
                className={`tab max-w-[240px] ${active ? 'on' : ''}`}
                onClick={() => onSelect(tab.id)}
                title={tab.filePath}
              >
                <span className="truncate">{tab.fileName}</span>
                {tab.error && <span className="text-ochre">!</span>}
              </button>
              <button
                type="button"
                className="text-dim opacity-0 hover:text-ochre focus-visible:opacity-100 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${tab.fileName}`}
              >
                <PixelIcon name="close" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="btn-text flex shrink-0 items-center gap-2"
        onClick={onOpen}
        title="Open an ecosystem config"
      >
        <PixelIcon name="plus" />
        open config
      </button>
    </div>
  )
}

export const TabBar = memo(TabBarImpl)
