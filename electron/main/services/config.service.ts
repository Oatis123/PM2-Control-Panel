import { readFile, stat } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { basename, dirname, resolve } from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import type { EcosystemApp, ParsedConfig } from '../../../shared/types'

/** Shared require cache (same as Node's module cache) */
const moduleRequire = createRequire(import.meta.url)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeApps(exported: unknown): EcosystemApp[] {
  let appsRaw: unknown

  if (Array.isArray(exported)) {
    appsRaw = exported
  } else if (isRecord(exported) && Array.isArray(exported.apps)) {
    appsRaw = exported.apps
  } else {
    throw new Error('Config must export { apps: [...] } or an array of apps')
  }

  const apps = (appsRaw as unknown[]).map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`App at index ${index} is not an object`)
    }
    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : `app-${index + 1}`

    // Only serializable fields over IPC
    const app: EcosystemApp = { name }
    if (typeof item.script === 'string') app.script = item.script
    if (typeof item.cwd === 'string') app.cwd = item.cwd
    if (item.instances !== undefined) app.instances = item.instances as number | string
    if (typeof item.exec_mode === 'string') app.exec_mode = item.exec_mode
    if (item.args !== undefined) app.args = item.args as string | string[]
    if (typeof item.interpreter === 'string') app.interpreter = item.interpreter
    if (isRecord(item.env)) {
      app.env = Object.fromEntries(
        Object.entries(item.env).map(([k, v]) => [k, String(v)])
      )
    }
    return app
  })

  if (apps.length === 0) {
    throw new Error('Config contains no apps')
  }

  return apps
}

/** Drop require.cache entries for this path (Windows case-insensitive). */
function bustRequireCache(absolutePath: string): void {
  const target = resolve(absolutePath)
  const targetLower = target.toLowerCase()
  const cache = moduleRequire.cache

  for (const key of Object.keys(cache)) {
    if (key === target || key.toLowerCase() === targetLower) {
      delete cache[key]
    }
  }
}

/**
 * Evaluate config source as CommonJS from fresh disk bytes — never reuse a cached module.
 */
function evaluateCommonJs(absolutePath: string, source: string): unknown {
  bustRequireCache(absolutePath)

  const fileRequire = createRequire(absolutePath)
  const moduleObj = { exports: {} as unknown }
  const dir = dirname(absolutePath)

  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'module',
    'exports',
    'require',
    '__dirname',
    '__filename',
    `${source}\n;return module.exports;`
  )

  return fn(moduleObj, moduleObj.exports, fileRequire, dir, absolutePath)
}

/**
 * Load ecosystem config — always reads the latest file content from disk.
 */
export async function readConfig(filePath: string): Promise<ParsedConfig> {
  const absolutePath = resolve(filePath)
  const fileName = basename(absolutePath)

  await stat(absolutePath)
  const source = await readFile(absolutePath, 'utf8')

  try {
    const exported = evaluateCommonJs(absolutePath, source)
    const apps = normalizeApps(exported)
    return {
      filePath: absolutePath,
      fileName,
      apps
    }
  } catch (cjsError) {
    // ESM configs: import with unique query string
    try {
      bustRequireCache(absolutePath)
      const href = `${pathToFileURL(absolutePath).href}?reload=${Date.now()}_${Math.random()}`
      const mod = await import(/* @vite-ignore */ href)
      const exported = mod.default ?? mod
      const apps = normalizeApps(exported)
      return {
        filePath: absolutePath,
        fileName,
        apps
      }
    } catch (esmError) {
      const message =
        cjsError instanceof Error
          ? cjsError.message
          : esmError instanceof Error
            ? esmError.message
            : 'Failed to parse config'
      throw new Error(`Failed to parse ${fileName}: ${message}`)
    }
  }
}

// ─── File watchers ──────────────────────────────────────────────────────────

const watchers = new Map<string, { watcher: FSWatcher; listeners: Set<() => void> }>()

function watchKey(filePath: string): string {
  return resolve(filePath).toLowerCase()
}

export function watchConfigFile(filePath: string, onChange: () => void): () => void {
  const absolutePath = resolve(filePath)
  const key = watchKey(absolutePath)

  let entry = watchers.get(key)
  if (!entry) {
    const listeners = new Set<() => void>()
    let debounce: ReturnType<typeof setTimeout> | null = null

    const attach = (): FSWatcher => {
      const watcher = watch(absolutePath, { persistent: true }, (eventType) => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          if (eventType === 'rename') {
            try {
              watcher.close()
            } catch {
              // ignore
            }
            watchers.delete(key)
            const current = Array.from(listeners)
            for (let i = 0; i < current.length; i++) {
              watchConfigFile(absolutePath, current[i])
            }
          }
          const notify = Array.from(listeners)
          for (let i = 0; i < notify.length; i++) {
            try {
              notify[i]()
            } catch {
              // ignore
            }
          }
        }, 250)
      })

      watcher.on('error', () => {
        // ignore
      })
      return watcher
    }

    entry = { watcher: attach(), listeners }
    watchers.set(key, entry)
  }

  entry.listeners.add(onChange)

  return () => {
    const current = watchers.get(key)
    if (!current) return
    current.listeners.delete(onChange)
    if (current.listeners.size === 0) {
      try {
        current.watcher.close()
      } catch {
        // ignore
      }
      watchers.delete(key)
    }
  }
}

export function stopAllConfigWatchers(): void {
  Array.from(watchers.values()).forEach((entry) => {
    try {
      entry.watcher.close()
    } catch {
      // ignore
    }
  })
  watchers.clear()
}
