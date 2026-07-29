# PM2 Control Panel

**Desktop control center for PM2 on Windows** — manage ecosystem configs, processes, and logs in a clean monochrome UI.

> Multi-tab configs · live metrics · real-time logs · one-click installer

---

## Highlights

| | Feature |
|---|---|
| **Tabs** | Open several `ecosystem.config.js` files at once; session restores after restart |
| **Processes** | Start / Stop / Restart / Delete — all apps or one by one |
| **Metrics** | Status, CPU, RAM, uptime, restarts (poll every 2s) |
| **Logs** | Config-wide stream + per-process tab; stdout / stderr / search / autoscroll |
| **Host load** | Compact CPU · GPU · RAM sparklines in the header |
| **Env setup** | Detects Node / npm / PM2; can install via WinGet + `npm i -g pm2` |
| **Installer** | Classic NSIS wizard with custom path and product folder |

---

## Screenshots & UI

Monochrome zinc theme (`#09090b` / `#27272a` / `#f4f3f0`):

- Status bar with environment versions and system monitors  
- Process table with hollow / filled status dots (no loud colors)  
- Resizable log panel with **Config** and **Process** tabs  
- Drag-and-drop `.js` ecosystem files onto the window  

---

## Tech stack

```
Electron  ·  Vite  ·  React  ·  TypeScript
Tailwind CSS  ·  Lucide  ·  electron-store
```

| Layer | Role |
|-------|------|
| **Renderer** | React UI only |
| **Preload** | Strict `contextBridge` API (`window.api`) |
| **Main** | PM2 CLI, filesystem, WinGet, system metrics |

Security defaults: `nodeIntegration: false`, `contextIsolation: true`.

---

## Quick start

```bash
npm install
npm run dev
```

### Useful scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Dev server + Electron |
| `npm run build` | Production compile (main / preload / renderer) |
| `npm run typecheck` | TypeScript checks |
| `npm run dist` | NSIS Wizard installer → `release/` |
| `npm run dist:dir` | Unpacked Windows build (smoke test) |

---

## Installer

```bash
npm run dist
```

Artifact:

```text
release/PM2 Control Panel-Setup-0.1.0.exe
```

- Step-by-step wizard (not one-click)  
- Choose install directory — app always lands in a **`PM2 Control Panel`** subfolder  
- Desktop + Start Menu shortcuts  
- App icon for exe, taskbar, and installer  

---

## Sample config

Use the included example:

```text
examples/ecosystem.config.js
```

Open via **+** / **Open Config**, or drop the file into the window.

---

## Architecture (short)

```text
┌─────────────────────────────────────┐
│  Renderer (React + Tailwind)        │
│  tabs · table · logs · monitors     │
└──────────────────▲──────────────────┘
                   │  window.api
┌──────────────────▼──────────────────┐
│  Main process                       │
│  PM2 · config parse · env · metrics │
└─────────────────────────────────────┘
```

---

## Project layout

```text
electron/          Main + preload + services
src/               React UI
shared/            Shared types & IPC channels
resources/         icon.ico, installer.nsh
examples/          Sample ecosystem config
```

---

## License

MIT

---

Made with ❤️
