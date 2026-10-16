import { Router } from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { db, allSettings, setSetting, SETTING_KEYS, slugify, UPLOAD_DIR } from './db.js'
import { loadProducts, loadTaxonomy } from './catalog.js'
import { getOrder, setOrderStatus, PAID_STATUSES } from './orders.js'
import { buildReport, reportCsv } from './report.js'
import { isDemo } from './payments.js'

export const adminRouter = Router()
const COOKIE = 'mysla_admin'
const SESSION_DAYS = 14

// ---------- sessão ----------
function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function sessionUser(req) {
  const token = readCookie(req, COOKIE)
  if (!token) return null
  return db.prepare(`SELECT u.id, u.email FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token) || null
}

function setSessionCookie(req, res, token, maxAgeSec) {
  const secure = req.secure || (process.env.SITE_URL || '').startsWith('https://')
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`)
}

const attempts = new Map() // proteção simples contra tentativa de senha em massa
adminRouter.post('/login', (req, res) => {
  const ip = req.ip
  const a = attempts.get(ip) || { n: 0, until: 0 }
  if (a.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
  const email = String(req.body?.email || '').trim().toLowerCase()
  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email)
  if (!user || !bcrypt.compareSync(String(req.body?.password || ''), user.password_hash)) {
    a.n += 1
    if (a.n >= 5) { a.until = Date.now() + 10 * 60 * 1000; a.n = 0 }
    attempts.set(ip, a)
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
  }
  attempts.delete(ip)
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare(`INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(token, user.id)
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run()
  setSessionCookie(req, res, token, SESSION_DAYS * 86400)
  res.json({ email: user.email })
})

adminRouter.post('/logout', (req, res) => {
  const token = readCookie(req, COOKIE)
  if (token) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token)
  setSessionCookie(req, res, '', 0)
  res.json({ ok: true })
})

// Tudo abaixo exige login
adminRouter.use((req, res, next) => {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login para continuar.' })
  req.user = user
  next()
})

adminRouter.get('/me', (req, res) => res.json({ email: req.user.email, demo: isDemo() }))

adminRouter.put('/password', (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id)
  const { current, next } = req.body || {}
  if (!bcrypt.compareSync(String(current || ''), user.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta.' })
  if (String(next || '').length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' })
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(next), 10), user.id)
  res.json({ ok: true })
})

// ---------- envio de fotos ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif' }[file.mimetype]
      cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${ext}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|avif|gif)$/.test(file.mimetype)) cb(null, true)
    else cb(Object.assign(new Error('Envie imagens JPG, PNG ou WEBP.'), { status: 400 }))
  },
})
adminRouter.post('/upload', upload.array('files', 12), (req, res) => {
  res.json({ urls: (req.files || []).map((f) => `/uploads/${f.filename}`) })
})

function removeUnusedUpload(url) {
  if (!url?.startsWith('/uploads/')) return
  const stillUsed = db.prepare('SELECT 1 FROM product_images WHERE url = ? LIMIT 1').get(url)
    || JSON.stringify(allSettings()).includes(url)
  if (!stillUsed) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {})
}

// ---------- peças ----------
adminRouter.get('/products', (_req, res) => res.json(loadProducts({ includeInactive: true })))

adminRouter.get('/products/:id', (req, res) => {
  const [p] = loadProducts({ includeInactive: true, id: Number(req.params.id) })
  if (!p) return res.status(404).json({ error: 'Peça não encontrada' })
  res.json(p)
})

function uniqueSlug(base, ignoreId) {
  let slug = slugify(base)
  let n = 2
  while (db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').get(slug, ignoreId || 0)) slug = `${slugify(base)}-${n++}`
  return slug
}

function saveProduct(body, id) {
  const name = String(body.name || '').trim()
  const price = Math.round(Number(body.price_cents))
  if (!name) throw Object.assign(new Error('Dê um nome à peça.'), { status: 400 })
  if (!(price > 0)) throw Object.assign(new Error('Informe o preço.'), { status: 400 })
  const compare = body.compare_at_cents ? Math.round(Number(body.compare_at_cents)) : null
  if (compare && compare <= price) throw Object.assign(new Error('O preço "de" precisa ser maior que o preço de venda.'), { status: 400 })
  const variants = (Array.isArray(body.variants) ? body.variants : [])
    .map((v) => ({ color: String(v.color || '').trim(), color_hex: String(v.color_hex || '#111111'), size: String(v.size || '').trim().toUpperCase(), stock: Math.max(0, Math.floor(Number(v.stock) || 0)) }))
    .filter((v) => v.color && v.size)
  if (!variants.length) throw Object.assign(new Error('Cadastre pelo menos uma cor e um tamanho.'), { status: 400 })
  const seen = new Set()
  for (const v of variants) {
    const k = `${v.color.toLowerCase()}|${v.size}`
    if (seen.has(k)) throw Object.assign(new Error(`A combinação ${v.color} / ${v.size} aparece duas vezes.`), { status: 400 })
    seen.add(k)
  }
  const images = (Array.isArray(body.images) ? body.images : []).map(String).filter(Boolean)

  return db.transaction(() => {
    const fields = [name, String(body.description || ''), String(body.composition || ''), price, compare,
      body.category_id ? Number(body.category_id) : null, body.collection_id ? Number(body.collection_id) : null, body.active === false ? 0 : 1]
    let pid = id
    if (id) {
      const slug = uniqueSlug(body.slug || name, id)
      db.prepare(`UPDATE products SET name=?, description=?, composition=?, price_cents=?, compare_at_cents=?, category_id=?, collection_id=?, active=?, slug=? WHERE id=?`)
        .run(...fields, slug, id)
    } else {
      pid = db.prepare(`INSERT INTO products (name, description, composition, price_cents, compare_at_cents, category_id, collection_id, active, slug)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...fields, uniqueSlug(name)).lastInsertRowid
    }
    const oldImages = db.prepare('SELECT url FROM product_images WHERE product_id = ?').all(pid).map((r) => r.url)
    db.prepare('DELETE FROM product_images WHERE product_id = ?').run(pid)
    const insImg = db.prepare('INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)')
    images.forEach((u, i) => insImg.run(pid, u, i))

    // Atualiza variações mantendo o id das que continuam (pedidos antigos apontam para elas)
    const existing = db.prepare('SELECT id, color, size FROM variants WHERE product_id = ?').all(pid)
    const keep = new Set()
    const upd = db.prepare('UPDATE variants SET color = ?, color_hex = ?, size = ?, stock = ? WHERE id = ?')
    const ins = db.prepare('INSERT INTO variants (product_id, color, color_hex, size, stock) VALUES (?, ?, ?, ?, ?)')
    for (const v of variants) {
      const match = existing.find((e) => e.color.toLowerCase() === v.color.toLowerCase() && e.size === v.size)
      if (match) { upd.run(v.color, v.color_hex, v.size, v.stock, match.id); keep.add(match.id) }
      else keep.add(ins.run(pid, v.color, v.color_hex, v.size, v.stock).lastInsertRowid)
    }
    for (const e of existing) if (!keep.has(e.id)) db.prepare('DELETE FROM variants WHERE id = ?').run(e.id)
    return { pid, removed: oldImages.filter((u) => !images.includes(u)) }
  })()
}

adminRouter.post('/products', (req, res) => {
  const { pid } = saveProduct(req.body || {}, null)
  res.status(201).json(loadProducts({ includeInactive: true, id: pid })[0])
})

adminRouter.put('/products/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) return res.status(404).json({ error: 'Peça não encontrada' })
  const { pid, removed } = saveProduct(req.body || {}, id)
  removed.forEach(removeUnusedUpload)
  res.json(loadProducts({ includeInactive: true, id: pid })[0])
})

adminRouter.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id)
  const imgs = db.prepare('SELECT url FROM product_images WHERE product_id = ?').all(id).map((r) => r.url)
  db.prepare('DELETE FROM products WHERE id = ?').run(id)
  imgs.forEach(removeUnusedUpload)
  res.json({ ok: true })
})

// ---------- vitrine e configurações ----------
adminRouter.get('/settings', (_req, res) => res.json(allSettings()))

adminRouter.put('/settings', (req, res) => {
  const before = allSettings()
  const body = req.body || {}
  for (const key of Object.keys(body)) {
    if (!SETTING_KEYS.includes(key)) continue
    let value = body[key]
    if (['shipping_flat_cents', 'free_shipping_min_cents', 'max_installments'].includes(key)) value = Math.max(0, Math.round(Number(value) || 0))
    if (key === 'max_installments') value = Math.min(12, Math.max(1, value))
    if (key === 'whatsapp_number') value = String(value).replace(/\D/g, '')
    setSetting(key, value)
  }
  // apaga imagens de banner que deixaram de ser usadas
  for (const k of ['hero', 'campaign']) {
    for (const f of ['image', 'image_mobile']) {
      const old = before[k]?.[f]
      if (old && body[k] && body[k][f] !== old) removeUnusedUpload(old)
    }
  }
  res.json(allSettings())
})

// ---------- categorias e coleções ----------
adminRouter.get('/taxonomy', (_req, res) => res.json(loadTaxonomy()))

for (const table of ['categories', 'collections']) {
  adminRouter.post(`/${table}`, (req, res) => {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Informe o nome.' })
    let slug = slugify(name); let n = 2
    while (db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`).get(slug)) slug = `${slugify(name)}-${n++}`
    const pos = db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 p FROM ${table}`).get().p
    db.prepare(`INSERT INTO ${table} (name, slug, position) VALUES (?, ?, ?)`).run(name, slug, pos)
    res.status(201).json(loadTaxonomy())
  })
  adminRouter.put(`/${table}/:id`, (req, res) => {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Informe o nome.' })
    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, Number(req.params.id))
    if (table === 'collections' && req.body.description != null) {
      db.prepare('UPDATE collections SET description = ? WHERE id = ?').run(String(req.body.description), Number(req.params.id))
    }
    res.json(loadTaxonomy())
  })
  adminRouter.delete(`/${table}/:id`, (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id))
    res.json(loadTaxonomy())
  })
}

// ---------- pedidos ----------
adminRouter.get('/orders', (req, res) => {
  const where = []
  const params = []
  const status = String(req.query.status || '')
  if (status === 'open') where.push("status IN ('paid')")
  else if (status) { where.push('status = ?'); params.push(status) }
  const q = String(req.query.q || '').trim()
  if (q) { where.push('(code LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  const rows = db.prepare(`SELECT o.id, o.code, o.status, o.payment_method, o.customer_name, o.total_cents, o.created_at, o.paid_at,
      (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS pieces
    FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`).all(...params)
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]))
  res.json({ orders: rows, counts })
})

adminRouter.get('/orders/:code', (req, res) => {
  const o = getOrder(String(req.params.code))
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' })
  delete o.access_token
  res.json(o)
})

adminRouter.put('/orders/:code', (req, res) => {
  const o = getOrder(String(req.params.code))
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' })
  const { status, tracking_code, notes } = req.body || {}
  if (tracking_code !== undefined || notes !== undefined) {
    db.prepare('UPDATE orders SET tracking_code = COALESCE(?, tracking_code), notes = COALESCE(?, notes) WHERE id = ?')
      .run(tracking_code ?? null, notes ?? null, o.id)
  }
  if (status && status !== o.status) {
    if (!['pending', 'paid', 'shipped', 'delivered', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Status inválido' })
    setOrderStatus(o, status)
  }
  const fresh = getOrder(o.code)
  delete fresh.access_token
  res.json(fresh)
})

// ---------- vendas fechadas pelo WhatsApp (lançadas à mão) ----------
adminRouter.get('/whatsapp-sales', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7)
  res.json(db.prepare(`SELECT s.*, p.name AS product_name FROM whatsapp_sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE substr(s.sold_at, 1, 7) = ? ORDER BY s.sold_at DESC, s.id DESC`).all(month))
})

adminRouter.post('/whatsapp-sales', (req, res) => {
  const b = req.body || {}
  const qty = Math.max(1, Math.floor(Number(b.qty) || 1))
  const amount = Math.max(0, Math.round(Number(b.amount_cents) || 0))
  const soldAt = /^\d{4}-\d{2}-\d{2}$/.test(b.sold_at) ? b.sold_at : new Date().toISOString().slice(0, 10)
  const productId = b.product_id ? Number(b.product_id) : null
  if (!productId && !String(b.description || '').trim()) return res.status(400).json({ error: 'Escolha a peça ou descreva a venda.' })
  db.transaction(() => {
    db.prepare('INSERT INTO whatsapp_sales (product_id, description, qty, amount_cents, sold_at) VALUES (?, ?, ?, ?, ?)')
      .run(productId, String(b.description || '').trim(), qty, amount, soldAt)
    if (b.variant_id) db.prepare('UPDATE variants SET stock = MAX(0, stock - ?) WHERE id = ?').run(qty, Number(b.variant_id))
  })()
  res.status(201).json({ ok: true })
})

adminRouter.delete('/whatsapp-sales/:id', (req, res) => {
  db.prepare('DELETE FROM whatsapp_sales WHERE id = ?').run(Number(req.params.id))
  res.json({ ok: true })
})

// ---------- relatório ----------
adminRouter.get('/report', (req, res) => res.json(buildReport(req.query.month)))

adminRouter.get('/report.csv', (req, res) => {
  const { filename, csv } = reportCsv(req.query.month)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send('﻿' + csv)
})

adminRouter.get('/subscribers.csv', (_req, res) => {
  const rows = db.prepare('SELECT email, created_at FROM subscribers ORDER BY id DESC').all()
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="newsletter.csv"')
  res.send('﻿e-mail;data\n' + rows.map((r) => `${r.email};${r.created_at}`).join('\n'))
})

adminRouter.get('/overview', (_req, res) => {
  res.json({
    awaiting_shipment: db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'paid'").get().n,
    low_stock: db.prepare(`SELECT p.id, p.name, v.color, v.size, v.stock FROM variants v JOIN products p ON p.id = v.product_id
      WHERE p.active = 1 AND v.stock <= 1 ORDER BY v.stock, p.name LIMIT 12`).all(),
    subscribers: db.prepare('SELECT COUNT(*) n FROM subscribers').get().n,
    paid_statuses: PAID_STATUSES,
  })
})
