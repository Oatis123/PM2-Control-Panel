import Store from 'electron-store'
import type { SessionState } from '../../../shared/types'

const defaults: SessionState = {
  tabs: [],
  activeTabId: null
}

const store = new Store<{ session: SessionState }>({
  name: 'pm2-control-panel',
  defaults: {
    session: defaults
  }
})

export function getSession(): SessionState {
  const session = store.get('session', defaults)
  return {
    tabs: Array.isArray(session.tabs) ? session.tabs : [],
    activeTabId: session.activeTabId ?? null
  }
}

export function setSession(session: SessionState): SessionState {
  const next: SessionState = {
    tabs: session.tabs ?? [],
    activeTabId: session.activeTabId ?? null
  }
  store.set('session', next)
  return next
}
