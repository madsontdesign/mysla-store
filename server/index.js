import './env.js'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, bootstrap, UPLOAD_DIR } from './db.js'
import { publicRouter, releaseExpiredOrders } from './routes-public.js'
import { adminRouter } from './routes-admin.js'

bootstrap()

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }))
app.use('/api', publicRouter)
app.use('/api/admin', adminRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }))

// Em produção, o servidor também entrega o site já compilado (pasta dist)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

// Erros não tratados viram resposta JSON legível
app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500)
  res.status(status).json({ error: err.expose || status < 500 ? err.message : 'Erro interno. Tente de novo.' })
})

// Libera o estoque de pedidos não pagos a cada minuto
setInterval(releaseExpiredOrders, 60 * 1000).unref()
releaseExpiredOrders()

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  const demo = !process.env.MP_ACCESS_TOKEN
  console.log(`[loja] servidor no ar em http://localhost:${port}${demo ? '  (pagamentos em MODO DEMONSTRAÇÃO)' : ''}`)
})

process.on('SIGTERM', () => { db.close(); process.exit(0) })
