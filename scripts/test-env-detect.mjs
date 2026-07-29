/**
 * Smoke test matching electron/main/services/path.util.ts behavior.
 * Run: node scripts/test-env-detect.mjs
 */
import { exec, execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

function refreshWindowsPath() {
  if (process.platform !== 'win32') return
  const readPath = (root, key) => {
    try {
      const out = execFileSync('reg', ['query', `${root}\\${key}`, '/v', 'Path'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000
      })
      const match = out.match(/Path\s+REG_\w+\s+(.+)/i)
      return match?.[1]?.trim() ?? ''
    } catch {
      return ''
    }
  }
  const expand = (value) =>
    value.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? process.env[name.toUpperCase()] ?? `%${name}%`)

  const machine = readPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager', 'Environment')
  const user = readPath('HKCU', 'Environment')
  const extras = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
    join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm')
  ].filter((p) => existsSync(p))

  const parts = [
    ...extras,
    ...expand(user).split(';'),
    ...expand(machine).split(';'),
    ...(process.env.PATH ?? '').split(';')
  ]
    .map((p) => p.trim())
    .filter(Boolean)

  const seen = new Set()
  const merged = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(p)
  }
  process.env.PATH = merged.join(delimiter)
}

async function resolveCommand(command) {
  try {
    const { stdout } = await execFileAsync('where.exe', [command], {
      windowsHide: true,
      timeout: 10_000,
      env: process.env
    })
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const exe = lines.find((l) => l.toLowerCase().endsWith('.exe'))
    const cmd = lines.find((l) => l.toLowerCase().endsWith('.cmd') || l.toLowerCase().endsWith('.bat'))
    return exe ?? cmd ?? lines[0] ?? null
  } catch {
    return null
  }
}

function quoteWindowsArg(arg) {
  if (!/[\s&<>|^()"]/g.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

async function runCommand(command, args) {
  const resolved = await resolveCommand(command)
  if (!resolved) throw new Error(`not found: ${command}`)

  const isExe = resolved.toLowerCase().endsWith('.exe')
  if (isExe) {
    const { stdout, stderr } = await execFileAsync(resolved, args, {
      windowsHide: true,
      timeout: 30_000,
      env: process.env
    })
    return (stdout || stderr || '').trim()
  }

  const cmdline = [`"${resolved}"`, ...args.map(quoteWindowsArg)].join(' ')
  const { stdout, stderr } = await execAsync(cmdline, {
    windowsHide: true,
    timeout: 30_000,
    env: process.env,
    shell: process.env.ComSpec || true
  })
  return (stdout || stderr || '').trim()
}

refreshWindowsPath()

console.log('--- resolve ---')
for (const name of ['node', 'npm', 'pm2']) {
  console.log(name, '=>', await resolveCommand(name))
}

console.log('--- versions ---')
let allOk = true
for (const [name, args] of [
  ['node', ['-v']],
  ['npm', ['-v']],
  ['pm2', ['-v']]
]) {
  try {
    const out = await runCommand(name, args)
    const ver = out.match(/\bv?\d+\.\d+\.\d+\b/i)?.[0] ?? out.split(/\r?\n/).pop()
    console.log(name, 'OK', ver)
  } catch (e) {
    allOk = false
    console.log(name, 'FAIL', e.message)
  }
}

process.exit(allOk ? 0 : 1)
