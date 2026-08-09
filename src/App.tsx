import { useCallback, useEffect, useState } from 'react'
import { EnvBanner } from './components/env/EnvBanner'
import { StatusBar } from './components/layout/StatusBar'
import { Splitter } from './components/layout/Splitter'
import { LogViewer, type LogPanelTab } from './components/logs/LogViewer'
import { ProcessTable } from './components/processes/ProcessTable'
import { TabBar } from './components/tabs/TabBar'
import { useEnv } from './hooks/useEnv'
import { usePm2Processes } from './hooks/usePm2Processes'
import { useSessionTabs } from './hooks/useSessionTabs'
import { useSystemMetrics } from './hooks/useSystemMetrics'

export default function App() {
  const { env, progress, checkAndInstall, refresh: refreshEnv } = useEnv()
  const systemMetrics = useSystemMetrics()
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
  const apps = activeTab?.apps ?? []
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
      <StatusBar env={env} progress={progress} metrics={systemMetrics} />
      <EnvBanner
        env={env}
        progress={progress}
        onInstall={() => void checkAndInstall()}
        onRetry={() => void refreshEnv()}
      />

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={selectTab}
        onClose={closeTab}
        onOpen={() => void openConfigDialog()}
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
          onSelectApp={(name) => {
            setSelectedApp(name)
            setLogTab('process')
          }}
          onStartAll={() => {
            if (activeTab?.filePath) void pm2.startConfig(activeTab.filePath)
          }}
          onStopAll={() => void pm2.stopAll(apps.map((a) => a.name))}
          onRestartAll={() =>
            void pm2.restartAll(
              apps.map((a) => a.name),
              activeTab?.filePath
            )
          }
          onStart={(name) => void pm2.startApp(name, activeTab?.filePath)}
          onStop={(name) => void pm2.stopApp(name)}
          onRestart={(name) => void pm2.restartApp(name, activeTab?.filePath)}
          onDelete={(name) => void pm2.deleteApp(name)}
          onOpenConfig={() => void openConfigDialog()}
          onReloadConfig={() => void reloadActiveTab()}
          reloading={Boolean(activeTab?.loading)}
          error={pm2.error}
        />
        <LogViewer
          configName={activeTab?.fileName ?? null}
          appNames={apps.map((a) => a.name)}
          selectedApp={effectiveSelected}
          height={logHeight}
          activeTab={logTab}
          onTabChange={setLogTab}
        />
      </Splitter>
    </div>
  )
}
