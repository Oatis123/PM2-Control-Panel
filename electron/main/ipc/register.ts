import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '../../../shared/ipc'
import type { ApiResult, ParsedConfig, ProcessMetrics, SessionState } from '../../../shared/types'
import { checkAndInstall, checkEnvironment, getVersions } from '../services/env.service'
import { readConfig, watchConfigFile } from '../services/config.service'
import { resolve } from 'path'
import * as pm2 from '../services/pm2.service'
import { getSession, setSession } from '../services/session.store'
import { getSystemMetrics } from '../services/sys-metrics.service'
import { subscribeLogs, unsubscribeLogs } from '../services/log-stream.service'
import type { LogSubscribeRequest } from '../../../shared/types'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fail(error: unknown): ApiResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }
}

export function registerIpcHandlers(): void {
  // --- Environment ---
  ipcMain.handle(IpcChannels.ENV_CHECK, async () => {
    try {
      return ok(await checkEnvironment())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.ENV_CHECK_AND_INSTALL, async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const state = await checkAndInstall((stage, message) => {
        win?.webContents.send(IpcChannels.ENV_PROGRESS, { stage, message })
      })
      return ok(state)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.ENV_GET_VERSIONS, async () => {
    try {
      return ok(await getVersions())
    } catch (e) {
      return fail(e)
    }
  })

  // --- Config ---
  ipcMain.handle(IpcChannels.CONFIG_OPEN_DIALOG, async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Open PM2 Ecosystem Config',
        filters: [
          { name: 'JavaScript Config', extensions: ['js', 'cjs', 'mjs'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) {
        return ok<string | null>(null)
      }
      return ok(result.filePaths[0])
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.CONFIG_READ, async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path')
      }
      const config: ParsedConfig = await readConfig(filePath)
      return ok(config)
    } catch (e) {
      return fail(e)
    }
  })

  // Per-webContents watch unsubscribers
  const configWatchUnsubs = new Map<number, Map<string, () => void>>()

  ipcMain.handle(IpcChannels.CONFIG_WATCH, async (event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path')
      }
      const abs = resolve(filePath)
      const wcId = event.sender.id
      let byPath = configWatchUnsubs.get(wcId)
      if (!byPath) {
        byPath = new Map()
        configWatchUnsubs.set(wcId, byPath)
      }
      // already watching
      if (byPath.has(abs.toLowerCase())) {
        return ok(undefined)
      }

      const unsub = watchConfigFile(abs, () => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.CONFIG_CHANGED, abs)
        }
      })
      byPath.set(abs.toLowerCase(), unsub)

      event.sender.once('destroyed', () => {
        const map = configWatchUnsubs.get(wcId)
        if (!map) return
        Array.from(map.values()).forEach((stop) => stop())
        configWatchUnsubs.delete(wcId)
      })

      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.CONFIG_UNWATCH, async (event, filePath: string) => {
    try {
      const abs = resolve(filePath).toLowerCase()
      const byPath = configWatchUnsubs.get(event.sender.id)
      const stop = byPath?.get(abs)
      if (stop) {
        stop()
        byPath?.delete(abs)
      }
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // --- PM2 ---
  ipcMain.handle(IpcChannels.PM2_JLIST, async () => {
    try {
      const list: ProcessMetrics[] = await pm2.getProcessList()
      return ok(list)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_START_CONFIG, async (_event, filePath: string) => {
    try {
      return ok(await pm2.startConfig(filePath))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_STOP_ALL, async (_event, appNames: string[]) => {
    try {
      await pm2.stopAll(appNames ?? [])
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_RESTART_ALL, async (_event, appNames: string[]) => {
    try {
      await pm2.restartAll(appNames ?? [])
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IpcChannels.PM2_START_APP,
    async (_event, appName: string, configPath?: string) => {
      try {
        return ok(await pm2.startApp(appName, configPath))
      } catch (e) {
        return fail(e)
      }
    }
  )

  ipcMain.handle(IpcChannels.PM2_STOP_APP, async (_event, appName: string) => {
    try {
      return ok(await pm2.stopApp(appName))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_RESTART_APP, async (_event, appName: string) => {
    try {
      return ok(await pm2.restartApp(appName))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_DELETE_APP, async (_event, appName: string) => {
    try {
      return ok(await pm2.deleteApp(appName))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.PM2_FLUSH, async (_event, appName?: string) => {
    try {
      return ok(await pm2.flushLogs(appName))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IpcChannels.PM2_LOGS_SUBSCRIBE,
    async (event, request: LogSubscribeRequest | string, legacyType?: string) => {
      try {
        // Backward-compatible: subscribeLogs(appName, type)
        let payload: LogSubscribeRequest
        if (typeof request === 'string') {
          payload = {
            mode: 'app',
            appName: request,
            type:
              legacyType === 'out' || legacyType === 'err' || legacyType === 'all'
                ? legacyType
                : 'all'
          }
        } else {
          payload = request
        }
        await subscribeLogs(event.sender, payload)
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    }
  )

  ipcMain.handle(IpcChannels.PM2_LOGS_UNSUBSCRIBE, async () => {
    try {
      await unsubscribeLogs()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // --- System metrics ---
  ipcMain.handle(IpcChannels.SYS_METRICS, async () => {
    try {
      return ok(await getSystemMetrics())
    } catch (e) {
      return fail(e)
    }
  })

  // --- Session ---
  ipcMain.handle(IpcChannels.SESSION_GET, async () => {
    try {
      return ok(getSession())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IpcChannels.SESSION_SET, async (_event, session: SessionState) => {
    try {
      return ok(setSession(session))
    } catch (e) {
      return fail(e)
    }
  })
}
