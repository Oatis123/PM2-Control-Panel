import { memo } from 'react'
import type { TabData } from '../../hooks/useSessionTabs'
import { Icon } from '../Icon'

interface TabBarProps {
  tabs: TabData[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onOpen: () => void
}

function TabBarImpl({ tabs, activeTabId, onSelect, onClose, onOpen }: TabBarProps) {
  return (
    <div className="flex min-h-10 shrink-0 items-center justify-between gap-3">
      <nav aria-label="Ecosystem configs" className="tabs min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div key={tab.id} className={`tab-item ${active ? 'on' : ''}`}>
              <button
                type="button"
                className="tab max-w-[240px]"
                aria-current={active ? true : undefined}
                onClick={() => onSelect(tab.id)}
                title={tab.filePath}
              >
                <span className="truncate">{tab.fileName}</span>
                {tab.error && <span className="text-ochre">!</span>}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${tab.fileName}`}
              >
                <Icon name="close" />
              </button>
            </div>
          )
        })}
      </nav>
      <button
        type="button"
        className="btn btn-ghost btn-sm shrink-0"
        onClick={onOpen}
        title="Open an ecosystem config"
      >
        <Icon name="plus" />
        Open config
      </button>
    </div>
  )
}

export const TabBar = memo(TabBarImpl)
