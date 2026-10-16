import { useEffect, useState } from 'react'
import { api, type Ref } from '../lib/api'
import { centsToInput, Field, inputToCents, MoneyInput, PageHead, useToast } from './ui'

type S = {
  store_name: string; store_tagline: string; instagram_url: string; tiktok_url: string
  whatsapp_number: string; whatsapp_message: string
  shipping_flat_cents: number; free_shipping_min_cents: number; max_installments: number
}
type Taxonomy = { categories: Ref[]; collections: (Ref & { description: string })[] }

export default function Settings() {
  const toast = useToast()
  const [s, setS] = useState<S | null>(null)
  const [ship, setShip] = useState('')
  const [freeMin, setFreeMin] = useState('')
  const [busy, setBusy] = useState(false)
  const [subs, setSubs] = useState(0)

  useEffect(() => {
    api<S>('/admin/settings').then((d) => { setS(d); setShip(centsToInput(d.shipping_flat_cents)); setFreeMin(centsToInput(d.free_shipping_min_cents)) })
    api<{ subscribers: number }>('/admin/overview').then((o) => setSubs(o.subscribers))
  }, [])

  if (!s) return <div className="ad-page"><div className="ad-empty">Carregando…</div></div>
  const set = (patch: Partial<S>) => setS({ ...s, ...patch })
  const wa = s.whatsapp_number.replace(/\D/g, '')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api<S>('/admin/settings', {
        method: 'PUT',
        body: {
          store_name: s.store_name, store_tagline: s.store_tagline, instagram_url: s.instagram_url, tiktok_url: s.tiktok_url,
          whatsapp_number: s.whatsapp_number, whatsapp_message: s.whatsapp_message,
          shipping_flat_cents: inputToCents(ship), free_shipping_min_cents: inputToCents(freeMin), max_installments: s.max_installments,
        },
      })
      setS(d)
      toast('Configurações salvas')
    } catch (err) { toast((err as Error).message, 'error') }
    setBusy(false)
  }

  return (
    <div className="ad-page">
      <PageHead title="Configurações" />
      <form onSubmit={save} className="ad-detail">
        <div className="ad-col">
          <section className="ad-card">
            <h2>WhatsApp</h2>
            <Field label="Número com DDI e DDD" hint={wa.length >= 12 ? <>Teste: <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">abrir conversa ↗</a></> : 'Só números. Ex.: 55 85 99999 9999'}>
              <input inputMode="tel" value={s.whatsapp_number} onChange={(e) => set({ whatsapp_number: e.target.value })} placeholder="5585999999999" />
            </Field>
            <Field label="Mensagem pronta (botão geral)" hint="Na página de uma peça, a mensagem já vai com o nome, a cor, o tamanho e o preço.">
              <textarea rows={2} value={s.whatsapp_message} onChange={(e) => set({ whatsapp_message: e.target.value })} />
            </Field>
          </section>
          <section className="ad-card">
            <h2>Frete e parcelamento</h2>
            <div className="ad-row">
              <Field label="Frete fixo" className="grow" hint="Cobrado em todos os pedidos."><MoneyInput value={ship} onChange={setShip} /></Field>
              <Field label="Frete grátis acima de" className="grow" hint="Deixe vazio para nunca dar frete grátis."><MoneyInput value={freeMin} onChange={setFreeMin} /></Field>
            </div>
            <Field label="Máximo de parcelas no cartão" hint="Os juros seguem o que está configurado na sua conta do Mercado Pago.">
              <select value={s.max_installments} onChange={(e) => set({ max_installments: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Só à vista' : `Até ${n}x`}</option>)}
              </select>
            </Field>
          </section>
          <section className="ad-card">
            <h2>Loja</h2>
            <Field label="Nome da loja"><input value={s.store_name} onChange={(e) => set({ store_name: e.target.value })} /></Field>
            <Field label="Texto do rodapé"><textarea rows={2} value={s.store_tagline} onChange={(e) => set({ store_tagline: e.target.value })} /></Field>
            <div className="ad-row">
              <Field label="Instagram" className="grow"><input value={s.instagram_url} onChange={(e) => set({ instagram_url: e.target.value })} placeholder="https://instagram.com/…" /></Field>
              <Field label="TikTok" className="grow"><input value={s.tiktok_url} onChange={(e) => set({ tiktok_url: e.target.value })} placeholder="https://tiktok.com/@…" /></Field>
            </div>
          </section>
          <button className="ad-btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configurações'}</button>
        </div>
        <div className="ad-col">
          <TaxonomyEditor />
          <section className="ad-card">
            <h2>Newsletter</h2>
            <p className="ad-muted">{subs} {subs === 1 ? 'e-mail cadastrado' : 'e-mails cadastrados'} pelo rodapé do site.</p>
            <a className="ad-btn small" href="/api/admin/subscribers.csv">Baixar lista</a>
          </section>
          <PasswordCard />
        </div>
      </form>
    </div>
  )
}

function TaxonomyEditor() {
  const toast = useToast()
  const [tax, setTax] = useState<Taxonomy | null>(null)
  const [newCat, setNewCat] = useState('')
  const [newCol, setNewCol] = useState('')
  useEffect(() => { api<Taxonomy>('/admin/taxonomy').then(setTax) }, [])
  if (!tax) return null

  const run = async (fn: () => Promise<Taxonomy>, msg: string) => {
    try { setTax(await fn()); toast(msg) } catch (e) { toast((e as Error).message, 'error') }
  }
  const List = ({ kind, items, value, setValue }: { kind: 'categories' | 'collections'; items: Ref[]; value: string; setValue: (v: string) => void }) => (
    <>
      <ul className="ad-taxo">
        {items.map((c) => (
          <li key={c.id}>
            <input defaultValue={c.name} aria-label="Nome"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) run(() => api<Taxonomy>(`/admin/${kind}/${c.id}`, { method: 'PUT', body: { name: v } }), 'Nome atualizado') }} />
            <button type="button" className="ad-x" aria-label={`Apagar ${c.name}`}
              onClick={() => confirm(`Apagar "${c.name}"? As peças continuam no site, só ficam sem ${kind === 'categories' ? 'categoria' : 'coleção'}.`) && run(() => api<Taxonomy>(`/admin/${kind}/${c.id}`, { method: 'DELETE' }), 'Apagado')}>×</button>
          </li>
        ))}
      </ul>
      <div className="ad-inline">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'categories' ? 'Nova categoria' : 'Nova coleção'}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click() } }} />
        <button type="button" className="ad-btn small" disabled={!value.trim()}
          onClick={() => run(() => api<Taxonomy>(`/admin/${kind}`, { body: { name: value.trim() } }), 'Adicionado').then(() => setValue(''))}>Adicionar</button>
      </div>
    </>
  )
  return (
    <>
      <section className="ad-card">
        <h2>Categorias</h2>
        <p className="ad-hint">Aparecem no menu “Loja” e nos filtros. Clique no nome para renomear.</p>
        {List({ kind: 'categories', items: tax.categories, value: newCat, setValue: setNewCat })}
      </section>
      <section className="ad-card">
        <h2>Coleções</h2>
        <p className="ad-hint">Aparecem no menu “Coleções”. A primeira da lista é a destacada.</p>
        {List({ kind: 'collections', items: tax.collections, value: newCol, setValue: setNewCol })}
      </section>
    </>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = async () => {
    try {
      await api('/admin/password', { method: 'PUT', body: { current, next } })
      toast('Senha alterada'); setCurrent(''); setNext('')
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <section className="ad-card">
      <h2>Senha do painel</h2>
      <Field label="Senha atual"><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres."><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <button type="button" className="ad-btn" disabled={!current || next.length < 8} onClick={change}>Trocar senha</button>
    </section>
  )
}
