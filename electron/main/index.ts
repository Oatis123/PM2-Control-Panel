import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/register'
import { stopAllConfigWatchers } from './services/config.service'
import { stopAllLogStreams } from './services/log-stream.service'
import { ensurePathInitialized } from './services/path.util'
import { primeCpuSampler, primeGpuSampler } from './services/sys-metrics.service'

let mainWindow: BrowserWindow | null = null

function resolveAppIcon(): string | undefined {
  const candidates = [
    // Packaged: extraResources
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'resources', 'icon.ico'),
    // Dev: project root resources/
    join(app.getAppPath(), 'resources', 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
    join(process.cwd(), 'resources', 'icon.ico')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(): void {
  const icon = resolveAppIcon()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#09090b',
    title: 'PM2 Control Panel',
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Merge User+Machine PATH so node/npm/pm2 are visible when launched from GUI
  ensurePathInitialized()
  primeCpuSampler()
  primeGpuSampler()
  // Second sample shortly after so the first UI poll has a real CPU delta
  setTimeout(() => primeCpuSampler(), 400)
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopAllLogStreams()
  stopAllConfigWatchers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopAllLogStreams()
  stopAllConfigWatchers()
})
