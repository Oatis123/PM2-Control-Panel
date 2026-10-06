import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import type {
  ApiResult,
  EnvProgressEvent,
  EnvState,
  EnvVersions,
  LogLine,
  LogSubscribeRequest,
  ParsedConfig,
  ProcessMetrics,
  SessionState,
  SystemMetrics
} from '../../shared/types'

const api = {
  env: {
    check: (): Promise<ApiResult<EnvState>> =>
      ipcRenderer.invoke(IpcChannels.ENV_CHECK),
    checkAndInstall: (): Promise<ApiResult<EnvState>> =>
      ipcRenderer.invoke(IpcChannels.ENV_CHECK_AND_INSTALL),
    getVersions: (): Promise<ApiResult<EnvVersions>> =>
      ipcRenderer.invoke(IpcChannels.ENV_GET_VERSIONS),
    onProgress: (callback: (event: EnvProgressEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, data: EnvProgressEvent): void => {
        callback(data)
      }
      ipcRenderer.on(IpcChannels.ENV_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IpcChannels.ENV_PROGRESS, listener)
    }
  },

  config: {
    openDialog: (): Promise<ApiResult<string | null>> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_OPEN_DIALOG),
    read: (filePath: string): Promise<ApiResult<ParsedConfig>> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_READ, filePath),
    watch: (filePath: string): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_WATCH, filePath),
    unwatch: (filePath: string): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.CONFIG_UNWATCH, filePath),
    onChanged: (callback: (filePath: string) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, filePath: string): void => {
        callback(filePath)
      }
      ipcRenderer.on(IpcChannels.CONFIG_CHANGED, listener)
      return () => ipcRenderer.removeListener(IpcChannels.CONFIG_CHANGED, listener)
    }
  },

  pm2: {
    jlist: (): Promise<ApiResult<ProcessMetrics[]>> =>
      ipcRenderer.invoke(IpcChannels.PM2_JLIST),
    startConfig: (filePath: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_START_CONFIG, filePath),
    stopAll: (appNames: string[]): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.PM2_STOP_ALL, appNames),
    restartAll: (appNames: string[], configPath?: string): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.PM2_RESTART_ALL, appNames, configPath),
    startApp: (appName: string, configPath?: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_START_APP, appName, configPath),
    stopApp: (appName: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_STOP_APP, appName),
    restartApp: (appName: string, configPath?: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_RESTART_APP, appName, configPath),
    deleteApp: (appName: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_DELETE_APP, appName),
    flush: (appName?: string): Promise<ApiResult<string>> =>
      ipcRenderer.invoke(IpcChannels.PM2_FLUSH, appName),
    subscribeLogs: (request: LogSubscribeRequest): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.PM2_LOGS_SUBSCRIBE, request),
    unsubscribeLogs: (): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IpcChannels.PM2_LOGS_UNSUBSCRIBE),
    onLogLines: (callback: (lines: LogLine[]) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, lines: LogLine[]): void => {
        callback(lines)
      }
      ipcRenderer.on(IpcChannels.PM2_LOG_LINES, listener)
      return () => ipcRenderer.removeListener(IpcChannels.PM2_LOG_LINES, listener)
    }
  },

  session: {
    get: (): Promise<ApiResult<SessionState>> =>
      ipcRenderer.invoke(IpcChannels.SESSION_GET),
    set: (session: SessionState): Promise<ApiResult<SessionState>> =>
      ipcRenderer.invoke(IpcChannels.SESSION_SET, session)
  },

  system: {
    getMetrics: (): Promise<ApiResult<SystemMetrics>> =>
      ipcRenderer.invoke(IpcChannels.SYS_METRICS)
  }
}

export type WindowApi = typeof api

contextBridge.exposeInMainWorld('api', api)
