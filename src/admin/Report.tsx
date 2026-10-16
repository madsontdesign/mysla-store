import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, price } from '../lib/api'
import { monthLabel, PageHead, shiftMonth, thisMonth, fmtDate } from './ui'

type Totals = {
  site_orders: number; site_pieces: number; site_revenue_cents: number
  whatsapp_clicks: number; whatsapp_pieces: number; whatsapp_amount_cents: number; whatsapp_sales: number
}
type ReportData = {
  month: string
  totals: Totals
  previous: Totals
  products: { name: string; site_qty: number; site_revenue_cents: number; wa_clicks: number }[]
  by_size: { size: string; qty: number }[]
  by_method: { method: string; orders: number; revenue_cents: number }[]
  clicks_by_source: { source: string; clicks: number }[]
  days: { day: number; site_pieces: number; whatsapp_clicks: number }[]
  whatsapp_sales: { id: number; sold_at: string; qty: number; amount_cents: number; description: string; product_name: string | null }[]
}

const SOURCE: Record<string, string> = {
  'pagina-produto': 'Página da peça',
  'botao-flutuante': 'Botão flutuante',
  portal: 'Página de entrada',
  rodape: 'Rodapé',
}
const METHOD: Record<string, string> = { pix: 'Pix', card: 'Cartão', outro: 'Outro' }

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="ad-delta">{now ? 'sem base no mês anterior' : '—'}</span>
  const pct = Math.round(((now - before) / before) * 100)
  return <span className={`ad-delta ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}% vs. mês anterior</span>
}

function Stat({ label, value, sub, now, before }: { label: string; value: React.ReactNode; sub?: React.ReactNode; now: number; before: number }) {
  return (
    <div className="ad-stat">
      <span className="ad-label">{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
      <Delta now={now} before={before} />
    </div>
  )
}

/** Barras por dia. Uma série por gráfico (as duas medidas têm escalas diferentes). */
function DayBars({ title, values, unit, month }: { title: string; values: number[]; unit: [string, string]; month: string }) {
  const max = Math.max(1, ...values)
  const total = values.reduce((a, b) => a + b, 0)
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i)
  const [y, m] = month.split('-')
  return (
    <figure className="ad-chart">
      <figcaption><span>{title}</span><b>{total} {total === 1 ? unit[0] : unit[1]}</b></figcaption>
      <div className="ad-chart-body">
        <div className="ad-chart-axis">{ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>{t}</span>)}</div>
        <div className="ad-chart-plot">
          {ticks.map((t) => <i key={t} className="ad-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
          {values.map((v, i) => (
            <div className="ad-bar-slot" key={i} tabIndex={0} aria-label={`Dia ${i + 1}: ${v} ${v === 1 ? unit[0] : unit[1]}`}>
              {v > 0 && <div className="ad-bar" style={{ height: `${(v / max) * 100}%` }} />}
              <div className="ad-tip"><b>{v}</b> {v === 1 ? unit[0] : unit[1]}<small>{String(i + 1).padStart(2, '0')}/{m}/{y}</small></div>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-chart-x"><span>1</span><span>{Math.ceil(values.length / 2)}</span><span>{values.length}</span></div>
    </figure>
  )
}

export default function Report() {
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<ReportData | null>(null)
  useEffect(() => {
    setData(null)
    api<ReportData>(`/admin/report?month=${month}`).then(setData).catch(() => {})
  }, [month])

  const t = data?.totals
  const p = data?.previous
  const totalPieces = (t?.site_pieces || 0) + (t?.whatsapp_pieces || 0)
  return (
    <div className="ad-page">
      <PageHead title="Relatório do mês" sub="Peças vendidas no site e procura pelo WhatsApp.">
        <div className="ad-month">
          <button className="ad-btn small ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">←</button>
          <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Mês" />
          <button className="ad-btn small ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Próximo mês">→</button>
        </div>
        <a className="ad-btn small" href={`/api/admin/report.csv?month=${month}`}>Baixar planilha</a>
      </PageHead>

      {!data || !t || !p ? <div className="ad-empty">Carregando {monthLabel(month).toLowerCase()}…</div> : (
        <>
          <section className="ad-stats">
            <Stat label="Peças vendidas no site" value={t.site_pieces} sub={`${t.site_orders} ${t.site_orders === 1 ? 'pedido pago' : 'pedidos pagos'}`} now={t.site_pieces} before={p.site_pieces} />
            <Stat label="Faturamento do site" value={price(t.site_revenue_cents)} sub={t.site_orders ? `Ticket médio ${price(Math.round(t.site_revenue_cents / t.site_orders))}` : 'Nenhum pedido pago'} now={t.site_revenue_cents} before={p.site_revenue_cents} />
            <Stat label="Cliques no WhatsApp" value={t.whatsapp_clicks} sub="Vezes que abriram a conversa pelo site" now={t.whatsapp_clicks} before={p.whatsapp_clicks} />
            <Stat label="Vendas pelo WhatsApp" value={t.whatsapp_pieces} sub={<>{t.whatsapp_pieces === 1 ? 'peça' : 'peças'} · {price(t.whatsapp_amount_cents)} · <Link to="/admin/whatsapp">lançar venda</Link></>} now={t.whatsapp_pieces} before={p.whatsapp_pieces} />
          </section>

          {totalPieces > 0 && (
            <div className="ad-split" aria-label="Divisão das peças vendidas">
              <span className="ad-label">De onde vieram as {totalPieces} peças vendidas</span>
              <div className="ad-split-bar">
                {t.site_pieces > 0 && <i style={{ flex: t.site_pieces }} className="site" />}
                {t.whatsapp_pieces > 0 && <i style={{ flex: t.whatsapp_pieces }} className="wa" />}
              </div>
              <div className="ad-split-legend">
                <span><em className="site" />Site · {t.site_pieces} ({Math.round((t.site_pieces / totalPieces) * 100)}%)</span>
                <span><em className="wa" />WhatsApp · {t.whatsapp_pieces} ({Math.round((t.whatsapp_pieces / totalPieces) * 100)}%)</span>
              </div>
            </div>
          )}

          <section className="ad-charts">
            <DayBars title="Peças vendidas no site, por dia" values={data.days.map((d) => d.site_pieces)} unit={['peça', 'peças']} month={month} />
            <DayBars title="Cliques no WhatsApp, por dia" values={data.days.map((d) => d.whatsapp_clicks)} unit={['clique', 'cliques']} month={month} />
          </section>

          <section className="ad-card">
            <h2>Por peça</h2>
            {data.products.length === 0 ? <p className="ad-muted">Nenhuma venda ou clique em peças neste mês.</p> : (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Peça</th><th className="num">Vendidas no site</th><th className="num">Faturamento</th><th className="num">Cliques no WhatsApp</th></tr></thead>
                  <tbody>
                    {data.products.map((r) => (
                      <tr key={r.name}><td>{r.name}</td><td className="num">{r.site_qty}</td><td className="num">{price(r.site_revenue_cents)}</td><td className="num">{r.wa_clicks}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="ad-hint">Os cliques mostram interesse: a conversa foi aberta, mas o sistema não sabe se a venda fechou. Lance as vendas fechadas em <Link to="/admin/whatsapp">Vendas WhatsApp</Link>.</p>
          </section>

          <section className="ad-grid3">
            <div className="ad-card">
              <h2>Tamanhos vendidos</h2>
              {data.by_size.length === 0 ? <p className="ad-muted">—</p> : (
                <ul className="ad-mini">{data.by_size.map((s) => <li key={s.size}><span>{s.size}</span><i style={{ width: `${(s.qty / data.by_size[0].qty) * 100}%` }} /><b>{s.qty}</b></li>)}</ul>
              )}
            </div>
            <div className="ad-card">
              <h2>Forma de pagamento</h2>
              {data.by_method.length === 0 ? <p className="ad-muted">—</p> : (
                <ul className="ad-kv">{data.by_method.map((m) => <li key={m.method}><span>{METHOD[m.method] || m.method}</span><b>{m.orders} · {price(m.revenue_cents)}</b></li>)}</ul>
              )}
            </div>
            <div className="ad-card">
              <h2>Onde clicaram no WhatsApp</h2>
              {data.clicks_by_source.length === 0 ? <p className="ad-muted">—</p> : (
                <ul className="ad-kv">{data.clicks_by_source.map((s) => <li key={s.source}><span>{SOURCE[s.source] || s.source}</span><b>{s.clicks}</b></li>)}</ul>
              )}
            </div>
          </section>

          {data.whatsapp_sales.length > 0 && (
            <section className="ad-card">
              <h2>Vendas lançadas pelo WhatsApp</h2>
              <ul className="ad-kv">{data.whatsapp_sales.map((s) => (
                <li key={s.id}><span>{fmtDate(s.sold_at, false)} — {s.product_name || s.description} ({s.qty}x)</span><b>{price(s.amount_cents)}</b></li>
              ))}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
