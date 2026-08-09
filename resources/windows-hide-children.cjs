/**
 * Loaded into PM2 Node apps via NODE_OPTIONS=--require=...
 *
 * Aggressively hides Windows console windows for child processes:
 *  - forces windowsHide: true on all child_process APIs
 *  - rewrites `cmd /c start ...` → `start /B` (no new console)
 *  - rewrites PowerShell Start-Process to use -WindowStyle Hidden
 */
'use strict'

if (process.platform === 'win32') {
  const cp = require('child_process')
  const path = require('path')

  function forceHide(options) {
    const opts = options && typeof options === 'object' ? Object.assign({}, options) : {}
    opts.windowsHide = true
    // Avoid inheriting a visible console
    if (opts.stdio === 'inherit') {
      opts.stdio = ['pipe', 'pipe', 'pipe']
    }
    return opts
  }

  function basenameOf(cmd) {
    if (typeof cmd !== 'string') return ''
    return path.basename(cmd).toLowerCase()
  }

  /**
   * `cmd.exe /c start ...` always opens a new window unless /B is used.
   * Rewrite to insert /B after `start`.
   */
  function rewriteCmdStartArgs(args) {
    if (!Array.isArray(args) || args.length === 0) return args
    const out = args.slice()
    for (let i = 0; i < out.length; i++) {
      const a = String(out[i]).toLowerCase()
      if (a === 'start') {
        // already has /B?
        const next = String(out[i + 1] || '').toUpperCase()
        if (next !== '/B') {
          out.splice(i + 1, 0, '/B')
        }
        break
      }
    }
    return out
  }

  /** Rewrite shell command strings that use `start` without /B */
  function rewriteShellCommand(command) {
    if (typeof command !== 'string') return command
    // start "title" cmd  OR  start cmd
    // Avoid double-/B
    if (/\bstart\s+\/b\b/i.test(command)) return command
    return command.replace(/\bstart\s+/i, 'start /B ')
  }

  function rewritePowershell(command) {
    if (typeof command !== 'string') return command
    if (!/start-process/i.test(command)) return command
    if (/windowstyle/i.test(command)) return command
    // Start-Process foo → Start-Process foo -WindowStyle Hidden
    return command.replace(
      /Start-Process\b/gi,
      'Start-Process -WindowStyle Hidden'
    )
  }

  function prepareSpawn(command, args, options) {
    let cmd = command
    let a = args
    let opts = forceHide(options)

    const base = basenameOf(cmd)
    if (base === 'cmd.exe' || base === 'cmd') {
      a = rewriteCmdStartArgs(Array.isArray(a) ? a : [])
    }
    if (base === 'powershell.exe' || base === 'powershell' || base === 'pwsh.exe' || base === 'pwsh') {
      if (Array.isArray(a)) {
        a = a.map((x) =>
          typeof x === 'string' ? rewritePowershell(x) : x
        )
      }
    }

    // Never allow an explicit windowsHide: false to win
    opts.windowsHide = true
    return { cmd, args: a, opts }
  }

  // ── spawn ──────────────────────────────────────────────
  const origSpawn = cp.spawn
  cp.spawn = function (command, args, options) {
    if (args != null && !Array.isArray(args)) {
      options = args
      args = undefined
    }
    const p = prepareSpawn(command, args, options)
    if (p.args === undefined) {
      return origSpawn.call(this, p.cmd, p.opts)
    }
    return origSpawn.call(this, p.cmd, p.args, p.opts)
  }
  Object.setPrototypeOf(cp.spawn, origSpawn)

  // ── spawnSync ──────────────────────────────────────────
  if (typeof cp.spawnSync === 'function') {
    const orig = cp.spawnSync
    cp.spawnSync = function (command, args, options) {
      if (args != null && !Array.isArray(args)) {
        options = args
        args = undefined
      }
      const p = prepareSpawn(command, args, options)
      if (p.args === undefined) return orig.call(this, p.cmd, p.opts)
      return orig.call(this, p.cmd, p.args, p.opts)
    }
  }

  // ── exec ───────────────────────────────────────────────
  const origExec = cp.exec
  cp.exec = function (command, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = undefined
    }
    let cmd = rewriteShellCommand(String(command || ''))
    cmd = rewritePowershell(cmd)
    return origExec.call(this, cmd, forceHide(options), callback)
  }

  if (typeof cp.execSync === 'function') {
    const orig = cp.execSync
    cp.execSync = function (command, options) {
      let cmd = rewriteShellCommand(String(command || ''))
      cmd = rewritePowershell(cmd)
      return orig.call(this, cmd, forceHide(options))
    }
  }

  // ── execFile ───────────────────────────────────────────
  const origExecFile = cp.execFile
  cp.execFile = function (file, args, options, callback) {
    if (typeof args === 'function') {
      callback = args
      args = undefined
      options = undefined
    } else if (args && !Array.isArray(args)) {
      callback = options
      options = args
      args = undefined
    } else if (typeof options === 'function') {
      callback = options
      options = undefined
    }
    const p = prepareSpawn(file, args, options)
    if (p.args === undefined) {
      return origExecFile.call(this, p.cmd, p.opts, callback)
    }
    return origExecFile.call(this, p.cmd, p.args, p.opts, callback)
  }

  if (typeof cp.execFileSync === 'function') {
    const orig = cp.execFileSync
    cp.execFileSync = function (file, args, options) {
      if (args && !Array.isArray(args)) {
        options = args
        args = undefined
      }
      const p = prepareSpawn(file, args, options)
      if (p.args === undefined) return orig.call(this, p.cmd, p.opts)
      return orig.call(this, p.cmd, p.args, p.opts)
    }
  }

  // ── fork ───────────────────────────────────────────────
  const origFork = cp.fork
  cp.fork = function (modulePath, args, options) {
    if (args && !Array.isArray(args)) {
      options = args
      args = undefined
    }
    const opts = forceHide(options)
    if (args === undefined) return origFork.call(this, modulePath, opts)
    return origFork.call(this, modulePath, args, opts)
  }
}
