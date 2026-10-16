import { Router } from 'express'
import { db, allSettings } from './db.js'
import { loadProducts, loadTaxonomy, publicProduct } from './catalog.js'
import { createOrder, getOrder, applyPayment, expireOrders, shippingFor } from './orders.js'
import * as pay from './payments.js'

export const publicRouter = Router()
export const releaseExpiredOrders = () => {
  try { expireOrders() } catch (e) { console.error('[pedidos] erro ao expirar', e) }
}

/** A tarja aparece só se estiver ligada e dentro da data. */
function activeAnnouncement(a) {
  if (!a?.enabled || !a.text) return null
  if (a.ends_at && new Date(a.ends_at).getTime() < Date.now()) return null
  return a.text
}

// ---------- dados da loja ----------
publicRouter.get('/store', (_req, res) => {
  const s = allSettings()
  res.json({
    store_name: s.store_name,
    store_tagline: s.store_tagline,
    instagram_url: s.instagram_url,
    tiktok_url: s.tiktok_url,
    has_whatsapp: !!String(s.whatsapp_number).replace(/\D/g, ''),
    shipping_flat_cents: Number(s.shipping_flat_cents) || 0,
    free_shipping_min_cents: Number(s.free_shipping_min_cents) || 0,
    max_installments: Number(s.max_installments) || 1,
    announcement: activeAnnouncement(s.announcement),
    hero: s.hero,
    campaign: s.campaign,
    ...loadTaxonomy(),
    payments: { demo: pay.isDemo(), public_key: pay.publicKey() },
  })
})

publicRouter.get('/products', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(loadProducts().map(publicProduct))
})

publicRouter.get('/products/:slug', (req, res) => {
  const [p] = loadProducts({ slug: req.params.slug })
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' })
  res.json(publicProduct(p))
})

publicRouter.post('/subscribe', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' })
  db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email)
  res.json({ ok: true })
})

// ---------- botão do WhatsApp: registra o clique e abre a conversa ----------
const formatBRL = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
publicRouter.get('/wa', (req, res) => {
  const s = allSettings()
  const number = String(s.whatsapp_number).replace(/\D/g, '')
  const productId = Number(req.query.product) || null
  const source = String(req.query.source || 'site').slice(0, 30)
  // Ignora robôs de pré-visualização de link para não inflar o relatório
  const ua = req.get('user-agent') || ''
  if (!/bot|crawler|spider|facebookexternalhit|WhatsApp\//i.test(ua)) {
    db.prepare('INSERT INTO whatsapp_clicks (product_id, source) VALUES (?, ?)').run(productId, source)
  }
  let text = s.whatsapp_message || ''
  if (productId) {
    const p = db.prepare('SELECT name, slug, price_cents FROM products WHERE id = ?').get(productId)
    if (p) {
      const size = String(req.query.size || '').slice(0, 8)
      const color = String(req.query.color || '').slice(0, 30)
      const detail = [color, size && `tamanho ${size}`].filter(Boolean).join(', ')
      text = `Olá! Tenho interesse na peça ${p.name}${detail ? ` (${detail})` : ''} — ${formatBRL(p.price_cents)}.`
      if (process.env.SITE_URL) text += `\n${process.env.SITE_URL.replace(/\/$/, '')}/produto/${p.slug}`
    }
  }
  res.redirect(302, `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`)
})

// ---------- pedidos ----------
publicRouter.post('/shipping', (req, res) => {
  const subtotal = Math.max(0, Number(req.body?.subtotal_cents) || 0)
  res.json({ shipping_cents: shippingFor(subtotal) })
})

function orderView(o) {
  return {
    code: o.code,
    status: o.status,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    customer_name: o.customer_name,
    customer_email: o.customer_email,
    address: o.address,
    items: o.items.map((i) => ({ name: i.name, color: i.color, size: i.size, image: i.image, unit_cents: i.unit_cents, qty: i.qty })),
    subtotal_cents: o.subtotal_cents,
    shipping_cents: o.shipping_cents,
    total_cents: o.total_cents,
    tracking_code: o.tracking_code,
    created_at: o.created_at,
    paid_at: o.paid_at,
    pix: o.status === 'pending' && o.pix_qr ? { qr: o.pix_qr, qr_base64: o.pix_qr_base64, expires_at: o.pix_expires_at } : null,
  }
}

/** Busca o pedido conferindo o token secreto que só a cliente tem. */
function authorizedOrder(req, res) {
  const o = getOrder(String(req.params.code).toUpperCase())
  const token = req.query.t || req.body?.t
  if (!o || !token || token !== o.access_token) {
    res.status(404).json({ error: 'Pedido não encontrado' })
    return null
  }
  return o
}

publicRouter.post('/orders', (req, res) => {
  const o = createOrder(req.body)
  res.status(201).json({ ...orderView(o), token: o.access_token })
})

const lastCheck = new Map()
publicRouter.get('/orders/:code', async (req, res) => {
  let o = authorizedOrder(req, res)
  if (!o) return
  // Enquanto a cliente olha a tela do Pix, conferimos o pagamento direto no Mercado Pago
  // (funciona mesmo sem o aviso automático configurado). No máximo a cada 5 segundos.
  if (o.status === 'pending' && o.mp_payment_id && !pay.isDemo() && Date.now() - (lastCheck.get(o.code) || 0) > 5000) {
    lastCheck.set(o.code, Date.now())
    try {
      const p = await pay.getPayment(o.mp_payment_id)
      if (p.status !== o.payment_status) {
        applyPayment(o, { id: String(p.id), status: p.status })
        o = getOrder(o.code)
      }
    } catch (e) {
      console.error('[pedido] não foi possível consultar o pagamento', e.message)
    }
  }
  res.json(orderView(o))
})

publicRouter.post('/orders/lookup', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const o = db.prepare('SELECT code, access_token FROM orders WHERE code = ? AND customer_email = ?').get(code, email)
  if (!o) return res.status(404).json({ error: 'Não encontramos um pedido com esse código e e-mail.' })
  res.json({ code: o.code, token: o.access_token })
})

publicRouter.post('/orders/:code/pix', async (req, res) => {
  const o = authorizedOrder(req, res)
  if (!o) return
  if (o.status !== 'pending') return res.status(409).json({ error: 'Este pedido não está aguardando pagamento.' })
  // Reaproveita o Pix gerado se ainda estiver válido
  if (o.payment_method === 'pix' && o.pix_qr && new Date(o.pix_expires_at) > new Date()) return res.json(orderView(o))
  const r = await pay.createPix(o)
  db.prepare(`UPDATE orders SET payment_method = 'pix', mp_payment_id = ?, payment_status = ?, pix_qr = ?, pix_qr_base64 = ?, pix_expires_at = ? WHERE id = ?`)
    .run(r.id, r.status, r.qr, r.qrBase64, r.expiresAt, o.id)
  res.json(orderView(getOrder(o.code)))
})

publicRouter.post('/orders/:code/card', async (req, res) => {
  const o = authorizedOrder(req, res)
  if (!o) return
  if (o.status !== 'pending') return res.status(409).json({ error: 'Este pedido não está aguardando pagamento.' })
  const form = req.body?.form || {}
  if (!pay.isDemo() && !form.token) return res.status(400).json({ error: 'Dados do cartão incompletos.' })
  const r = await pay.createCard(o, form)
  db.prepare('UPDATE orders SET installments = ? WHERE id = ?').run(Number(form.installments) || 1, o.id)
  applyPayment(o, { id: r.id, status: r.status, method: 'card' })
  const fresh = getOrder(o.code)
  res.json({
    ...orderView(fresh),
    card_result: r.status,
    message: r.status === 'rejected' ? (pay.REJECT_MESSAGES[r.detail] || pay.REJECT_MESSAGES.cc_rejected_other_reason)
      : r.status === 'in_process' || r.status === 'pending' ? 'Pagamento em análise pelo banco. Esta página atualiza sozinha quando for aprovado.' : null,
  })
})

// Só existe no modo demonstração: simula a confirmação do Pix
publicRouter.post('/orders/:code/demo-pay', (req, res) => {
  if (!pay.isDemo()) return res.status(404).json({ error: 'Rota não encontrada' })
  const o = authorizedOrder(req, res)
  if (!o) return
  applyPayment(o, { status: 'approved', method: o.payment_method || 'pix' })
  res.json(orderView(getOrder(o.code)))
})

// ---------- aviso do Mercado Pago ----------
publicRouter.post('/webhooks/mercadopago', async (req, res) => {
  if (!pay.validWebhookSignature(req)) return res.status(401).end()
  res.status(200).end() // responde logo; o Mercado Pago reenvia se demorar
  try {
    const type = req.body?.type || req.query.type || req.query.topic
    const id = req.body?.data?.id || req.query['data.id'] || req.query.id
    if (type !== 'payment' || !id || pay.isDemo()) return
    // Nunca confiamos no corpo do aviso: consultamos o pagamento direto na API
    const p = await pay.getPayment(id)
    const o = getOrder(String(p.external_reference || ''))
    if (!o) return
    applyPayment(o, { id: String(p.id), status: p.status, method: p.payment_method_id === 'pix' ? 'pix' : 'card' })
  } catch (e) {
    console.error('[webhook] falha ao processar', e.message)
  }
})
