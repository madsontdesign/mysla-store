import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, price, STATUS_LABEL, type Order } from '../lib/api'
import { fmtDate, PageHead, useToast } from './ui'

type Row = { id: number; code: string; status: Order['status']; payment_method: string | null; customer_name: string; total_cents: number; created_at: string; paid_at: string | null; pieces: number }
type AdminOrder = Omit<Order, 'items'> & {
  id: number; customer_cpf: string; customer_phone: string; notes: string | null; installments: number | null; mp_payment_id: string | null
  items: (Order['items'][number] & { id: number })[]
}

const TABS: [string, string][] = [['', 'Todos'], ['paid', 'Pagos — para enviar'], ['pending', 'Aguardando pagamento'], ['shipped', 'Enviados'], ['delivered', 'Entregues'], ['cancelled', 'Cancelados']]

export function StatusPill({ status }: { status: Order['status'] }) {
  return <span className={`ad-pill ${status}`}>{STATUS_LABEL[status]}</span>
}

export function Orders({ onChange }: { onChange: (n: number) => void }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [q, setQ] = useState(params.get('q') || '')
  const [data, setData] = useState<{ orders: Row[]; counts: Record<string, number> } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (q.trim()) qs.set('q', q.trim())
      api<{ orders: Row[]; counts: Record<string, number> }>(`/admin/orders?${qs}`).then((d) => { setData(d); onChange(d.counts.paid || 0) })
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [status, q])

  return (
    <div className="ad-page">
      <PageHead title="Pedidos" sub="Pedidos pagos aparecem primeiro na aba “Pagos — para enviar”.">
        <input className="ad-search" placeholder="Buscar por código, nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHead>
      <div className="ad-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={status === k ? 'active' : ''} onClick={() => setParams(k ? { status: k } : {})}>
            {label}{k && data?.counts[k] ? <em>{data.counts[k]}</em> : null}
          </button>
        ))}
      </div>
      {!data ? <div className="ad-empty">Carregando…</div> : data.orders.length === 0 ? (
        <div className="ad-empty">Nenhum pedido aqui ainda.</div>
      ) : (
        <div className="ad-table-wrap ad-card flush">
          <table className="ad-table rows-link">
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th className="num">Peças</th><th className="num">Total</th><th>Pagamento</th><th>Status</th></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/admin/pedidos/${o.code}`}>{o.code}</Link></td>
                  <td>{o.customer_name}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td className="num">{o.pieces}</td>
                  <td className="num">{price(o.total_cents)}</td>
                  <td>{o.payment_method === 'pix' ? 'Pix' : o.payment_method === 'card' ? 'Cartão' : '—'}</td>
                  <td><StatusPill status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const NEXT: Partial<Record<Order['status'], [Order['status'], string]>> = {
  paid: ['shipped', 'Marcar como enviado'],
  shipped: ['delivered', 'Marcar como entregue'],
}

export function OrderDetail({ onChange }: { onChange: (n: number) => void }) {
  const { code = '' } = useParams()
  const toast = useToast()
  const [o, setO] = useState<AdminOrder | null>(null)
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api<AdminOrder>(`/admin/orders/${code}`).then((d) => { setO(d); setTracking(d.tracking_code || ''); setNotes(d.notes || '') })
  useEffect(() => { load() }, [code])

  const save = async (patch: Record<string, unknown>, msg: string) => {
    setBusy(true)
    try {
      const d = await api<AdminOrder>(`/admin/orders/${code}`, { method: 'PUT', body: patch })
      setO(d)
      toast(msg)
      api<{ awaiting_shipment: number }>('/admin/overview').then((x) => onChange(x.awaiting_shipment))
    } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }

  if (!o) return <div className="ad-page"><div className="ad-empty">Carregando…</div></div>
  const a = o.address
  const phone = o.customer_phone
  const waCustomer = `https://wa.me/55${phone}?text=${encodeURIComponent(`Olá, ${o.customer_name.split(' ')[0]}! Aqui é da MYSLA, sobre o seu pedido ${o.code}.`)}`
  const next = NEXT[o.status]
  const addressText = `${o.customer_name}\n${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ''}\n${a.district} — ${a.city}/${a.state}\nCEP ${a.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}`

  return (
    <div className="ad-page">
      <Link className="ad-back" to="/admin/pedidos">← Pedidos</Link>
      <PageHead title={`Pedido ${o.code}`} sub={<>Feito em {fmtDate(o.created_at)}{o.paid_at && <> · pago em {fmtDate(o.paid_at)}</>}</>}>
        <StatusPill status={o.status} />
      </PageHead>

      <div className="ad-detail">
        <div className="ad-col">
          <section className="ad-card">
            <h2>Peças</h2>
            <div className="ad-items">
              {o.items.map((i) => (
                <div key={i.id} className="ad-item">
                  {i.image ? <img src={i.image} alt="" /> : <div className="ad-thumb" />}
                  <div><b>{i.name}</b><small>{i.color} / {i.size}</small></div>
                  <span>{i.qty}x {price(i.unit_cents)}</span>
                </div>
              ))}
            </div>
            <ul className="ad-kv totals">
              <li><span>Subtotal</span><b>{price(o.subtotal_cents)}</b></li>
              <li><span>Frete</span><b>{o.shipping_cents ? price(o.shipping_cents) : 'Grátis'}</b></li>
              <li className="grand"><span>Total</span><b>{price(o.total_cents)}</b></li>
            </ul>
            <p className="ad-hint">
              {o.payment_method === 'pix' ? 'Pix' : o.payment_method === 'card' ? `Cartão${o.installments && o.installments > 1 ? ` em ${o.installments}x` : ''}` : 'Pagamento não iniciado'}
              {o.mp_payment_id && !o.mp_payment_id.startsWith('demo') && <> · Mercado Pago nº {o.mp_payment_id}</>}
              {o.payment_status && <> · status no Mercado Pago: {o.payment_status}</>}
            </p>
          </section>

          <section className="ad-card">
            <h2>Envio</h2>
            <Field2 label="Código de rastreio">
              <div className="ad-inline">
                <input value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} placeholder="Ex.: AA123456789BR" />
                <button className="ad-btn" disabled={busy || tracking === (o.tracking_code || '')} onClick={() => save({ tracking_code: tracking }, 'Rastreio salvo')}>Salvar</button>
              </div>
            </Field2>
            <p className="ad-hint">A cliente vê o código na página do pedido dela.</p>
            {next && (
              <button className="ad-btn primary" disabled={busy} onClick={() => save({ status: next[0], ...(tracking !== (o.tracking_code || '') ? { tracking_code: tracking } : {}) }, 'Pedido atualizado')}>
                {next[1]}
              </button>
            )}
          </section>

          <section className="ad-card">
            <h2>Anotações internas</h2>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Só a equipe vê." />
            <button className="ad-btn" disabled={busy || notes === (o.notes || '')} onClick={() => save({ notes }, 'Anotação salva')}>Salvar anotação</button>
          </section>
        </div>

        <div className="ad-col">
          <section className="ad-card">
            <h2>Cliente</h2>
            <ul className="ad-kv">
              <li><span>Nome</span><b>{o.customer_name}</b></li>
              <li><span>E-mail</span><b><a href={`mailto:${o.customer_email}`}>{o.customer_email}</a></b></li>
              <li><span>Celular</span><b>{phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')}</b></li>
              <li><span>CPF</span><b>{o.customer_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</b></li>
            </ul>
            <a className="ad-btn block" href={waCustomer} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
          </section>
          <section className="ad-card">
            <h2>Endereço de entrega</h2>
            <pre className="ad-address">{addressText}</pre>
            <button className="ad-btn small ghost" onClick={() => navigator.clipboard.writeText(addressText).then(() => toast('Endereço copiado'))}>Copiar endereço</button>
          </section>
          <section className="ad-card">
            <h2>Mudar status manualmente</h2>
            <select value={o.status} disabled={busy} onChange={(e) => {
              const s = e.target.value as Order['status']
              if (s === 'cancelled' && !confirm('Cancelar o pedido? As peças voltam para o estoque. Se já foi pago, faça o estorno no Mercado Pago.')) return
              save({ status: s }, 'Status atualizado')
            }}>
              {(Object.keys(STATUS_LABEL) as Order['status'][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <p className="ad-hint">O status muda sozinho quando o pagamento é aprovado. Use isto só para ajustes (ex.: pagamento combinado por fora).</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ad-field"><span className="ad-label">{label}</span>{children}</div>
}
