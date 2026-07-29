/// <reference types="vite/client" />

import type { WindowApi } from '../electron/preload/index'

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
