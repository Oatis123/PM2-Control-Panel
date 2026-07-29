const http = require('http')
const port = Number(process.env.PORT || 3100)

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`ok ${process.env.name || 'echo'} on ${port}\n`)
})

server.listen(port, () => {
  console.log(`[echo-server] listening on ${port}`)
})

setInterval(() => {
  console.log(`[echo-server] heartbeat ${new Date().toISOString()}`)
}, 15_000)
