import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EcosystemApp } from '../shared/types'
import { EnvBanner } from './components/env/EnvBanner'
import { StatusBar } from './components/layout/StatusBar'
import { Splitter } from './components/layout/Splitter'
import { LogViewer, type LogPanelTab } from './components/logs/LogViewer'
import { ProcessTable } from './components/processes/ProcessTable'
import { TabBar } from './components/tabs/TabBar'
import { useEnv } from './hooks/useEnv'
import { usePm2Processes } from './hooks/usePm2Processes'
import { useSessionTabs } from './hooks/useSessionTabs'

const NO_APPS: EcosystemApp[] = []

export default function App() {
  const { env, progress, checkAndInstall, refresh: refreshEnv } = useEnv()
  const {
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
  } = useSessionTabs()

  const envReady = env.status === 'ready'
  const pm2 = usePm2Processes(envReady || env.status === 'missing')

  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [logHeight, setLogHeight] = useState(220)
  const [logTab, setLogTab] = useState<LogPanelTab>('config')

  // Keep selection in sync with active tab apps
  const apps = activeTab?.apps ?? NO_APPS
  const appNames = useMemo(() => apps.map((a) => a.name), [apps])
  const activeFilePath = activeTab?.filePath
  const effectiveSelected =
    selectedApp && apps.some((a) => a.name === selectedApp)
      ? selectedApp
      : apps[0]?.name ?? null

  // Reset log panel to config-wide when switching ecosystem tabs
  useEffect(() => {
    setLogTab('config')
  }, [activeTabId])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      const js = files.find((f) => /\.(js|cjs|mjs)$/i.test(f.name))
      if (!js) {
        setGlobalError('Please drop a .js ecosystem config file')
        return
      }
      // Electron File has path
      const path = (js as File & { path?: string }).path
      if (path) {
        void openConfigPath(path)
      } else {
        setGlobalError('Could not resolve dropped file path')
      }
    },
    [openConfigPath, setGlobalError]
  )

  // Stable handlers so memoized rows / panels are not re-rendered by every poll
  const {
    startConfig,
    stopAll,
    restartAll,
    startApp,
    stopApp,
    restartApp,
    deleteApp
  } = pm2

  const handleSelectApp = useCallback((name: string) => {
    setSelectedApp(name)
    setLogTab('process')
  }, [])
  const handleStartAll = useCallback(() => {
    if (activeFilePath) void startConfig(activeFilePath)
  }, [activeFilePath, startConfig])
  const handleStopAll = useCallback(() => void stopAll(appNames), [appNames, stopAll])
  const handleRestartAll = useCallback(
    () => void restartAll(appNames, activeFilePath),
    [appNames, activeFilePath, restartAll]
  )
  const handleStart = useCallback(
    (name: string) => void startApp(name, activeFilePath),
    [activeFilePath, startApp]
  )
  const handleStop = useCallback((name: string) => void stopApp(name), [stopApp])
  const handleRestart = useCallback(
    (name: string) => void restartApp(name, activeFilePath),
    [activeFilePath, restartApp]
  )
  const handleDelete = useCallback((name: string) => void deleteApp(name), [deleteApp])
  const handleOpenConfig = useCallback(() => void openConfigDialog(), [openConfigDialog])
  const handleReloadConfig = useCallback(() => void reloadActiveTab(), [reloadActiveTab])
  const handleInstall = useCallback(() => void checkAndInstall(), [checkAndInstall])
  const handleRetryEnv = useCallback(() => void refreshEnv(), [refreshEnv])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-ink-muted">
        Loading session...
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col bg-surface"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      <StatusBar env={env} progress={progress} />
      <EnvBanner
        env={env}
        progress={progress}
        onInstall={handleInstall}
        onRetry={handleRetryEnv}
      />

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={selectTab}
        onClose={closeTab}
        onOpen={handleOpenConfig}
      />

      {(globalError || activeTab?.error) && (
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-surface-panel px-4 py-1.5 text-xs text-ink">
          <span>{globalError ?? activeTab?.error}</span>
          <button
            type="button"
            className="text-ink-muted hover:text-ink"
            onClick={() => setGlobalError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <Splitter bottomHeight={logHeight} onBottomHeightChange={setLogHeight}>
        <ProcessTable
          apps={apps}
          processes={pm2.processes}
          filePath={activeTab?.filePath ?? null}
          busy={pm2.busy}
          selectedApp={effectiveSelected}
          onSelectApp={handleSelectApp}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
          onRestartAll={handleRestartAll}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
          onDelete={handleDelete}
          onOpenConfig={handleOpenConfig}
          onReloadConfig={handleReloadConfig}
          reloading={Boolean(activeTab?.loading)}
          error={pm2.error}
        />
        <LogViewer
          configName={activeTab?.fileName ?? null}
          appNames={appNames}
          selectedApp={effectiveSelected}
          height={logHeight}
          activeTab={logTab}
          onTabChange={setLogTab}
        />
      </Splitter>
    </div>
  )
}
