import { db } from './db.js'

// O banco guarda horários em UTC; o relatório usa o horário local da loja.
const OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? -3)
const local = (col) => `datetime(${col}, '${OFFSET_HOURS >= 0 ? '+' : ''}${OFFSET_HOURS} hours')`
const PAID = "o.status IN ('paid','shipped','delivered')"

function currentMonth() {
  const d = new Date(Date.now() + OFFSET_HOURS * 3600 * 1000)
  return d.toISOString().slice(0, 7)
}
function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}
const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function totals(month) {
  const site = db.prepare(`SELECT COUNT(DISTINCT o.id) orders, COALESCE(SUM(oi.qty), 0) pieces
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ?`).get(month)
  const revenue = db.prepare(`SELECT COALESCE(SUM(total_cents), 0) v FROM orders o
    WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ?`).get(month).v
  const clicks = db.prepare(`SELECT COUNT(*) n FROM whatsapp_clicks WHERE substr(${local('created_at')}, 1, 7) = ?`).get(month).n
  const wa = db.prepare(`SELECT COALESCE(SUM(qty), 0) pieces, COALESCE(SUM(amount_cents), 0) amount, COUNT(*) sales
    FROM whatsapp_sales WHERE substr(sold_at, 1, 7) = ?`).get(month)
  return { site_orders: site.orders, site_pieces: site.pieces, site_revenue_cents: revenue, whatsapp_clicks: clicks,
    whatsapp_pieces: wa.pieces, whatsapp_amount_cents: wa.amount, whatsapp_sales: wa.sales }
}

export function buildReport(monthParam) {
  const month = /^\d{4}-\d{2}$/.test(monthParam || '') ? monthParam : currentMonth()
  const now = totals(month)
  const before = totals(prevMonth(month))

  const byProduct = db.prepare(`SELECT oi.product_id, oi.name, SUM(oi.qty) qty, SUM(oi.qty * oi.unit_cents) revenue_cents
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ?
    GROUP BY oi.product_id, oi.name ORDER BY qty DESC, revenue_cents DESC`).all(month)

  const clicksByProduct = db.prepare(`SELECT c.product_id, COALESCE(p.name, 'Geral (sem peça)') name, COUNT(*) clicks
    FROM whatsapp_clicks c LEFT JOIN products p ON p.id = c.product_id
    WHERE substr(${local('c.created_at')}, 1, 7) = ?
    GROUP BY c.product_id ORDER BY clicks DESC`).all(month)

  // Junta as duas visões por peça: vendidas no site × cliques no WhatsApp
  const merged = new Map()
  for (const r of byProduct) merged.set(r.product_id ?? r.name, { name: r.name, site_qty: r.qty, site_revenue_cents: r.revenue_cents, wa_clicks: 0 })
  for (const r of clicksByProduct) {
    if (r.product_id == null) continue
    const key = r.product_id
    const row = merged.get(key) || { name: r.name, site_qty: 0, site_revenue_cents: 0, wa_clicks: 0 }
    row.wa_clicks = r.clicks
    merged.set(key, row)
  }
  const products = [...merged.values()].sort((a, b) => b.site_qty - a.site_qty || b.wa_clicks - a.wa_clicks)

  const bySize = db.prepare(`SELECT oi.size, SUM(oi.qty) qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ? GROUP BY oi.size ORDER BY qty DESC`).all(month)

  const byMethod = db.prepare(`SELECT COALESCE(payment_method, 'outro') method, COUNT(*) orders, SUM(total_cents) revenue_cents
    FROM orders o WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ? GROUP BY method`).all(month)

  const clicksBySource = db.prepare(`SELECT source, COUNT(*) clicks FROM whatsapp_clicks
    WHERE substr(${local('created_at')}, 1, 7) = ? GROUP BY source ORDER BY clicks DESC`).all(month)

  // Série diária
  const sitePerDay = Object.fromEntries(db.prepare(`SELECT CAST(substr(${local('o.paid_at')}, 9, 2) AS INTEGER) d, SUM(oi.qty) n
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE ${PAID} AND substr(${local('o.paid_at')}, 1, 7) = ? GROUP BY d`).all(month).map((r) => [r.d, r.n]))
  const clicksPerDay = Object.fromEntries(db.prepare(`SELECT CAST(substr(${local('created_at')}, 9, 2) AS INTEGER) d, COUNT(*) n
    FROM whatsapp_clicks WHERE substr(${local('created_at')}, 1, 7) = ? GROUP BY d`).all(month).map((r) => [r.d, r.n]))
  const days = Array.from({ length: daysIn(month) }, (_, i) => ({ day: i + 1, site_pieces: sitePerDay[i + 1] || 0, whatsapp_clicks: clicksPerDay[i + 1] || 0 }))

  const whatsappSales = db.prepare(`SELECT s.id, s.sold_at, s.qty, s.amount_cents, s.description, p.name product_name
    FROM whatsapp_sales s LEFT JOIN products p ON p.id = s.product_id
    WHERE substr(s.sold_at, 1, 7) = ? ORDER BY s.sold_at DESC, s.id DESC`).all(month)

  return { month, previous_month: prevMonth(month), totals: now, previous: before, products, by_size: bySize,
    by_method: byMethod, clicks_by_source: clicksBySource, days, whatsapp_sales: whatsappSales }
}

export function reportCsv(month) {
  const r = buildReport(month)
  const brl = (c) => (c / 100).toFixed(2).replace('.', ',')
  const lines = [
    `Relatório MYSLA;${r.month}`,
    '',
    'Resumo;Valor',
    `Peças vendidas no site;${r.totals.site_pieces}`,
    `Pedidos pagos no site;${r.totals.site_orders}`,
    `Faturamento do site (R$);${brl(r.totals.site_revenue_cents)}`,
    `Cliques no WhatsApp;${r.totals.whatsapp_clicks}`,
    `Peças vendidas pelo WhatsApp (lançadas);${r.totals.whatsapp_pieces}`,
    `Valor vendido pelo WhatsApp (R$);${brl(r.totals.whatsapp_amount_cents)}`,
    '',
    'Peça;Vendidas no site;Faturamento site (R$);Cliques no WhatsApp',
    ...r.products.map((p) => `${p.name};${p.site_qty};${brl(p.site_revenue_cents)};${p.wa_clicks}`),
    '',
    'Dia;Peças vendidas no site;Cliques no WhatsApp',
    ...r.days.map((d) => `${d.day};${d.site_pieces};${d.whatsapp_clicks}`),
  ]
  return { filename: `relatorio-mysla-${r.month}.csv`, csv: lines.join('\n') }
}
