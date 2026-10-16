// Integração com o Mercado Pago (Pix e cartão no checkout do próprio site).
// Sem MP_ACCESS_TOKEN, a loja funciona em MODO DEMONSTRAÇÃO: os pagamentos são simulados.
import crypto from 'node:crypto'
import QRCode from 'qrcode'

const API = 'https://api.mercadopago.com'

export const isDemo = () => !process.env.MP_ACCESS_TOKEN
export const publicKey = () => process.env.MP_PUBLIC_KEY || ''

async function mp(method, path, body, idempotencyKey) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error || `Mercado Pago respondeu ${res.status}`
    const err = new Error(msg)
    err.details = data
    throw err
  }
  return data
}

function splitName(full) {
  const parts = String(full).trim().split(/\s+/)
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || parts[0] || '' }
}

function notificationUrl() {
  const site = process.env.SITE_URL
  // O Mercado Pago só aceita endereços públicos com https.
  return site && site.startsWith('https://') ? `${site.replace(/\/$/, '')}/api/webhooks/mercadopago` : undefined
}

/** Cria a cobrança Pix. Retorna { id, status, qr, qrBase64, expiresAt }. */
export async function createPix(order) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  if (isDemo()) {
    const qr = `DEMONSTRACAO-PIX-${order.code}-${(order.total_cents / 100).toFixed(2)}`
    const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 })
    return { id: `demo-${order.code}`, status: 'pending', qr, qrBase64: dataUrl.split(',')[1], expiresAt: expiresAt.toISOString() }
  }
  const data = await mp('POST', '/v1/payments', {
    transaction_amount: order.total_cents / 100,
    description: `Pedido ${order.code}`,
    payment_method_id: 'pix',
    external_reference: order.code,
    notification_url: notificationUrl(),
    date_of_expiration: expiresAt.toISOString().replace('Z', '-00:00'),
    payer: {
      email: order.customer_email,
      ...splitName(order.customer_name),
      identification: { type: 'CPF', number: order.customer_cpf },
    },
  }, `pix-${order.code}`)
  const tx = data.point_of_interaction?.transaction_data || {}
  return { id: String(data.id), status: data.status, qr: tx.qr_code, qrBase64: tx.qr_code_base64, expiresAt: expiresAt.toISOString() }
}

/** Cobra no cartão com o token gerado pelo formulário seguro do Mercado Pago no navegador. */
export async function createCard(order, form) {
  if (isDemo()) {
    // Na demonstração, qualquer cartão é aprovado, exceto se o nome do titular for "RECUSAR".
    const refused = String(form?.holder || '').toUpperCase() === 'RECUSAR'
    return { id: `demo-card-${order.code}`, status: refused ? 'rejected' : 'approved', detail: refused ? 'cc_rejected_other_reason' : 'accredited' }
  }
  const data = await mp('POST', '/v1/payments', {
    transaction_amount: order.total_cents / 100,
    token: form.token,
    description: `Pedido ${order.code}`,
    installments: Number(form.installments) || 1,
    payment_method_id: form.payment_method_id,
    issuer_id: form.issuer_id || undefined,
    external_reference: order.code,
    notification_url: notificationUrl(),
    payer: {
      email: form.payer?.email || order.customer_email,
      identification: form.payer?.identification || { type: 'CPF', number: order.customer_cpf },
    },
  }, `card-${order.code}-${crypto.createHash('sha1').update(String(form.token)).digest('hex').slice(0, 12)}`)
  return { id: String(data.id), status: data.status, detail: data.status_detail }
}

export async function getPayment(id) {
  return mp('GET', `/v1/payments/${encodeURIComponent(id)}`)
}

/** Confere a assinatura x-signature da notificação (quando MP_WEBHOOK_SECRET está configurado). */
export function validWebhookSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return true // sem segredo configurado, confiamos na consulta direta à API (abaixo)
  const header = req.get('x-signature') || ''
  const requestId = req.get('x-request-id') || ''
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')))
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase()
  if (!parts.ts || !parts.v1) return false
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  } catch {
    return false
  }
}

export const REJECT_MESSAGES = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a data de validade.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente.',
  cc_rejected_call_for_authorize: 'Autorize o pagamento com o banco do cartão e tente de novo.',
  cc_rejected_card_disabled: 'O cartão está desativado. Fale com o banco ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Esse pagamento já foi feito. Confira seu e-mail.',
  cc_rejected_high_risk: 'Pagamento recusado. Tente outro cartão ou pague com Pix.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Use outro cartão ou Pix.',
  cc_rejected_other_reason: 'O banco recusou o pagamento. Tente outro cartão ou Pix.',
}
