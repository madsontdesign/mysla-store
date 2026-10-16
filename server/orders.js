import crypto from 'node:crypto'
import { db, getSetting } from './db.js'

export const PAID_STATUSES = ['paid', 'shipped', 'delivered']

function newCode() {
  // Ex.: MY-7K3P9Q — fácil de ditar por telefone, sem letras parecidas
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = 'MY-'
  for (const b of crypto.randomBytes(6)) code += alphabet[b % alphabet.length]
  return code
}

export function shippingFor(subtotalCents) {
  const min = Number(getSetting('free_shipping_min_cents')) || 0
  const flat = Number(getSetting('shipping_flat_cents')) || 0
  return min > 0 && subtotalCents >= min ? 0 : flat
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '')

function validCpf(cpf) {
  const c = onlyDigits(cpf)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i)
    const digit = ((sum * 10) % 11) % 10
    if (digit !== Number(c[len])) return false
  }
  return true
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

/** Cria o pedido e reserva o estoque. Lança erro legível se algo não fechar. */
export function createOrder(body) {
  const c = body?.customer || {}
  const a = body?.address || {}
  const items = Array.isArray(body?.items) ? body.items : []

  const name = String(c.name || '').trim()
  const email = String(c.email || '').trim().toLowerCase()
  const cpf = onlyDigits(c.cpf)
  const phone = onlyDigits(c.phone)
  if (name.split(/\s+/).length < 2) throw httpError(400, 'Informe nome e sobrenome.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Informe um e-mail válido.')
  if (!validCpf(cpf)) throw httpError(400, 'CPF inválido.')
  if (phone.length < 10) throw httpError(400, 'Informe um telefone com DDD.')
  const address = {
    cep: onlyDigits(a.cep), street: String(a.street || '').trim(), number: String(a.number || '').trim(),
    complement: String(a.complement || '').trim(), district: String(a.district || '').trim(),
    city: String(a.city || '').trim(), state: String(a.state || '').trim().toUpperCase().slice(0, 2),
  }
  if (address.cep.length !== 8 || !address.street || !address.number || !address.district || !address.city || address.state.length !== 2) {
    throw httpError(400, 'Preencha o endereço completo.')
  }
  if (!items.length) throw httpError(400, 'Sua sacola está vazia.')

  const getVariant = db.prepare(`
    SELECT v.*, p.name, p.price_cents, p.active,
      (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position, id LIMIT 1) AS image
    FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`)

  return db.transaction(() => {
    const lines = []
    for (const it of items) {
      const qty = Math.floor(Number(it.qty))
      if (!(qty > 0 && qty <= 20)) throw httpError(400, 'Quantidade inválida na sacola.')
      const v = getVariant.get(Number(it.variantId))
      if (!v || !v.active) throw httpError(409, 'Uma das peças da sacola não está mais disponível.')
      if (v.stock < qty) {
        throw httpError(409, v.stock > 0
          ? `Só temos ${v.stock} un. de ${v.name} (${v.color} / ${v.size}). Ajuste a sacola.`
          : `${v.name} (${v.color} / ${v.size}) esgotou. Remova da sacola para continuar.`)
      }
      lines.push({ v, qty })
    }
    const subtotal = lines.reduce((s, l) => s + l.v.price_cents * l.qty, 0)
    const shipping = shippingFor(subtotal)
    const code = newCode()
    const token = crypto.randomBytes(16).toString('hex')
    const orderId = db.prepare(`INSERT INTO orders
      (code, access_token, customer_name, customer_email, customer_cpf, customer_phone, address, subtotal_cents, shipping_cents, total_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(code, token, name, email, cpf, phone, JSON.stringify(address), subtotal, shipping, subtotal + shipping).lastInsertRowid
    const insItem = db.prepare(`INSERT INTO order_items (order_id, product_id, variant_id, name, color, size, image, unit_cents, qty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const take = db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?')
    for (const { v, qty } of lines) {
      insItem.run(orderId, v.product_id, v.id, v.name, v.color, v.size, v.image, v.price_cents, qty)
      take.run(qty, v.id)
    }
    return getOrder(code)
  })()
}

export function getOrder(code) {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(code)
  if (!o) return null
  o.address = JSON.parse(o.address)
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id)
  return o
}

/** Devolve as peças ao estoque (uma vez só). */
export function releaseStock(orderId) {
  const o = db.prepare('SELECT stock_released FROM orders WHERE id = ?').get(orderId)
  if (!o || o.stock_released) return
  const give = db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?')
  for (const it of db.prepare('SELECT variant_id, qty FROM order_items WHERE order_id = ?').all(orderId)) {
    if (it.variant_id) give.run(it.qty, it.variant_id)
  }
  db.prepare('UPDATE orders SET stock_released = 1 WHERE id = ?').run(orderId)
}

/** Volta a reservar as peças (pagamento que chegou depois de o pedido expirar). */
function retakeStock(orderId) {
  const take = db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?')
  for (const it of db.prepare('SELECT variant_id, qty FROM order_items WHERE order_id = ?').all(orderId)) {
    if (it.variant_id) take.run(it.qty, it.variant_id)
  }
  db.prepare('UPDATE orders SET stock_released = 0 WHERE id = ?').run(orderId)
}

export function setOrderStatus(order, status) {
  db.transaction(() => {
    if (status === 'cancelled') releaseStock(order.id)
    else if (order.status === 'cancelled') {
      const fresh = db.prepare('SELECT stock_released FROM orders WHERE id = ?').get(order.id)
      if (fresh.stock_released) retakeStock(order.id)
    }
    const paidAt = PAID_STATUSES.includes(status) && !order.paid_at ? "datetime('now')" : 'paid_at'
    db.prepare(`UPDATE orders SET status = ?, paid_at = ${paidAt} WHERE id = ?`).run(status, order.id)
  })()
}

/** Aplica o status vindo do Mercado Pago ao pedido. */
export function applyPayment(order, { id, status, method }) {
  db.prepare('UPDATE orders SET mp_payment_id = COALESCE(?, mp_payment_id), payment_status = ?, payment_method = COALESCE(?, payment_method) WHERE id = ?')
    .run(id || null, status, method || null, order.id)
  if (status === 'approved' && !PAID_STATUSES.includes(order.status)) {
    setOrderStatus(order, 'paid')
  } else if (['refunded', 'charged_back'].includes(status) && order.status !== 'cancelled') {
    setOrderStatus(order, 'cancelled')
  } else if (status === 'cancelled' && order.status === 'pending' && order.payment_method === 'pix') {
    setOrderStatus(order, 'cancelled') // Pix expirado
  }
  // Cartão recusado: o pedido continua aberto para a cliente tentar de novo.
}

/** Cancela pedidos não pagos depois do prazo e devolve as peças ao estoque. */
export function expireOrders() {
  const stale = db.prepare(`SELECT * FROM orders WHERE status = 'pending' AND (
      (COALESCE(payment_method, 'pix') = 'pix' AND created_at < datetime('now', '-45 minutes')) OR
      (payment_method = 'card' AND created_at < datetime('now', '-3 days')))`).all()
  for (const o of stale) setOrderStatus(o, 'cancelled')
  return stale.length
}
