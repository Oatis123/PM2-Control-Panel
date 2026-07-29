/**
 * Mirrors tools.resolver PM2 detection strategies.
 */
import { execFile, execFileSync, exec } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

function refreshWindowsPath() {
  const readPath = (root, key) => {
    try {
      const out = execFileSync('reg', ['query', `${root}\\${key}`, '/v', 'Path'], {
        encoding: 'utf8',
        windowsHide: true
      })
      return out.match(/Path\s+REG_\w+\s+(.+)/i)?.[1]?.trim() ?? ''
    } catch {
      return ''
    }
  }
  const expand = (v) =>
    v.replace(/%([^%]+)%/g, (_, n) => process.env[n] ?? process.env[n.toUpperCase()] ?? `%${n}%`)
  const extras = [
    join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
    join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm')
  ].filter((p) => existsSync(p))
  const parts = [
    ...extras,
    ...expand(readPath('HKCU', 'Environment')).split(';'),
    ...expand(
      readPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager', 'Environment')
    ).split(';'),
    ...(process.env.PATH || '').split(';')
  ]
    .map((p) => p.trim())
    .filter(Boolean)
  const seen = new Set()
  process.env.PATH = parts
    .filter((p) => {
      const k = p.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join(delimiter)
}

async function resolveCommand(command) {
  try {
    const { stdout } = await execFileAsync('where.exe', [command], {
      windowsHide: true,
      env: process.env
    })
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    return (
      lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
      lines.find((l) => /\.(cmd|bat)$/i.test(l)) ||
      lines[0] ||
      null
    )
  } catch {
    return null
  }
}

function findPm2Entry() {
  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const roots = [
    join(appData, 'npm', 'node_modules'),
    'C:\\Program Files\\nodejs\\node_modules'
  ]
  for (const root of roots) {
    for (const rel of ['pm2/bin/pm2', 'pm2/bin/pm2.js']) {
      const p = join(root, ...rel.split('/'))
      if (existsSync(p)) return p
    }
  }
  return null
}

function extractVersion(text) {
  const matches = text.match(/\bv?\d+\.\d+\.\d+\b/gi)
  if (matches?.length) return matches[matches.length - 1].replace(/^v/i, '')
  return null
}

refreshWindowsPath()

const node = await resolveCommand('node')
const npm = await resolveCommand('npm')
const pm2Cmd = await resolveCommand('pm2')
const pm2Entry = findPm2Entry()

console.log({ node, npm, pm2Cmd, pm2Entry })

// Strategy 1: node pm2Entry -v
if (node && pm2Entry) {
  try {
    const { stdout, stderr } = await execFileAsync(node, [pm2Entry, '-v'], {
      windowsHide: true,
      timeout: 30000,
      env: process.env
    })
    console.log('strategy1 node+entry OK', extractVersion(stdout || stderr))
  } catch (e) {
    console.log('strategy1 FAIL', e.message, extractVersion(`${e.stdout}\n${e.stderr}`))
  }
}

// Strategy 2: shell pm2.cmd
if (pm2Cmd) {
  try {
    const { stdout, stderr } = await execAsync(`"${pm2Cmd}" -v`, {
      windowsHide: true,
      timeout: 30000,
      env: process.env,
      shell: process.env.ComSpec
    })
    console.log('strategy2 cmd OK', extractVersion(stdout || stderr))
  } catch (e) {
    console.log('strategy2 FAIL', e.message)
  }
}

// Strategy 3: package.json
if (pm2Entry) {
  const pkg = join(pm2Entry, '..', '..', 'package.json')
  if (existsSync(pkg)) {
    console.log('strategy3 package.json OK', JSON.parse(readFileSync(pkg, 'utf8')).version)
  }
}
