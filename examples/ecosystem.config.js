/**
 * Sample PM2 ecosystem config for testing PM2 Control Panel.
 * Paths are relative — adjust script/cwd for your machine.
 */
module.exports = {
  apps: [
    {
      name: 'sample-api',
      script: 'echo-server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        PORT: '3100'
      }
    },
    {
      name: 'sample-worker',
      script: 'echo-server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        PORT: '3101'
      }
    }
  ]
}
