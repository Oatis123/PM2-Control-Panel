import { execFile } from 'child_process'
import { promisify } from 'util'
const p = promisify(execFile)

for (const name of ['node', 'npm', 'pm2', 'where']) {
  try {
    const r = await p(name, name === 'where' ? ['pm2'] : ['-v'], {
      shell: true,
      windowsHide: true,
      timeout: 30000,
      env: process.env
    })
    console.log(name, 'OK', (r.stdout || r.stderr || '').trim().split(/\r?\n/).slice(-2).join(' | '))
  } catch (e) {
    console.log(name, 'FAIL', e.message.split(/\r?\n/)[0])
  }
}

// quoted full path shell true
const npm = 'C:\\Program Files\\nodejs\\npm.cmd'
const pm2 = 'C:\\Users\\Oat\\AppData\\Roaming\\npm\\pm2.cmd'
for (const bin of [npm, pm2]) {
  try {
    const r = await p(`"${bin}"`, ['-v'], { shell: true, windowsHide: true, timeout: 30000 })
    console.log('quoted', bin, 'OK', (r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' | '))
  } catch (e) {
    console.log('quoted', bin, 'FAIL', e.message.split(/\r?\n/)[0])
  }
}
