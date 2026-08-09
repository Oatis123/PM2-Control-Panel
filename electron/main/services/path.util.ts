import { exec, execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

let pathInitialized = false

/**
 * Read Machine + User PATH from the Windows registry and merge into process.env.
 * Electron GUI launches often miss User PATH entries (Node, npm global, etc.).
 */
export function refreshWindowsPath(): void {
  if (process.platform !== 'win32') return

  try {
    const readPath = (root: string, key: string): string => {
      try {
        const out = execFileSync(
          'reg',
          ['query', `${root}\\${key}`, '/v', 'Path'],
          { encoding: 'utf8', windowsHide: true, timeout: 5000 }
        )
        // REG_EXPAND_SZ or REG_SZ line: "    Path    REG_EXPAND_SZ    C:\..."
        const match = out.match(/Path\s+REG_\w+\s+(.+)/i)
        return match?.[1]?.trim() ?? ''
      } catch {
        return ''
      }
    }

    const machine = readPath(
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager',
      'Environment'
    )
    const user = readPath('HKCU', 'Environment')

    const expand = (value: string): string => {
      return value.replace(/%([^%]+)%/g, (_, name: string) => {
        const upper = name.toUpperCase()
        if (upper === 'USERPROFILE') return process.env.USERPROFILE ?? homedir()
        if (upper === 'SYSTEMROOT' || upper === 'WINDIR') {
          return process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
        }
        if (upper === 'PROGRAMFILES') return process.env.ProgramFiles ?? 'C:\\Program Files'
        if (upper === 'PROGRAMFILES(X86)') {
          return process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
        }
        if (upper === 'LOCALAPPDATA') {
          return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
        }
        if (upper === 'APPDATA') {
          return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
        }
        return process.env[name] ?? process.env[upper] ?? `%${name}%`
      })
    }

    const parts = [
      ...expand(user).split(';'),
      ...expand(machine).split(';'),
      ...(process.env.PATH ?? '').split(';')
    ]
      .map((p) => p.trim())
      .filter(Boolean)

    // Common install locations that may be missing from PATH
    const extras = [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
      join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'nodejs'),
      join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm'),
      join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'nodejs'),
      join(homedir(), 'AppData', 'Roaming', 'npm'),
      join(homedir(), 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin'
    ].filter((p) => existsSync(p))

    const seen = new Set<string>()
    const merged: string[] = []
    for (const p of [...extras, ...parts]) {
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(p)
    }

    process.env.PATH = merged.join(delimiter)
  } catch {
    // keep existing PATH
  }
}

/** Idempotent PATH bootstrap for Electron main process. */
export function ensurePathInitialized(): void {
  if (pathInitialized) return
  refreshWindowsPath()
  pathInitialized = true
}

/** Force re-read PATH after installing tools. */
export function resetPathCache(): void {
  pathInitialized = false
}

export function getProcessEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    // Reduce accidental console noise from some Windows CLIs
    PYTHONUTF8: '1',
    NPM_CONFIG_PROGRESS: 'false',
    NPM_CONFIG_LOGLEVEL: 'error'
  }
}

/**
 * Resolve a CLI tool to an absolute executable path on Windows/Unix.
 * Handles .cmd / .bat shims used by npm global packages.
 */
export async function resolveCommand(command: string): Promise<string | null> {
  ensurePathInitialized()

  if (process.platform === 'win32') {
    try {
      // shell:true so where.exe is found; bare name is fine
      const { stdout } = await execFileAsync('where.exe', [command], {
        windowsHide: true,
        timeout: 10_000,
        env: getProcessEnv(),
        shell: false
      })
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)

      // Prefer .cmd for npm-shims when both exist without .exe (npm has no .exe sometimes)
      // Prefer .exe when available (node.exe)
      const exe = lines.find((l) => l.toLowerCase().endsWith('.exe'))
      const cmd = lines.find(
        (l) => l.toLowerCase().endsWith('.cmd') || l.toLowerCase().endsWith('.bat')
      )
      const pick = exe ?? cmd ?? lines[0]
      if (pick && existsSync(pick)) return pick
    } catch {
      // fall through
    }

    const pathDirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    const extensions = ['.exe', '.cmd', '.bat', '']
    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const candidate = join(dir, command + ext)
        if (existsSync(candidate)) return candidate
      }
    }

    const known = [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', `${command}.exe`),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', `${command}.cmd`),
      join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm', `${command}.cmd`),
      join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm', command)
    ]
    for (const candidate of known) {
      if (existsSync(candidate)) return candidate
    }

    return null
  }

  try {
    const { stdout } = await execFileAsync('which', [command], {
      timeout: 5_000,
      env: getProcessEnv()
    })
    const path = stdout.trim().split(/\r?\n/)[0]
    return path && existsSync(path) ? path : null
  } catch {
    return null
  }
}

function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""'
  // Already fully quoted
  if (arg.startsWith('"') && arg.endsWith('"')) return arg
  if (!/[\s&<>|^()"]/g.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

export interface RunResult {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Run a CLI command robustly on Windows (supports .cmd shims and paths with spaces).
 *
 * Windows note: npm/pm2 are .cmd files. execFile without shell cannot run them (ENOENT).
 * Prefer absolute .exe paths (e.g. node.exe + pm2 entry script) when possible.
 *
 * `command` may be a bare name (`npm`) or an absolute path (`C:\...\node.exe`).
 */
export async function runCommand(
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; cwd?: string }
): Promise<RunResult> {
  const timeout = options?.timeout ?? 60_000
  const maxBuffer = options?.maxBuffer ?? 10 * 1024 * 1024
  const env = getProcessEnv()
  const cwd = options?.cwd

  const looksAbsolute =
    command.includes('\\') || command.includes('/') || /^[a-zA-Z]:/.test(command)
  const resolved = looksAbsolute && existsSync(command) ? command : await resolveCommand(command)

  if (!resolved) {
    throw new Error(
      `Command not found: ${command}. Ensure it is installed and available in PATH.`
    )
  }

  try {
    if (process.platform === 'win32') {
      const isExe = resolved.toLowerCase().endsWith('.exe')

      // Always hide console windows for tools we launch from the panel
      const winOpts = {
        windowsHide: true as const,
        timeout,
        maxBuffer,
        env,
        cwd
      }

      if (isExe) {
        const { stdout, stderr } = await execFileAsync(resolved, args, winOpts)
        return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 }
      }

      // .cmd / .bat — run via cmd with hidden window (not a visible console)
      const cmdline = [`"${resolved}"`, ...args.map(quoteWindowsArg)].join(' ')
      const { stdout, stderr } = await execAsync(cmdline, {
        ...winOpts,
        shell: process.env.ComSpec || 'cmd.exe'
      })
      return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 }
    }

    const { stdout, stderr } = await execFileAsync(resolved, args, {
      timeout,
      maxBuffer,
      env,
      cwd
    })
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 }
  } catch (error) {
    const err = error as {
      stdout?: string
      stderr?: string
      message?: string
      code?: number | string
    }
    const message = err.stderr?.trim() || err.message || 'Command failed'
    const wrapped = new Error(message) as Error & { stdout?: string; stderr?: string }
    wrapped.stdout = err.stdout
    wrapped.stderr = err.stderr
    throw wrapped
  }
}
