import { useCallback, useEffect, useRef, useState } from 'react'
import type { EcosystemApp, ParsedConfig, SessionTab } from '../../shared/types'

export interface TabData extends SessionTab {
  apps: EcosystemApp[]
  error?: string
  loading?: boolean
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useSessionTabs() {
  const [tabs, setTabs] = useState<TabData[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback((nextTabs: TabData[], nextActive: string | null) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void window.api.session.set({
        tabs: nextTabs.map(({ id, filePath, fileName }) => ({ id, filePath, fileName })),
        activeTabId: nextActive
      })
    }, 200)
  }, [])

  const loadConfigIntoTab = useCallback(async (tab: TabData): Promise<TabData> => {
    const result = await window.api.config.read(tab.filePath)
    if (result.ok && result.data) {
      const data = result.data as ParsedConfig
      return {
        ...tab,
        fileName: data.fileName,
        apps: data.apps,
        error: undefined,
        loading: false
      }
    }
    return {
      ...tab,
      apps: [],
      error: result.error ?? 'Failed to load config',
      loading: false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const result = await window.api.session.get()
      if (cancelled) return

      if (!result.ok || !result.data) {
        setReady(true)
        return
      }

      const session = result.data
      if (session.tabs.length === 0) {
        setReady(true)
        return
      }

      const restored: TabData[] = []
      for (const tab of session.tabs) {
        const loaded = await loadConfigIntoTab({
          ...tab,
          apps: [],
          loading: true
        })
        restored.push(loaded)
      }

      if (cancelled) return

      setTabs(restored)
      const active =
        restored.find((t) => t.id === session.activeTabId)?.id ?? restored[0]?.id ?? null
      setActiveTabId(active)
      setReady(true)
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [loadConfigIntoTab])

  const openConfigPath = useCallback(
    async (filePath: string) => {
      setGlobalError(null)
      const existing = tabs.find((t) => t.filePath === filePath)
      if (existing) {
        setActiveTabId(existing.id)
        persist(tabs, existing.id)
        return
      }

      const fileName = filePath.split(/[/\\]/).pop() ?? filePath
      const draft: TabData = {
        id: createId(),
        filePath,
        fileName,
        apps: [],
        loading: true
      }

      setTabs((prev) => [...prev, draft])
      setActiveTabId(draft.id)

      const loaded = await loadConfigIntoTab(draft)
      setTabs((prev) => {
        const next = prev.map((t) => (t.id === draft.id ? loaded : t))
        persist(next, draft.id)
        return next
      })

      if (loaded.error) {
        setGlobalError(loaded.error)
      }
    },
    [loadConfigIntoTab, persist, tabs]
  )

  const openConfigDialog = useCallback(async () => {
    setGlobalError(null)
    const result = await window.api.config.openDialog()
    if (!result.ok) {
      setGlobalError(result.error ?? 'Failed to open dialog')
      return
    }
    if (result.data) {
      await openConfigPath(result.data)
    }
  }, [openConfigPath])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === id)
        if (index < 0) return prev
        const next = prev.filter((t) => t.id !== id)
        let nextActive = activeTabId
        if (activeTabId === id) {
          const neighbor = next[index] ?? next[index - 1] ?? null
          nextActive = neighbor?.id ?? null
          setActiveTabId(nextActive)
        }
        persist(next, nextActive)
        return next
      })
    },
    [activeTabId, persist]
  )

  const selectTab = useCallback(
    (id: string) => {
      setActiveTabId(id)
      persist(tabs, id)
    },
    [persist, tabs]
  )

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  return {
    ready,
    tabs,
    activeTabId,
    activeTab,
    globalError,
    setGlobalError,
    openConfigDialog,
    openConfigPath,
    closeTab,
    selectTab
  }
}
