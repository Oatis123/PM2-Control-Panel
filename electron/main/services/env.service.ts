import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { EnvComponent, EnvState, EnvVersions } from '../../../shared/types'
import {
  ensurePathInitialized,
  resetPathCache,
  resolveCommand,
  runCommand
} from './path.util'
import {
  clearToolsCache,
  detectNodeVersion,
  detectNpmVersion,
  detectPm2Version,
  resolveTools
} from './tools.resolver'

export { ensurePathInitialized } from './path.util'

export async function getVersions(): Promise<EnvVersions> {
  ensurePathInitialized()
  // Sequential: avoids racing pm2 daemon spawn with other shells on Windows
  const node = await detectNodeVersion()
  const npm = await detectNpmVersion()
  const pm2 = await detectPm2Version()
  return { node, npm, pm2 }
}

export async function checkEnvironment(): Promise<EnvState> {
  const versions = await getVersions()
  const missing: EnvComponent[] = []

  if (!versions.node) missing.push('node')
  if (!versions.npm) missing.push('npm')
  if (!versions.pm2) missing.push('pm2')

  if (missing.length === 0) {
    return {
      status: 'ready',
      versions,
      message: 'Environment ready'
    }
  }

  return {
    status: 'missing',
    versions,
    missing,
    message: `Missing: ${missing.join(', ')}`
  }
}

async function commandExists(name: string): Promise<boolean> {
  ensurePathInitialized()
  if (name === 'pm2') {
    const tools = await resolveTools(true)
    return Boolean(tools.pm2Entry || tools.pm2Cmd)
  }
  return (await resolveCommand(name)) !== null
}

async function installNodeWithWinget(
  onProgress?: (stage: string, message: string) => void
): Promise<void> {
  onProgress?.('winget', 'Installing Node.js via WinGet...')

  const winget = await resolveCommand('winget')
  if (!winget) {
    throw new Error(
      'WinGet not found. Install Node.js manually from https://nodejs.org and restart the app.'
    )
  }

  await runCommand(
    'winget',
    [
      'install',
      '-e',
      '--id',
      'OpenJS.NodeJS.LTS',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--silent'
    ],
    { timeout: 10 * 60_000 }
  )

  resetPathCache()
  clearToolsCache()
  ensurePathInitialized()
}

async function installPm2Global(
  onProgress?: (stage: string, message: string) => void
): Promise<void> {
  onProgress?.('pm2', 'Installing PM2 globally (npm install -g pm2)...')

  if (!(await commandExists('npm'))) {
    throw new Error('npm is not available; cannot install PM2')
  }

  await runCommand('npm', ['install', '-g', 'pm2'], { timeout: 5 * 60_000 })

  resetPathCache()
  clearToolsCache()
  ensurePathInitialized()

  const npmGlobal = join(
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'npm'
  )
  if (
    existsSync(npmGlobal) &&
    process.env.PATH &&
    !process.env.PATH.toLowerCase().includes(npmGlobal.toLowerCase())
  ) {
    process.env.PATH = `${npmGlobal};${process.env.PATH}`
  }
}

/**
 * Check environment and install missing pieces (Node via WinGet, PM2 via npm -g).
 */
export async function checkAndInstall(
  onProgress?: (stage: string, message: string) => void
): Promise<EnvState> {
  ensurePathInitialized()
  clearToolsCache()
  onProgress?.('check', 'Checking Node.js, npm and PM2...')

  let state = await checkEnvironment()
  if (state.status === 'ready') {
    onProgress?.('done', 'All components are installed')
    return state
  }

  const missing = new Set(state.missing ?? [])

  try {
    if (missing.has('node') || missing.has('npm')) {
      onProgress?.('install-node', 'Node.js / npm not found. Starting installation...')
      await installNodeWithWinget(onProgress)

      resetPathCache()
      clearToolsCache()
      ensurePathInitialized()
      state = await checkEnvironment()
      missing.clear()
      for (const m of state.missing ?? []) missing.add(m)
    }

    if (missing.has('npm') && !missing.has('node')) {
      return {
        status: 'error',
        versions: state.versions,
        missing: ['npm'],
        message: 'Node.js found but npm is missing. Reinstall Node.js from nodejs.org.'
      }
    }

    // Re-detect pm2 via all strategies before installing
    const pm2Version = await detectPm2Version()
    if (pm2Version) {
      missing.delete('pm2')
      const remaining = Array.from(missing)
      state = {
        ...state,
        versions: { ...state.versions, pm2: pm2Version },
        missing: remaining,
        status: remaining.length === 0 ? 'ready' : 'missing',
        message:
          remaining.length === 0 ? 'Environment ready' : `Missing: ${remaining.join(', ')}`
      }
      if (state.status === 'ready') {
        onProgress?.('done', 'Environment is ready')
        return state
      }
    }

    if (missing.has('pm2')) {
      if (!(await commandExists('npm'))) {
        return {
          status: 'error',
          versions: await getVersions(),
          missing: ['npm', 'pm2'],
          message: 'Cannot install PM2 without npm.'
        }
      }
      await installPm2Global(onProgress)
    }

    resetPathCache()
    clearToolsCache()
    ensurePathInitialized()
    onProgress?.('recheck', 'Re-checking environment...')
    state = await checkEnvironment()

    if (state.status === 'ready') {
      onProgress?.('done', 'Environment is ready')
      return state
    }

    return {
      ...state,
      status: state.missing?.length ? 'missing' : 'error',
      message:
        state.message ??
        'Some components are still missing. Try restarting the app or install manually.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const versions = await getVersions()
    return {
      status: 'error',
      versions,
      missing: state.missing,
      message
    }
  }
}
