import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, price, STATUS_LABEL, type Order } from '../lib/api'
import { useStore } from './StoreContext'
import { Loading, TextLink } from './components'

const LAST_ORDER = 'mysla.lastOrder'

// ---------- máscaras ----------
const digits = (s: string) => s.replace(/\D/g, '')
const maskCpf = (s: string) => digits(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const maskPhone = (s: string) => {
  const d = digits(s).slice(0, 11)
  return d.length <= 10 ? d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2') : d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}
const maskCep = (s: string) => digits(s).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')

type Form = {
  name: string; email: string; cpf: string; phone: string
  cep: string; street: string; number: string; complement: string; district: string; city: string; state: string
}
const EMPTY: Form = { name: '', email: '', cpf: '', phone: '', cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' }
const SAVED = 'mysla.checkout'

// ---------- Checkout ----------
export function Checkout() {
  const { info, bag, subtotal, loading } = useStore()
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(SAVED) || '{}') } } catch { return EMPTY }
  })
  const [method, setMethod] = useState<'pix' | 'card'>('pix')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cepState, setCepState] = useState<'idle' | 'loading' | 'error'>('idle')
  const numberRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => {
    // guarda os dados (menos o CPF) para a próxima compra
    const { cpf: _cpf, ...rest } = form
    try { localStorage.setItem(SAVED, JSON.stringify(rest)) } catch { /* ok */ }
  }, [form])

  // Busca o endereço pelo CEP (ViaCEP, serviço público e gratuito)
  useEffect(() => {
    const cep = digits(form.cep)
    if (cep.length !== 8) return
    let alive = true
    setCepState('loading')
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.erro) { setCepState('error'); return }
        setForm((f) => ({ ...f, street: d.logradouro || f.street, district: d.bairro || f.district, city: d.localidade || f.city, state: d.uf || f.state }))
        setCepState('idle')
        setTimeout(() => numberRef.current?.focus(), 50)
      })
      .catch(() => alive && setCepState('idle'))
    return () => { alive = false }
  }, [form.cep])

  const freeMin = info?.free_shipping_min_cents || 0
  const shipping = freeMin > 0 && subtotal >= freeMin ? 0 : info?.shipping_flat_cents || 0
  const total = subtotal + shipping

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const order = await api<Order>('/orders', {
        body: {
          items: bag.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          customer: { name: form.name, email: form.email, cpf: form.cpf, phone: form.phone },
          address: { cep: form.cep, street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city, state: form.state },
        },
      })
      try { sessionStorage.setItem(LAST_ORDER, order.code) } catch { /* ok */ }
      navigate(`/pedido/${order.code}?t=${order.token}&pagar=${method}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o pedido. Tente de novo.')
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (!bag.length) {
    return (
      <main className="empty-state page">
        <span>SUA SACOLA ESTÁ VAZIA</span>
        <p>Adicione peças para finalizar a compra.</p>
        <TextLink to="/produtos">VER A COLEÇÃO →</TextLink>
      </main>
    )
  }

  return (
    <main className="checkout">
      <form className="checkout-form" onSubmit={submit}>
        <h1 className="checkout-title">FINALIZAR COMPRA</h1>

        <fieldset>
          <legend>01 / SEUS DADOS</legend>
          <Field label="Nome completo" value={form.name} onChange={(v) => set('name', v)} autoComplete="name" required />
          <Field label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} autoComplete="email" required hint="Usamos para falar com você sobre o pedido." />
          <div className="field-row">
            <Field label="CPF" value={form.cpf} onChange={(v) => set('cpf', maskCpf(v))} inputMode="numeric" required />
            <Field label="Celular (WhatsApp)" value={form.phone} onChange={(v) => set('phone', maskPhone(v))} inputMode="tel" autoComplete="tel" required />
          </div>
        </fieldset>

        <fieldset>
          <legend>02 / ENTREGA</legend>
          <div className="field-row">
            <Field label="CEP" value={form.cep} onChange={(v) => set('cep', maskCep(v))} inputMode="numeric" autoComplete="postal-code" required
              hint={cepState === 'loading' ? 'Buscando endereço…' : cepState === 'error' ? 'CEP não encontrado. Preencha o endereço abaixo.' : undefined} />
            <Field label="Estado (UF)" value={form.state} onChange={(v) => set('state', v.toUpperCase().slice(0, 2))} required />
          </div>
          <Field label="Rua" value={form.street} onChange={(v) => set('street', v)} autoComplete="address-line1" required />
          <div className="field-row">
            <Field label="Número" value={form.number} onChange={(v) => set('number', v)} inputRef={numberRef} required />
            <Field label="Complemento" value={form.complement} onChange={(v) => set('complement', v)} autoComplete="address-line2" />
          </div>
          <div className="field-row">
            <Field label="Bairro" value={form.district} onChange={(v) => set('district', v)} required />
            <Field label="Cidade" value={form.city} onChange={(v) => set('city', v)} autoComplete="address-level2" required />
          </div>
        </fieldset>

        <fieldset>
          <legend>03 / PAGAMENTO</legend>
          <div className="pay-options" role="radiogroup">
            <label className={method === 'pix' ? 'selected' : ''}>
              <input type="radio" name="method" checked={method === 'pix'} onChange={() => setMethod('pix')} />
              <span>PIX</span><small>Aprovação na hora</small>
            </label>
            <label className={method === 'card' ? 'selected' : ''}>
              <input type="radio" name="method" checked={method === 'card'} onChange={() => setMethod('card')} />
              <span>CARTÃO DE CRÉDITO</span><small>Em até {info?.max_installments || 1}x</small>
            </label>
          </div>
        </fieldset>

        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button" disabled={busy}>{busy ? 'CRIANDO PEDIDO…' : `CONTINUAR PARA O PAGAMENTO — ${price(total)}`}</button>
        <p className="fine-print">Ao continuar, suas peças ficam reservadas por 45 minutos enquanto você paga.</p>
      </form>

      <aside className="checkout-summary">
        <h2>RESUMO ({bag.reduce((n, i) => n + i.qty, 0)})</h2>
        {bag.map((i) => (
          <div className="summary-item" key={i.variantId}>
            <img src={i.product.images[0]} alt="" />
            <div><span>{i.product.name}</span><small>{i.variant.color} / {i.variant.size} · {i.qty}x</small></div>
            <b>{price(i.product.price_cents * i.qty)}</b>
          </div>
        ))}
        <Totals subtotal={subtotal} shipping={shipping} total={total} />
        {shipping > 0 && freeMin > 0 && <small className="fine-print">Faltam {price(freeMin - subtotal)} para o frete grátis.</small>}
      </aside>
    </main>
  )
}

function Totals({ subtotal, shipping, total }: { subtotal: number; shipping: number; total: number }) {
  return (
    <dl className="totals">
      <div><dt>SUBTOTAL</dt><dd>{price(subtotal)}</dd></div>
      <div><dt>FRETE</dt><dd>{shipping ? price(shipping) : 'GRÁTIS'}</dd></div>
      <div className="grand"><dt>TOTAL</dt><dd>{price(total)}</dd></div>
    </dl>
  )
}

type FieldProps = {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; hint?: string
  autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; inputRef?: React.Ref<HTMLInputElement>
}
function Field({ label, value, onChange, type = 'text', required, hint, autoComplete, inputMode, inputRef }: FieldProps) {
  return (
    <label className="field">
      <span>{label}{required ? '' : ' (opcional)'}</span>
      <input ref={inputRef} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoComplete={autoComplete} inputMode={inputMode} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

// ---------- Página do pedido (pagamento + acompanhamento) ----------
export function OrderPage() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const { info, clearBag, reload } = useStore()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'pix' | 'card'>(params.get('pagar') === 'card' ? 'card' : 'pix')

  const load = () => api<Order>(`/orders/${code}?t=${token}`).then(setOrder).catch((e) => setError(e.message))
  useEffect(() => { load() }, [code, token])

  // Confere o status a cada 4s enquanto aguarda pagamento
  useEffect(() => {
    if (order?.status !== 'pending') return
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [order?.status])

  // Pedido pago: esvazia a sacola e atualiza o estoque mostrado na loja
  useEffect(() => {
    if (order && order.status !== 'pending' && order.status !== 'cancelled') {
      try {
        if (sessionStorage.getItem(LAST_ORDER) === order.code) { clearBag(); sessionStorage.removeItem(LAST_ORDER); reload() }
      } catch { /* ok */ }
    }
  }, [order?.status])

  if (error) return <main className="empty-state page"><span>PEDIDO NÃO ENCONTRADO</span><p>Confira o link ou procure pelo código.</p><TextLink to="/meu-pedido">BUSCAR MEU PEDIDO →</TextLink></main>
  if (!order || !info) return <Loading />

  const paid = ['paid', 'shipped', 'delivered'].includes(order.status)
  return (
    <main className="checkout order-page">
      <section className="checkout-form">
        <span className="eyebrow">PEDIDO {order.code}</span>
        {order.status === 'pending' && (
          <>
            <h1 className="checkout-title">PAGAMENTO</h1>
            <div className="pay-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'pix'} className={tab === 'pix' ? 'active' : ''} onClick={() => setTab('pix')}>PIX</button>
              <button role="tab" aria-selected={tab === 'card'} className={tab === 'card' ? 'active' : ''} onClick={() => setTab('card')}>CARTÃO</button>
            </div>
            {info.payments.demo && <div className="demo-note">MODO DEMONSTRAÇÃO — nenhum valor é cobrado. Configure as chaves do Mercado Pago para vender de verdade.</div>}
            {tab === 'pix' ? <PixPay order={order} token={token} demo={info.payments.demo} onPaid={setOrder} />
              : <CardPay order={order} token={token} demo={info.payments.demo} publicKey={info.payments.public_key} maxInstallments={info.max_installments} onDone={setOrder} />}
          </>
        )}
        {paid && (
          <div className="order-done">
            <h1 className="checkout-title">{order.status === 'paid' ? 'PEDIDO CONFIRMADO' : STATUS_LABEL[order.status].toUpperCase()}</h1>
            <p>Obrigada, {order.customer_name.split(' ')[0]}! {order.status === 'paid' ? 'Seu pagamento foi aprovado e já estamos separando suas peças.' : ''}</p>
            <Timeline status={order.status} />
            {order.tracking_code && (
              <div className="tracking">
                <span>CÓDIGO DE RASTREIO</span><b>{order.tracking_code}</b>
                <a className="text-link" href="https://rastreamento.correios.com.br/app/index.php" target="_blank" rel="noreferrer">RASTREAR NOS CORREIOS ↗</a>
              </div>
            )}
            <p className="fine-print">Guarde este link para acompanhar o pedido, ou busque em “Meu pedido” com o código {order.code} e seu e-mail.</p>
            <TextLink to="/produtos">CONTINUAR COMPRANDO →</TextLink>
          </div>
        )}
        {order.status === 'cancelled' && (
          <div className="order-done">
            <h1 className="checkout-title">PEDIDO CANCELADO</h1>
            <p>O prazo de pagamento terminou ou o pedido foi cancelado. As peças voltaram para o estoque.</p>
            <TextLink to="/checkout">TENTAR DE NOVO →</TextLink>
          </div>
        )}
      </section>
      <aside className="checkout-summary">
        <h2>RESUMO</h2>
        {order.items.map((i, idx) => (
          <div className="summary-item" key={idx}>
            {i.image ? <img src={i.image} alt="" /> : <div />}
            <div><span>{i.name}</span><small>{i.color} / {i.size} · {i.qty}x</small></div>
            <b>{price(i.unit_cents * i.qty)}</b>
          </div>
        ))}
        <Totals subtotal={order.subtotal_cents} shipping={order.shipping_cents} total={order.total_cents} />
        <div className="ship-to">
          <span>ENTREGA</span>
          <p>{order.customer_name}<br />{order.address.street}, {order.address.number}{order.address.complement ? ` — ${order.address.complement}` : ''}<br />{order.address.district} · {order.address.city}/{order.address.state} · {maskCep(order.address.cep)}</p>
        </div>
      </aside>
    </main>
  )
}

function Timeline({ status }: { status: Order['status'] }) {
  const steps: Order['status'][] = ['paid', 'shipped', 'delivered']
  const idx = steps.indexOf(status)
  return (
    <ol className="timeline">
      {steps.map((s, i) => <li key={s} className={i <= idx ? 'done' : ''}><i />{STATUS_LABEL[s].toUpperCase()}</li>)}
    </ol>
  )
}

function PixPay({ order, token, demo, onPaid }: { order: Order; token: string; demo: boolean; onPaid: (o: Order) => void }) {
  const [pix, setPix] = useState(order.payment_method === 'pix' ? order.pix : null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (pix && new Date(pix.expires_at).getTime() > Date.now()) return
    api<Order>(`/orders/${order.code}/pix`, { body: { t: token } })
      .then((o) => setPix(o.pix))
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  if (error) return <div className="form-error">{error}</div>
  if (!pix) return <div className="pix-box"><p>Gerando o Pix…</p></div>
  const left = Math.max(0, Math.floor((new Date(pix.expires_at).getTime() - now) / 1000))
  const copy = async () => {
    try { await navigator.clipboard.writeText(pix.qr); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* ok */ }
  }
  return (
    <div className="pix-box">
      <img src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code do Pix" />
      <ol>
        <li>Abra o app do seu banco e escolha <b>Pix → Ler QR Code</b> ou <b>Pix Copia e Cola</b>.</li>
        <li>Pague {price(order.total_cents)}. A confirmação aparece aqui sozinha.</li>
      </ol>
      <button type="button" className="secondary-button" onClick={copy}>{copied ? 'CÓDIGO COPIADO ✓' : 'COPIAR CÓDIGO PIX'}</button>
      <small className="fine-print">{left > 0 ? `Expira em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Este Pix expirou. Recarregue a página para gerar outro.'}</small>
      <div className="waiting"><i />AGUARDANDO PAGAMENTO</div>
      {demo && (
        <button type="button" className="primary-button" onClick={() => api<Order>(`/orders/${order.code}/demo-pay`, { body: { t: token } }).then(onPaid)}>
          SIMULAR PIX PAGO (DEMONSTRAÇÃO)
        </button>
      )}
    </div>
  )
}

declare global {
  interface Window { MercadoPago?: new (key: string, opts: { locale: string }) => { bricks: () => { create: (type: string, id: string, settings: unknown) => Promise<{ unmount: () => void }> } } }
}

function loadMpSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://sdk.mercadopago.com/js/v2'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não foi possível carregar o formulário do cartão.'))
    document.head.appendChild(s)
  })
}

type CardProps = { order: Order; token: string; demo: boolean; publicKey: string; maxInstallments: number; onDone: (o: Order) => void }
function CardPay(props: CardProps) {
  return props.demo ? <DemoCard {...props} /> : <MpCardBrick {...props} />
}

/** Formulário seguro do Mercado Pago: os dados do cartão nunca passam pelo nosso servidor. */
function MpCardBrick({ order, token, publicKey, maxInstallments, onDone }: CardProps) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let controller: { unmount: () => void } | null = null
    let cancelled = false
    loadMpSdk().then(async () => {
      if (cancelled || !window.MercadoPago) return
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
      controller = await mp.bricks().create('cardPayment', 'mp-card-brick', {
        initialization: { amount: order.total_cents / 100, payer: { email: order.customer_email } },
        customization: {
          paymentMethods: { maxInstallments, minInstallments: 1 },
          visual: { style: { theme: 'default', customVariables: { baseColor: '#111111', borderRadiusSmall: '0px', borderRadiusMedium: '0px', borderRadiusLarge: '0px', formBackgroundColor: '#ffffff' } } },
        },
        callbacks: {
          onReady: () => {},
          onError: (e: { message?: string }) => setError(e?.message || 'Erro no formulário do cartão.'),
          onSubmit: (form: Record<string, unknown>) =>
            api<Order>(`/orders/${order.code}/card`, { body: { t: token, form } }).then((o) => {
              if (o.card_result === 'rejected') { setMessage(o.message || 'Pagamento recusado.'); throw new Error('recusado') }
              setMessage(o.message || '')
              onDone(o)
            }).catch((e) => { if (e.message !== 'recusado') setMessage(e.message); throw e }),
        },
      })
    }).catch((e) => setError(e.message))
    return () => { cancelled = true; controller?.unmount() }
  }, [])
  return (
    <div className="card-box">
      {message && <div className="form-error" role="alert">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <div id="mp-card-brick" />
    </div>
  )
}

/** Formulário de cartão de mentira, só para testar a loja sem as chaves do Mercado Pago. */
function DemoCard({ order, token, maxInstallments, onDone }: CardProps) {
  const [holder, setHolder] = useState('')
  const [installments, setInstallments] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pay = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMessage('')
    try {
      const o = await api<Order>(`/orders/${order.code}/card`, { body: { t: token, form: { holder, installments } } })
      if (o.card_result === 'rejected') setMessage(o.message || 'Pagamento recusado.')
      else onDone(o)
    } catch (err) { setMessage((err as Error).message) }
    setBusy(false)
  }
  return (
    <form className="card-box demo-card" onSubmit={pay}>
      {message && <div className="form-error" role="alert">{message}</div>}
      <label className="field"><span>Número do cartão</span><input defaultValue="4242 4242 4242 4242" inputMode="numeric" /></label>
      <label className="field"><span>Nome impresso no cartão</span><input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Digite RECUSAR para simular recusa" required /></label>
      <div className="field-row">
        <label className="field"><span>Validade</span><input defaultValue="12/30" /></label>
        <label className="field"><span>CVV</span><input defaultValue="123" inputMode="numeric" /></label>
      </div>
      <label className="field">
        <span>Parcelas</span>
        <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
          {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x de {price(Math.ceil(order.total_cents / n))}</option>)}
        </select>
      </label>
      <button className="primary-button" disabled={busy}>{busy ? 'PROCESSANDO…' : `PAGAR ${price(order.total_cents)}`}</button>
    </form>
  )
}

// ---------- Buscar pedido ----------
export function OrderLookup() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const r = await api<{ code: string; token: string }>('/orders/lookup', { body: { code, email } })
      navigate(`/pedido/${r.code}?t=${r.token}`)
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <main className="lookup">
      <form onSubmit={submit}>
        <span className="eyebrow">MEU PEDIDO</span>
        <h1 className="checkout-title">ACOMPANHE SUA COMPRA</h1>
        <p>Use o código do pedido (ex.: MY-7K3P9Q) e o e-mail informado na compra.</p>
        <label className="field"><span>Código do pedido</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /></label>
        <label className="field"><span>E-mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button">VER PEDIDO</button>
        <Link className="text-link" to="/produtos">VOLTAR PARA A LOJA →</Link>
      </form>
    </main>
  )
}
