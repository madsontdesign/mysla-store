import { useEffect, useState } from 'react'
import { api, type Banner, type Ref } from '../lib/api'
import { Field, ImagePicker, PageHead, Toggle, useToast } from './ui'

type Announcement = { enabled: boolean; text: string; ends_at: string | null }
type Settings = { hero: Banner; campaign: Banner; announcement: Announcement }
type Taxonomy = { categories: Ref[]; collections: Ref[] }

function LinkPicker({ value, onChange, tax }: { value: string; onChange: (v: string) => void; tax: Taxonomy }) {
  const options: [string, string][] = [
    ['/produtos', 'Toda a loja'],
    ['/produtos?ordem=novidades', 'Novidades'],
    ['/produtos?ordem=mais-vendidos', 'Mais vendidos'],
    ...tax.collections.map((c): [string, string] => [`/produtos?colecao=${c.slug}`, `Coleção: ${c.name}`]),
    ...tax.categories.map((c): [string, string] => [`/produtos?categoria=${c.slug}`, `Categoria: ${c.name}`]),
  ]
  const known = options.some(([v]) => v === value)
  return (
    <div className="ad-inline">
      <select value={known ? value : '__custom'} onChange={(e) => onChange(e.target.value === '__custom' ? '' : e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        <option value="__custom">Outro endereço…</option>
      </select>
      {!known && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/produto/vestido-sienna" />}
    </div>
  )
}

// datetime-local ⇄ ISO
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function Showcase() {
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [saved, setSaved] = useState('')
  const [tax, setTax] = useState<Taxonomy>({ categories: [], collections: [] })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Settings>('/admin/settings').then((d) => { const v = { hero: d.hero, campaign: d.campaign, announcement: d.announcement }; setS(v); setSaved(JSON.stringify(v)) })
    api<Taxonomy>('/admin/taxonomy').then(setTax)
  }, [])

  if (!s) return <div className="ad-page"><div className="ad-empty">Carregando…</div></div>
  const dirty = JSON.stringify(s) !== saved
  const hero = (patch: Partial<Banner>) => setS({ ...s, hero: { ...s.hero, ...patch } })
  const camp = (patch: Partial<Banner>) => setS({ ...s, campaign: { ...s.campaign, ...patch } })
  const ann = (patch: Partial<Announcement>) => setS({ ...s, announcement: { ...s.announcement, ...patch } })
  const expired = s.announcement.ends_at && new Date(s.announcement.ends_at) < new Date()

  const save = async () => {
    setBusy(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: s })
      setSaved(JSON.stringify(s))
      toast('Vitrine atualizada — já está no ar')
    } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }

  return (
    <div className="ad-page">
      <PageHead title="Banner e tarja" sub="O que aparece no topo e na home da loja.">
        <a className="ad-btn small ghost" href="/inicio" target="_blank" rel="noreferrer">Ver home ↗</a>
        <button className="ad-btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Salvando…' : dirty ? 'Publicar alterações' : 'Tudo salvo'}</button>
      </PageHead>

      {/* ---------- tarja ---------- */}
      <section className="ad-card">
        <div className="ad-card-head">
          <h2>Tarja de promoção</h2>
          <Toggle checked={s.announcement.enabled} onChange={(v) => ann({ enabled: v })} label={s.announcement.enabled ? 'Ligada' : 'Desligada'} />
        </div>
        <div className={`ad-preview-bar ${s.announcement.enabled && !expired ? '' : 'off'}`}>{s.announcement.text || 'Escreva o texto da tarja'}</div>
        <div className="ad-row">
          <Field label="Texto" className="grow" hint="Curto e direto. Aparece em letras maiúsculas.">
            <input value={s.announcement.text} maxLength={90} onChange={(e) => ann({ text: e.target.value.toUpperCase() })} placeholder="FRETE GRÁTIS ACIMA DE R$ 199" />
          </Field>
          <Field label="Sair do ar em (opcional)" hint={expired ? 'Essa data já passou: a tarja não aparece.' : 'Deixe vazio para ficar até você desligar.'}>
            <input type="datetime-local" value={toLocalInput(s.announcement.ends_at)} onChange={(e) => ann({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </Field>
        </div>
      </section>

      {/* ---------- banner principal ---------- */}
      <section className="ad-card">
        <h2>Banner principal (coleção atual)</h2>
        <div className="ad-hero-preview">
          <div className="copy">
            <small>{s.hero.eyebrow}</small>
            <b>{s.hero.title.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</b>
            <p>{s.hero.subtitle}</p>
            <u>{s.hero.cta_label} →</u>
          </div>
          <div className="img">{s.hero.image && <img src={s.hero.image} alt="" />}</div>
        </div>
        <div className="ad-row">
          <div className="grow">
            <Field label="Linha de cima"><input value={s.hero.eyebrow} onChange={(e) => hero({ eyebrow: e.target.value.toUpperCase() })} placeholder="COLEÇÃO ATUAL / 02—26" /></Field>
            <Field label="Título" hint="Aperte Enter para quebrar a linha."><textarea rows={2} value={s.hero.title} onChange={(e) => hero({ title: e.target.value.toUpperCase() })} /></Field>
            <Field label="Frase de apoio"><input value={s.hero.subtitle || ''} onChange={(e) => hero({ subtitle: e.target.value })} /></Field>
            <div className="ad-row">
              <Field label="Texto do botão" className="grow"><input value={s.hero.cta_label} onChange={(e) => hero({ cta_label: e.target.value.toUpperCase() })} /></Field>
              <Field label="Para onde o botão leva" className="grow"><LinkPicker value={s.hero.cta_link} onChange={(v) => hero({ cta_link: v })} tax={tax} /></Field>
            </div>
            <Field label="Legenda sobre a foto (opcional)"><input value={s.hero.caption || ''} onChange={(e) => hero({ caption: e.target.value.toUpperCase() })} /></Field>
          </div>
          <div className="ad-images">
            <ImagePicker label="Foto — computador" value={s.hero.image} onChange={(v) => hero({ image: v })} aspect="16 / 10" hint="Horizontal, 1800px de largura ou mais." />
            <ImagePicker label="Foto — celular (opcional)" value={s.hero.image_mobile || ''} onChange={(v) => hero({ image_mobile: v })} aspect="3 / 4" hint="Vertical. Se vazio, usa a do computador." />
          </div>
        </div>
      </section>

      {/* ---------- banner de campanha ---------- */}
      <section className="ad-card">
        <h2>Banner de campanha (meio da home)</h2>
        <div className="ad-row">
          <div className="grow">
            <Field label="Linha de cima"><input value={s.campaign.eyebrow} onChange={(e) => camp({ eyebrow: e.target.value.toUpperCase() })} /></Field>
            <Field label="Título" hint="Aperte Enter para quebrar a linha."><textarea rows={2} value={s.campaign.title} onChange={(e) => camp({ title: e.target.value.toUpperCase() })} /></Field>
            <div className="ad-row">
              <Field label="Texto do botão" className="grow"><input value={s.campaign.cta_label} onChange={(e) => camp({ cta_label: e.target.value.toUpperCase() })} /></Field>
              <Field label="Para onde o botão leva" className="grow"><LinkPicker value={s.campaign.cta_link} onChange={(v) => camp({ cta_link: v })} tax={tax} /></Field>
            </div>
          </div>
          <div className="ad-images">
            <ImagePicker label="Foto" value={s.campaign.image} onChange={(v) => camp({ image: v })} aspect="4 / 3" hint="Aparece em preto e branco na loja. Sem foto, a seção some." />
          </div>
        </div>
      </section>

      {dirty && <div className="ad-savebar"><span>Há alterações não publicadas.</span><button className="ad-btn primary" disabled={busy} onClick={save}>Publicar alterações</button></div>}
    </div>
  )
}
