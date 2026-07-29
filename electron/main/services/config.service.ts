import { readFile } from 'fs/promises'
import { basename } from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import type { EcosystemApp, ParsedConfig } from '../../../shared/types'

const nodeRequire = createRequire(import.meta.url)

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
    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : `app-${index + 1}`

    return {
      ...item,
      name
    } as EcosystemApp
  })

  if (apps.length === 0) {
    throw new Error('Config contains no apps')
  }

  return apps
}

/**
 * Load ecosystem config. Uses dynamic import for ESM/CJS interop via file URL.
 * Falls back to a lightweight module.exports scrape if import fails.
 */
export async function readConfig(filePath: string): Promise<ParsedConfig> {
  const fileName = basename(filePath)

  try {
    const href = pathToFileURL(filePath).href + `?t=${Date.now()}`
    const mod = await import(href)
    const exported = mod.default ?? mod
    const apps = normalizeApps(exported)
    return { filePath, fileName, apps }
  } catch (importError) {
    // Fallback: evaluate as CommonJS-like text in a constrained Function scope
    try {
      const source = await readFile(filePath, 'utf8')
      const module = { exports: {} as unknown }
      const exports = module.exports
      // eslint-disable-next-line no-new-func
      const fn = new Function('module', 'exports', 'require', `${source}\n;return module.exports;`)
      const exported = fn(module, exports, nodeRequire)
      const apps = normalizeApps(exported)
      return { filePath, fileName, apps }
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : importError instanceof Error
            ? importError.message
            : 'Failed to parse config'
      throw new Error(`Failed to parse ${fileName}: ${message}`)
    }
  }
}
