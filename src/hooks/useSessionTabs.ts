import { useCallback, useEffect, useRef, useState } from 'react'
import type { EcosystemApp, ParsedConfig, SessionTab } from '../../shared/types'

export interface TabData extends SessionTab {
  apps: EcosystemApp[]
  error?: string
  loading?: boolean
  /** Bumps on every successful reload so React always sees a new tree */
  contentKey?: string
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function contentKeyFromApps(apps: EcosystemApp[]): string {
  return `${Date.now()}:${apps.map((a) => a.name).join('|')}`
}

export function useSessionTabs() {
  const [tabs, setTabs] = useState<TabData[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId

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
      // Fresh array copies so React cannot reuse stale references
      const apps = data.apps.map((a) => ({ ...a }))
      return {
        ...tab,
        filePath: data.filePath || tab.filePath,
        fileName: data.fileName,
        apps,
        contentKey: contentKeyFromApps(apps),
        error: undefined,
        loading: false
      }
    }
    return {
      ...tab,
      apps: [],
      contentKey: contentKeyFromApps([]),
      error: result.error ?? 'Failed to load config',
      loading: false
    }
  }, [])

  const replaceTab = useCallback(
    (tabId: string, loaded: TabData, makeActive: boolean) => {
      setTabs((prev) => {
        const next = prev.map((t) => (t.id === tabId ? { ...loaded } : t))
        persist(next, makeActive ? tabId : activeTabIdRef.current)
        return next
      })
      if (makeActive) {
        setActiveTabId(tabId)
      }
      if (loaded.error) {
        setGlobalError(loaded.error)
      } else {
        setGlobalError(null)
      }
    },
    [persist]
  )

  const reloadTab = useCallback(
    async (tabId: string, makeActive = false) => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab) return

      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, loading: true } : t)))

      const loaded = await loadConfigIntoTab({ ...tab, loading: true })
      replaceTab(tabId, loaded, makeActive)
    },
    [loadConfigIntoTab, replaceTab]
  )

  const reloadActiveTab = useCallback(async () => {
    const id = activeTabIdRef.current
    if (!id) return
    await reloadTab(id, true)
  }, [reloadTab])

  // Session restore
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const result = await window.api.session.get()
      if (cancelled) return

      if (!result.ok || !result.data || result.data.tabs.length === 0) {
        setReady(true)
        return
      }

      const session = result.data
      const restored: TabData[] = []
      for (const tab of session.tabs) {
        const loaded = await loadConfigIntoTab({
          ...tab,
          apps: [],
          loading: true
        })
        restored.push(loaded)
        // Watch each restored config for disk changes
        void window.api.config.watch(tab.filePath)
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

  // Auto-reload when a watched config file changes on disk
  useEffect(() => {
    const unsub = window.api.config.onChanged((filePath) => {
      const norm = normalizePath(filePath)
      const tab = tabsRef.current.find((t) => normalizePath(t.filePath) === norm)
      if (tab) {
        void reloadTab(tab.id, tab.id === activeTabIdRef.current)
      }
    })
    return unsub
  }, [reloadTab])

  const openConfigPath = useCallback(
    async (filePath: string) => {
      setGlobalError(null)
      const normalized = normalizePath(filePath)
      const existing = tabsRef.current.find((t) => normalizePath(t.filePath) === normalized)

      if (existing) {
        // Force full reload from disk
        await reloadTab(existing.id, true)
        void window.api.config.watch(existing.filePath)
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
      replaceTab(draft.id, loaded, true)
      void window.api.config.watch(loaded.filePath || filePath)
    },
    [loadConfigIntoTab, reloadTab, replaceTab]
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
      const tab = tabsRef.current.find((t) => t.id === id)
      if (tab) {
        void window.api.config.unwatch(tab.filePath)
      }

      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === id)
        if (index < 0) return prev
        const next = prev.filter((t) => t.id !== id)
        let nextActive = activeTabIdRef.current
        if (activeTabIdRef.current === id) {
          const neighbor = next[index] ?? next[index - 1] ?? null
          nextActive = neighbor?.id ?? null
          setActiveTabId(nextActive)
        }
        persist(next, nextActive)
        return next
      })
    },
    [persist]
  )

  const selectTab = useCallback(
    (id: string) => {
      setActiveTabId(id)
      persist(tabsRef.current, id)
      // Always re-read from disk when focusing a tab
      void reloadTab(id, false)
    },
    [persist, reloadTab]
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
    selectTab,
    reloadActiveTab
  }
}
