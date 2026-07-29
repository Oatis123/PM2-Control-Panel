# PM2 Control Panel

Windows desktop app for managing PM2 processes through ecosystem config files.

## Stack

- Electron + Vite + React + TypeScript
- Tailwind CSS (monochrome theme)
- electron-store (session persistence)
- PM2 CLI via Main process (secure IPC)

## Development

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev mode with hot reload |
| `npm run build` | Compile main / preload / renderer |
| `npm run typecheck` | TypeScript check |
| `npm run dist` | Build NSIS Wizard installer (x64) |
| `npm run dist:dir` | Unpackaged win build (for smoke tests) |

## Installer (NSIS Wizard)

```bash
npm run dist
```

Output: `release/PM2 Control Panel-Setup-*.exe`

- Classic wizard (`oneClick: false`)
- Custom install directory
- Desktop + Start Menu shortcuts
- Monochrome app icon

## Features

- Multi-tab ecosystem configs + session restore
- Environment check / auto-install (Node via WinGet, PM2 via npm)
- Process table with live CPU / RAM / uptime / restarts
- Start / Stop / Restart / Delete (all + per-app)
- Live log streaming (`pm2 logs` + file tail fallback)
- Host monitors: CPU / GPU / RAM sparklines in header
- Secure Electron IPC (`contextIsolation`, no `nodeIntegration`)

## Sample config

```bash
# examples/ecosystem.config.js
```

Open it via **Open Config** or drag-and-drop into the window.

## Security

- `nodeIntegration: false`
- `contextIsolation: true`
- Preload `contextBridge` only (`window.api`)
