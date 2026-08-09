import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdtemp, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, join, resolve, delimiter } from 'path'
import { createRequire } from 'module'

const moduleRequire = createRequire(import.meta.url)

export function resolveWindowsHideScript(): string | null {
  if (process.platform !== 'win32') return null

  const candidates = [
    join(process.resourcesPath, 'windows-hide-children.cjs'),
    join(process.resourcesPath, 'resources', 'windows-hide-children.cjs'),
    join(__dirname, '../../resources/windows-hide-children.cjs'),
    join(process.cwd(), 'resources', 'windows-hide-children.cjs')
  ]

  try {
    candidates.push(join(app.getAppPath(), 'resources', 'windows-hide-children.cjs'))
  } catch {
    // ignore
  }

  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}

/** Directory that contains sitecustomize.py for Python apps */
export function resolvePythonHideDir(): string | null {
  if (process.platform !== 'win32') return null

  const candidates = [
    join(process.resourcesPath, 'python-hide-console'),
    join(process.resourcesPath, 'resources', 'python-hide-console'),
    join(__dirname, '../../resources/python-hide-console'),
    join(process.cwd(), 'resources', 'python-hide-console')
  ]

  try {
    candidates.push(join(app.getAppPath(), 'resources', 'python-hide-console'))
  } catch {
    // ignore
  }

  for (const p of candidates) {
    if (p && existsSync(join(p, 'sitecustomize.py'))) return p
  }
  return null
}

function requireFlagFor(scriptPath: string): string {
  return `--require=${scriptPath.replace(/\\/g, '/')}`
}

function mergeNodeOptions(existing: unknown, requireFlag: string): string {
  const cur = typeof existing === 'string' ? existing.trim() : ''
  if (cur.includes('windows-hide-children')) return cur
  return cur ? `${cur} ${requireFlag}` : requireFlag
}

function mergeNodeArgs(existing: unknown, requireFlag: string): string | string[] {
  if (Array.isArray(existing)) {
    const flat = existing.map(String)
    if (flat.some((x) => x.includes('windows-hide-children'))) return flat
    return [requireFlag, ...flat]
  }
  if (typeof existing === 'string' && existing.trim()) {
    if (existing.includes('windows-hide-children')) return existing
    return `${requireFlag} ${existing}`
  }
  return requireFlag
}

function mergePythonPath(existing: unknown, hideDir: string): string {
  const cur = typeof existing === 'string' ? existing.trim() : ''
  const norm = hideDir.replace(/\//g, '\\')
  if (cur.toLowerCase().split(delimiter).some((p) => p.toLowerCase() === norm.toLowerCase())) {
    return cur
  }
  // Put our dir first so sitecustomize.py is found
  return cur ? `${norm}${delimiter}${cur}` : norm
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export type AppRuntime = 'node' | 'python' | 'other'

export function detectAppRuntime(app: Record<string, unknown>): AppRuntime {
  const script = typeof app.script === 'string' ? app.script : ''
  const interpreter =
    app.interpreter === undefined || app.interpreter === null
      ? ''
      : String(app.interpreter).trim()

  if (interpreter) {
    const low = interpreter.toLowerCase().replace(/\\/g, '/')
    const base = low.split('/').pop() || low
    if (
      base.includes('python') ||
      base.startsWith('python') ||
      base === 'py.exe' ||
      base === 'py'
    ) {
      return 'python'
    }
    if (base.includes('node') || base === 'nodejs') {
      return 'node'
    }
    return 'other'
  }

  if (/\.pyw?$/i.test(script)) return 'python'
  if (/\.(php|rb|pl|sh|bash|cmd|bat|ps1)$/i.test(script)) return 'other'
  if (/\.(js|cjs|mjs|ts|mts|cts)$/i.test(script)) return 'node'

  // PM2 default interpreter is node
  return 'node'
}

function bustCache(absolutePath: string): void {
  const target = resolve(absolutePath).toLowerCase()
  for (const key of Object.keys(moduleRequire.cache)) {
    if (key.toLowerCase() === target) {
      delete moduleRequire.cache[key]
    }
  }
}

function evaluateConfig(absolutePath: string, source: string): unknown {
  bustCache(absolutePath)
  const fileRequire = createRequire(absolutePath)
  const moduleObj = { exports: {} as unknown }
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'module',
    'exports',
    'require',
    '__dirname',
    '__filename',
    `${source}\n;return module.exports;`
  )
  return fn(moduleObj, moduleObj.exports, fileRequire, dirname(absolutePath), absolutePath)
}

function patchEnvBlock(
  block: Record<string, unknown>,
  runtime: AppRuntime,
  nodeRequireFlag: string | null,
  pythonHideDir: string | null
): Record<string, unknown> {
  const env = { ...block }

  if (runtime === 'node' && nodeRequireFlag) {
    env.NODE_OPTIONS = mergeNodeOptions(env.NODE_OPTIONS, nodeRequireFlag)
  }

  if (runtime === 'python' && pythonHideDir) {
    env.PYTHONPATH = mergePythonPath(env.PYTHONPATH, pythonHideDir)
    // Ensure site module runs (default); avoid -S
    // Prefer pythonw if user used python.exe — do not rewrite interpreter path here
  }

  return env
}

function patchApp(
  app: Record<string, unknown>,
  nodeRequireFlag: string | null,
  pythonHideDir: string | null
): void {
  const runtime = detectAppRuntime(app)
  app.windowsHide = true

  // Prefer pythonw for console-less Python host process (if they used python.exe)
  if (runtime === 'python' && typeof app.interpreter === 'string') {
    const interp = app.interpreter
    if (/python\.exe$/i.test(interp) && !/pythonw\.exe$/i.test(interp)) {
      const pythonw = interp.replace(/python\.exe$/i, 'pythonw.exe')
      if (existsSync(pythonw)) {
        app.interpreter = pythonw
      }
    }
  }

  if (runtime === 'node' && nodeRequireFlag) {
    app.node_args = mergeNodeArgs(app.node_args, nodeRequireFlag)
  }

  // Never set node_args for non-node (that broke Python before)

  const env = isRecord(app.env) ? { ...app.env } : {}
  app.env = patchEnvBlock(env, runtime, nodeRequireFlag, pythonHideDir)

  for (const key of Object.keys(app)) {
    if (!key.startsWith('env_')) continue
    if (!isRecord(app[key])) continue
    app[key] = patchEnvBlock(
      { ...(app[key] as Record<string, unknown>) },
      runtime,
      nodeRequireFlag,
      pythonHideDir
    )
  }
}

/**
 * Temp ecosystem: Node → NODE_OPTIONS require patch; Python → PYTHONPATH sitecustomize.
 */
export async function buildWindowsHiddenStartConfig(
  originalConfigPath: string,
  _onlyAppName?: string
): Promise<string> {
  const absolutePath = resolve(originalConfigPath)
  if (process.platform !== 'win32') return absolutePath

  const hideScript = resolveWindowsHideScript()
  const pythonHideDir = resolvePythonHideDir()
  const nodeRequireFlag = hideScript ? requireFlagFor(hideScript) : null

  if (!nodeRequireFlag && !pythonHideDir) {
    return absolutePath
  }

  let exported: unknown
  try {
    const source = await readFile(absolutePath, 'utf8')
    exported = evaluateConfig(absolutePath, source)
  } catch {
    return absolutePath
  }

  let apps: unknown[]
  let wrapper: Record<string, unknown> | null = null

  if (Array.isArray(exported)) {
    apps = exported
  } else if (isRecord(exported) && Array.isArray(exported.apps)) {
    wrapper = { ...exported }
    apps = [...(exported.apps as unknown[])]
  } else {
    return absolutePath
  }

  const patchedApps: unknown[] = []
  for (const item of apps) {
    if (!isRecord(item)) {
      patchedApps.push(item)
      continue
    }
    const clone = { ...item }
    patchApp(clone, nodeRequireFlag, pythonHideDir)
    patchedApps.push(clone)
  }

  const outObj = wrapper ? { ...wrapper, apps: patchedApps } : patchedApps
  const dir = await mkdtemp(join(tmpdir(), 'pm2-cp-'))
  const outPath = join(dir, `start-${basename(absolutePath)}.cjs`)

  const body = `/** Auto-generated by PM2 Control Panel — do not edit */\nmodule.exports = ${JSON.stringify(
    outObj,
    null,
    2
  )}\n`

  await writeFile(outPath, body, 'utf8')
  return outPath
}

/** No-op: never inject CLI --node-args (breaks Python). */
export function injectWindowsHideNodeArgs(pm2Args: string[]): string[] {
  return pm2Args
}
