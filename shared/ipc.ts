/** IPC channel names shared between main and preload */

export const IpcChannels = {
  // Environment
  ENV_CHECK: 'env:check',
  ENV_CHECK_AND_INSTALL: 'env:checkAndInstall',
  ENV_GET_VERSIONS: 'env:getVersions',
  ENV_PROGRESS: 'env:progress',

  // Config
  CONFIG_OPEN_DIALOG: 'config:openDialog',
  CONFIG_READ: 'config:read',

  // PM2
  PM2_START_CONFIG: 'pm2:startConfig',
  PM2_STOP_ALL: 'pm2:stopAll',
  PM2_RESTART_ALL: 'pm2:restartAll',
  PM2_START_APP: 'pm2:startApp',
  PM2_STOP_APP: 'pm2:stopApp',
  PM2_RESTART_APP: 'pm2:restartApp',
  PM2_DELETE_APP: 'pm2:deleteApp',
  PM2_JLIST: 'pm2:jlist',
  PM2_LOGS_SUBSCRIBE: 'pm2:logsSubscribe',
  PM2_LOGS_UNSUBSCRIBE: 'pm2:logsUnsubscribe',
  PM2_LOG_LINE: 'pm2:logLine',
  PM2_FLUSH: 'pm2:flush',

  // Session
  SESSION_GET: 'session:get',
  SESSION_SET: 'session:set',

  // System metrics (host CPU / GPU / RAM)
  SYS_METRICS: 'sys:metrics'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
