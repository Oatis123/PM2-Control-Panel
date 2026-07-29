import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ensurePathInitialized, resolveCommand, runCommand } from './path.util'

export interface ResolvedTools {
  node: string | null
  npm: string | null
  /** Absolute path to pm2 CLI entry (bin/pm2), run via node */
  pm2Entry: string | null
  pm2Cmd: string | null
}

let cache: ResolvedTools | null = null

function npmGlobalRoots(): string[] {
  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const userProfile = process.env.USERPROFILE ?? homedir()

  const roots = [
    join(appData, 'npm', 'node_modules'),
    join(localAppData, 'npm', 'node_modules'),
    join(userProfile, 'AppData', 'Roaming', 'npm', 'node_modules'),
    // npm prefix sometimes is under nvm / fnm / volta
    join(userProfile, 'scoop', 'persist', 'nodejs', 'bin', 'node_modules'),
    'C:\\Program Files\\nodejs\\node_modules'
  ]

  // Also try `npm root -g` via env if already known later
  return roots
}

function findPm2Entry(): string | null {
  const candidates: string[] = []

  for (const root of npmGlobalRoots()) {
    candidates.push(join(root, 'pm2', 'bin', 'pm2'))
    candidates.push(join(root, 'pm2', 'bin', 'pm2.js'))
    candidates.push(join(root, 'pm2', 'lib', 'binaries', 'CLI.js'))
  }

  // Relative to resolved npm.cmd directory
  // e.g. C:\Users\..\AppData\Roaming\npm\pm2.cmd → sibling node_modules
  // handled below after resolveCommand

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function findPm2NearNpm(npmPath: string | null): string | null {
  if (!npmPath) return null
  // npm.cmd is in .../nodejs/ or .../npm/
  const dir = npmPath.replace(/[\\/][^\\/]+$/, '')
  const near = [
    join(dir, 'node_modules', 'pm2', 'bin', 'pm2'),
    join(dir, '..', 'node_modules', 'pm2', 'bin', 'pm2'),
    // global npm prefix layout: APPDATA/npm/npm.cmd + APPDATA/npm/node_modules/pm2
    join(dir, 'node_modules', 'pm2', 'bin', 'pm2')
  ]
  for (const c of near) {
    if (existsSync(c)) return c
  }
  return null
}

export async function resolveTools(force = false): Promise<ResolvedTools> {
  if (cache && !force) return cache
  ensurePathInitialized()

  const [node, npm, pm2Cmd] = await Promise.all([
    resolveCommand('node'),
    resolveCommand('npm'),
    resolveCommand('pm2')
  ])

  const pm2Entry = findPm2Entry() ?? findPm2NearNpm(npm) ?? findPm2NearNpm(pm2Cmd)

  cache = { node, npm, pm2Entry, pm2Cmd }
  return cache
}

export function clearToolsCache(): void {
  cache = null
}

function extractVersion(text: string, preferNodeStyle = false): string | null {
  const cleaned = text.trim()
  if (!cleaned) return null

  // Take last semver-looking token (pm2 prints banners first)
  const matches = cleaned.match(/\bv?\d+\.\d+\.\d+\b/gi)
  if (matches && matches.length > 0) {
    const raw = matches[matches.length - 1]
    if (preferNodeStyle) {
      return raw.startsWith('v') ? raw : `v${raw}`
    }
    return raw.replace(/^v/i, '')
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[') && !/spawning|daemon|successfully/i.test(l))
  return lines[lines.length - 1] ?? null
}

/**
 * Run command capturing stdout even when exit code != 0.
 */
async function tryVersion(
  runner: () => Promise<{ stdout: string; stderr: string }>
): Promise<string | null> {
  try {
    const { stdout, stderr } = await runner()
    return extractVersion(stdout || stderr || '')
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const text = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`
    return extractVersion(text)
  }
}

export async function detectNodeVersion(): Promise<string | null> {
  const tools = await resolveTools()
  if (!tools.node) return null

  return tryVersion(async () => {
    const r = await runCommand('node', ['-v'], { timeout: 15_000 })
    return r
  })
}

export async function detectNpmVersion(): Promise<string | null> {
  const tools = await resolveTools()
  if (!tools.npm) return null

  return tryVersion(async () => {
    const r = await runCommand('npm', ['-v'], { timeout: 20_000 })
    return r
  })
}

/**
 * Detect PM2 with multiple strategies — Windows .cmd shims are unreliable under Electron.
 */
export async function detectPm2Version(): Promise<string | null> {
  const tools = await resolveTools(true)

  // Strategy 1: node <pm2-entry> -v  (best on Windows)
  if (tools.node && tools.pm2Entry) {
    const viaNode = await tryVersion(async () => {
      // Use execFile path through runCommand: pass node with absolute script path
      const r = await runCommand(tools.node!, [tools.pm2Entry!, '-v'], { timeout: 30_000 })
      return r
    })
    if (viaNode) return viaNode
  }

  // Strategy 2: pm2.cmd / PATH shim
  if (tools.pm2Cmd) {
    const viaCmd = await tryVersion(async () => {
      const r = await runCommand('pm2', ['-v'], { timeout: 30_000 })
      return r
    })
    if (viaCmd) return viaCmd
  }

  // Strategy 3: package.json of global install
  if (tools.pm2Entry) {
    try {
      // .../pm2/bin/pm2 → .../pm2/package.json
      const pkgPath = join(tools.pm2Entry, '..', '..', 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
        if (pkg.version) return pkg.version
      }
    } catch {
      // ignore
    }
  }

  for (const root of npmGlobalRoots()) {
    const pkgPath = join(root, 'pm2', 'package.json')
    if (!existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      // ignore
    }
  }

  // Strategy 4: npm list -g pm2
  if (tools.npm) {
    const fromNpm = await tryVersion(async () => {
      const r = await runCommand('npm', ['list', '-g', 'pm2', '--depth=0'], { timeout: 30_000 })
      return r
    })
    // npm list prints like: `-- pm2@6.0.14` — extractVersion handles it
    if (fromNpm) return fromNpm
  }

  return null
}

/**
 * Preferred way to invoke PM2 CLI args on all platforms.
 */
export async function runPm2Cli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const tools = await resolveTools()

  if (tools.node && tools.pm2Entry) {
    try {
      return await runCommand(tools.node, [tools.pm2Entry, ...args], {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024
      })
    } catch (error) {
      // fall through to shim
      const err = error as Error
      // If entry exists, rethrow — shim unlikely to help for real PM2 errors
      if (existsSync(tools.pm2Entry)) throw err
    }
  }

  if (tools.pm2Cmd || (await resolveCommand('pm2'))) {
    return runCommand('pm2', args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 })
  }

  throw new Error(
    'PM2 not found. Install with: npm install -g pm2  (or use Check / Install in the app)'
  )
}
