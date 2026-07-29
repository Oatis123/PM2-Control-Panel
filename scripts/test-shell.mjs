import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

const npm = 'C:\\Program Files\\nodejs\\npm.cmd'
const pm2 = 'C:\\Users\\Oat\\AppData\\Roaming\\npm\\pm2.cmd'
const comspec = process.env.ComSpec || 'cmd.exe'

async function tryRun(label, fn) {
  try {
    const out = await fn()
    console.log(label, 'OK', String(out).trim().split(/\r?\n/).slice(-2).join(' | '))
  } catch (e) {
    console.log(label, 'FAIL', e.message.split(/\r?\n/)[0])
  }
}

await tryRun('1 execFile shell unquoted', async () => {
  const r = await execFileAsync(npm, ['-v'], { shell: true, windowsHide: true })
  return r.stdout
})

await tryRun('2 execFile shell quoted cmd', async () => {
  const r = await execFileAsync(`"${npm}"`, ['-v'], { shell: true, windowsHide: true })
  return r.stdout
})

await tryRun('3 exec quoted', async () => {
  const r = await execAsync(`"${npm}" -v`, { windowsHide: true })
  return r.stdout
})

await tryRun('4 cmd /c no /s', async () => {
  const r = await execFileAsync(comspec, ['/d', '/c', `"${npm}" -v`], {
    windowsHide: true
  })
  return r.stdout
})

await tryRun('5 cmd /c call', async () => {
  const r = await execFileAsync(comspec, ['/d', '/c', `call "${npm}" -v`], {
    windowsHide: true
  })
  return r.stdout
})

await tryRun('6 spawn npm via PATH shell', async () => {
  const r = await execFileAsync('npm', ['-v'], { shell: true, windowsHide: true })
  return r.stdout
})

await tryRun('7 pm2 cmd /c call', async () => {
  const r = await execFileAsync(comspec, ['/d', '/c', `call "${pm2}" -v`], {
    windowsHide: true
  })
  return r.stdout || r.stderr
})

await tryRun('8 node.exe direct', async () => {
  const r = await execFileAsync('C:\\Program Files\\nodejs\\node.exe', ['-v'], {
    windowsHide: true
  })
  return r.stdout
})
