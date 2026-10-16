import { useEffect, useState } from 'react'
import { api, price, sortSizes, type Product } from '../lib/api'
import { centsToInput, Field, fmtDate, inputToCents, monthLabel, MoneyInput, PageHead, shiftMonth, thisMonth, useToast } from './ui'

type Sale = { id: number; sold_at: string; qty: number; amount_cents: number; description: string; product_name: string | null }
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function WhatsAppSales() {
  const toast = useToast()
  const [month, setMonth] = useState(thisMonth())
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [clicks, setClicks] = useState<number | null>(null)
  const [products, setProducts] = useState<Product[]>([])

  const [soldAt, setSoldAt] = useState(today())
  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState('1')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    api<Sale[]>(`/admin/whatsapp-sales?month=${month}`).then(setSales)
    api<{ totals: { whatsapp_clicks: number } }>(`/admin/report?month=${month}`).then((r) => setClicks(r.totals.whatsapp_clicks))
  }
  useEffect(load, [month])
  useEffect(() => { api<Product[]>('/admin/products').then(setProducts) }, [])

  const product = products.find((p) => String(p.id) === productId)
  // Sugere o valor = preço × quantidade sempre que a peça ou a quantidade mudam
  useEffect(() => {
    if (product) setAmount(centsToInput(product.price_cents * (Number(qty) || 1)))
  }, [productId, qty])
  useEffect(() => setVariantId(''), [productId])

  const sizeOrder = product ? sortSizes(product.variants.map((v) => v.size)) : []
  const variants = product ? [...product.variants].sort((a, b) => a.color.localeCompare(b.color) || sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size)) : []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/admin/whatsapp-sales', {
        body: { sold_at: soldAt, product_id: productId || null, variant_id: variantId || null, qty: Number(qty) || 1, amount_cents: inputToCents(amount), description },
      })
      toast(variantId ? 'Venda lançada e estoque atualizado' : 'Venda lançada')
      setProductId(''); setQty('1'); setAmount(''); setDescription('')
      if (soldAt.slice(0, 7) !== month) setMonth(soldAt.slice(0, 7)); else load()
    } catch (err) { toast((err as Error).message, 'error') }
    setBusy(false)
  }

  const remove = async (s: Sale) => {
    if (!confirm('Apagar este lançamento? (O estoque não volta sozinho — ajuste na peça se precisar.)')) return
    await api(`/admin/whatsapp-sales/${s.id}`, { method: 'DELETE' })
    load()
  }

  const totalQty = (sales || []).reduce((n, s) => n + s.qty, 0)
  const totalAmount = (sales || []).reduce((n, s) => n + s.amount_cents, 0)

  return (
    <div className="ad-page">
      <PageHead title="Vendas pelo WhatsApp" sub="O site conta os cliques sozinho. As vendas fechadas na conversa você lança aqui, para o relatório comparar site × WhatsApp." />

      <div className="ad-detail">
        <form className="ad-card ad-col" onSubmit={submit}>
          <h2>Lançar venda</h2>
          <div className="ad-row">
            <Field label="Data" className="grow"><input type="date" value={soldAt} max={today()} onChange={(e) => setSoldAt(e.target.value)} required /></Field>
            <Field label="Quantidade"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} required /></Field>
          </div>
          <Field label="Peça">
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Outra / várias peças</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {product && (
            <Field label="Cor e tamanho (opcional)" hint="Escolha para baixar a peça do estoque do site.">
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">Não baixar do estoque</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.color} / {v.size} — {v.stock} em estoque</option>)}
              </select>
            </Field>
          )}
          {!product && (
            <Field label="Descrição"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: 2 tops + 1 saia" required={!productId} /></Field>
          )}
          <Field label="Valor total recebido"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <button className="ad-btn primary" disabled={busy}>{busy ? 'Lançando…' : 'Lançar venda'}</button>
        </form>

        <div className="ad-col">
          <div className="ad-card">
            <div className="ad-card-head">
              <h2>{monthLabel(month)}</h2>
              <div className="ad-month">
                <button className="ad-btn small ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">←</button>
                <button className="ad-btn small ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Próximo mês">→</button>
              </div>
            </div>
            <div className="ad-stats compact">
              <div className="ad-stat"><span className="ad-label">Cliques no WhatsApp</span><b>{clicks ?? '—'}</b></div>
              <div className="ad-stat"><span className="ad-label">Peças vendidas</span><b>{totalQty}</b></div>
              <div className="ad-stat"><span className="ad-label">Valor</span><b>{price(totalAmount)}</b></div>
            </div>
            {!sales ? <p className="ad-muted">Carregando…</p> : sales.length === 0 ? <p className="ad-muted">Nenhuma venda lançada neste mês.</p> : (
              <ul className="ad-kv ad-sales">
                {sales.map((s) => (
                  <li key={s.id}>
                    <span>{fmtDate(s.sold_at, false)} · {s.product_name || s.description} · {s.qty}x</span>
                    <b>{price(s.amount_cents)} <button className="ad-x" onClick={() => remove(s)} aria-label="Apagar lançamento">×</button></b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
