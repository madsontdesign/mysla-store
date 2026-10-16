import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, price, sortSizes, type Product, type Ref } from '../lib/api'
import { centsToInput, Field, inputToCents, MoneyInput, PageHead, Toggle, uploadFiles, useToast } from './ui'

type Taxonomy = { categories: Ref[]; collections: Ref[] }

export function Products() {
  const [list, setList] = useState<Product[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden' | 'out'>('all')
  useEffect(() => { api<Product[]>('/admin/products').then(setList) }, [])

  const shown = (list || []).filter((p) => {
    const stock = p.variants.reduce((n, v) => n + v.stock, 0)
    if (filter === 'active' && !p.active) return false
    if (filter === 'hidden' && p.active) return false
    if (filter === 'out' && stock > 0) return false
    return !q || p.name.toLowerCase().includes(q.toLowerCase())
  })

  return (
    <div className="ad-page">
      <PageHead title="Peças" sub={list ? `${list.length} cadastradas` : undefined}>
        <input className="ad-search" placeholder="Buscar peça" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link className="ad-btn primary" to="/admin/pecas/nova">+ Nova peça</Link>
      </PageHead>
      <div className="ad-tabs">
        {([['all', 'Todas'], ['active', 'Visíveis na loja'], ['hidden', 'Ocultas'], ['out', 'Sem estoque']] as const).map(([k, l]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {!list ? <div className="ad-empty">Carregando…</div> : shown.length === 0 ? <div className="ad-empty">Nenhuma peça encontrada.</div> : (
        <div className="ad-product-list">
          {shown.map((p) => {
            const stock = p.variants.reduce((n, v) => n + v.stock, 0)
            return (
              <Link key={p.id} to={`/admin/pecas/${p.id}`} className="ad-product-row">
                {p.images[0] ? <img src={p.images[0]} alt="" /> : <div className="ad-thumb" />}
                <div className="ad-pr-main">
                  <b>{p.name}</b>
                  <small>{[p.category?.name, p.collection?.name].filter(Boolean).join(' · ') || 'Sem categoria'}</small>
                </div>
                <div className="ad-pr-price">{p.compare_at_cents ? <s>{price(p.compare_at_cents)}</s> : null}{price(p.price_cents)}</div>
                <div className={`ad-pr-stock ${stock === 0 ? 'zero' : stock <= 3 ? 'low' : ''}`}>{stock} em estoque</div>
                <div className="ad-pr-sold">{p.sold} {p.sold === 1 ? 'vendida' : 'vendidas'}</div>
                <span className={`ad-pill ${p.active ? 'paid' : 'cancelled'}`}>{p.active ? 'Visível' : 'Oculta'}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

const DEFAULT_SIZES = ['PP', 'P', 'M', 'G', 'GG']
type Color = { name: string; hex: string }

export function ProductEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [tax, setTax] = useState<Taxonomy>({ categories: [], collections: [] })
  const [loaded, setLoaded] = useState(isNew)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sold, setSold] = useState(0)
  const [slug, setSlug] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [composition, setComposition] = useState('')
  const [priceIn, setPriceIn] = useState('')
  const [compareIn, setCompareIn] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [active, setActive] = useState(true)
  const [images, setImages] = useState<string[]>([])
  const [colors, setColors] = useState<Color[]>([{ name: '', hex: '#111111' }])
  const [sizes, setSizes] = useState<string[]>(DEFAULT_SIZES)
  const [stock, setStock] = useState<Record<string, string>>({})
  const [newSize, setNewSize] = useState('')

  useEffect(() => {
    api<Taxonomy>('/admin/taxonomy').then(setTax)
    if (isNew) return
    api<Product>(`/admin/products/${id}`).then((p) => {
      setName(p.name); setDescription(p.description); setComposition(p.composition)
      setPriceIn(centsToInput(p.price_cents)); setCompareIn(centsToInput(p.compare_at_cents))
      setCategoryId(p.category ? String(p.category.id) : ''); setCollectionId(p.collection ? String(p.collection.id) : '')
      setActive(p.active); setImages(p.images); setSold(p.sold); setSlug(p.slug)
      const cols = [...new Map(p.variants.map((v) => [v.color, { name: v.color, hex: v.color_hex }])).values()]
      setColors(cols.length ? cols : [{ name: '', hex: '#111111' }])
      setSizes(sortSizes(p.variants.map((v) => v.size)))
      setStock(Object.fromEntries(p.variants.map((v) => [`${v.color}|${v.size}`, String(v.stock)])))
      setLoaded(true)
    }).catch(() => navigate('/admin/pecas'))
  }, [id])

  const key = (c: string, s: string) => `${c}|${s}`
  const totalStock = useMemo(() => colors.reduce((n, c) => n + sizes.reduce((m, s) => m + (Number(stock[key(c.name, s)]) || 0), 0), 0), [colors, sizes, stock])

  const renameColor = (i: number, nameV: string) => {
    const old = colors[i].name
    setColors(colors.map((c, j) => (j === i ? { ...c, name: nameV } : c)))
    // leva o estoque junto quando a cor muda de nome
    setStock((st) => {
      const next = { ...st }
      for (const s of sizes) if (st[key(old, s)] !== undefined) { next[key(nameV, s)] = st[key(old, s)]; delete next[key(old, s)] }
      return next
    })
  }

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try { const urls = await uploadFiles(files); setImages((im) => [...im, ...urls]) } catch (e) { toast((e as Error).message, 'error') }
    setUploading(false)
  }
  const moveImage = (i: number, d: number) => setImages((im) => {
    const n = [...im]; const j = i + d
    if (j < 0 || j >= n.length) return im
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })

  const fillAll = () => {
    const v = prompt('Quantas peças em estoque em cada cor e tamanho?', '5')
    if (v === null) return
    const n = String(Math.max(0, Math.floor(Number(v) || 0)))
    const next: Record<string, string> = {}
    for (const c of colors) for (const s of sizes) next[key(c.name, s)] = n
    setStock(next)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const validColors = colors.filter((c) => c.name.trim())
    if (!validColors.length) { toast('Informe pelo menos uma cor (ex.: Preto).', 'error'); return }
    if (!sizes.length) { toast('Informe pelo menos um tamanho.', 'error'); return }
    setBusy(true)
    const body = {
      name, description, composition, slug: isNew ? undefined : slug,
      price_cents: inputToCents(priceIn),
      compare_at_cents: compareIn ? inputToCents(compareIn) : null,
      category_id: categoryId || null, collection_id: collectionId || null,
      active, images,
      variants: validColors.flatMap((c) => sizes.map((s) => ({ color: c.name.trim(), color_hex: c.hex, size: s, stock: Number(stock[key(c.name, s)]) || 0 }))),
    }
    try {
      const p = await api<Product>(isNew ? '/admin/products' : `/admin/products/${id}`, { method: isNew ? 'POST' : 'PUT', body })
      toast(isNew ? 'Peça cadastrada' : 'Alterações salvas')
      if (isNew) navigate(`/admin/pecas/${p.id}`, { replace: true })
      else setSlug(p.slug)
    } catch (err) { toast((err as Error).message, 'error') }
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm(`Apagar "${name}" de vez? Os pedidos antigos continuam com o nome da peça. Se quiser só tirar da loja, desmarque "Visível na loja".`)) return
    await api(`/admin/products/${id}`, { method: 'DELETE' })
    toast('Peça apagada')
    navigate('/admin/pecas')
  }

  if (!loaded) return <div className="ad-page"><div className="ad-empty">Carregando…</div></div>

  return (
    <form className="ad-page" onSubmit={save}>
      <Link className="ad-back" to="/admin/pecas">← Peças</Link>
      <PageHead title={isNew ? 'Nova peça' : name || 'Editar peça'} sub={!isNew ? <>{sold} {sold === 1 ? 'vendida' : 'vendidas'} no site · <a href={`/produto/${slug}`} target="_blank" rel="noreferrer">ver na loja ↗</a></> : 'Cadastre fotos, preço, cores, tamanhos e estoque.'}>
        <Toggle checked={active} onChange={setActive} label="Visível na loja" />
        <button className="ad-btn primary" disabled={busy || uploading}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </PageHead>

      <div className="ad-detail">
        <div className="ad-col">
          <section className="ad-card">
            <h2>Fotos</h2>
            <div className="ad-photos" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer.files) }}>
              {images.map((src, i) => (
                <figure key={src + i} className="ad-photo">
                  <img src={src} alt="" />
                  {i === 0 && <span className="ad-photo-tag">Principal</span>}
                  {i === 1 && <span className="ad-photo-tag">Ao passar o mouse</span>}
                  <div className="ad-photo-actions">
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">←</button>
                    <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remover foto">Remover</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} aria-label="Mover para a direita">→</button>
                  </div>
                </figure>
              ))}
              <button type="button" className="ad-photo add" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? 'Enviando…' : <>+ Adicionar fotos<small>ou arraste aqui</small></>}
              </button>
            </div>
            <p className="ad-hint">Use fotos em pé (3:4), de preferência com 1200px de largura ou mais. A 1ª é a principal; a 2ª aparece quando a cliente passa o mouse.</p>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = '' }} />
          </section>

          <section className="ad-card">
            <h2>Informações</h2>
            <Field label="Nome da peça"><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Vestido Sienna" /></Field>
            <Field label="Descrição"><textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Modelagem, caimento, comprimento…" /></Field>
            <Field label="Composição e cuidados"><textarea rows={2} value={composition} onChange={(e) => setComposition(e.target.value)} placeholder="Ex.: 100% viscose. Lavar à mão." /></Field>
          </section>

          <section className="ad-card">
            <div className="ad-card-head">
              <h2>Cores, tamanhos e estoque</h2>
              <span className="ad-muted">{totalStock} peças no total</span>
            </div>
            <div className="ad-colors">
              {colors.map((c, i) => (
                <div key={i} className="ad-color-row">
                  <input type="color" value={c.hex} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} aria-label="Cor da bolinha" />
                  <input value={c.name} onChange={(e) => renameColor(i, e.target.value)} placeholder="Nome da cor (ex.: Preto)" />
                  {colors.length > 1 && <button type="button" className="ad-btn small ghost" onClick={() => setColors(colors.filter((_, j) => j !== i))}>Remover</button>}
                </div>
              ))}
              <button type="button" className="ad-btn small ghost" onClick={() => setColors([...colors, { name: '', hex: '#d8d3cc' }])}>+ Outra cor</button>
            </div>

            <div className="ad-sizes">
              <span className="ad-label">Tamanhos</span>
              <div className="ad-chips">
                {sizes.map((s) => <span key={s} className="ad-chip">{s}<button type="button" onClick={() => setSizes(sizes.filter((x) => x !== s))} aria-label={`Tirar ${s}`}>×</button></span>)}
                <input className="ad-chip-input" value={newSize} placeholder="+ tamanho" onChange={(e) => setNewSize(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); const s = newSize.trim(); if (s && !sizes.includes(s)) setSizes(sortSizes([...sizes, s])); setNewSize('') }
                  }} />
              </div>
              <small className="ad-hint">Digite e aperte Enter. Ex.: U (único), 36, 38, 40.</small>
            </div>

            <div className="ad-table-wrap">
              <table className="ad-table ad-stock">
                <thead><tr><th>Estoque</th>{sizes.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
                <tbody>
                  {colors.filter((c) => c.name.trim()).map((c) => (
                    <tr key={c.name}>
                      <td><i className="ad-dot" style={{ background: c.hex }} />{c.name}</td>
                      {sizes.map((s) => (
                        <td key={s} className="num">
                          <input inputMode="numeric" value={stock[key(c.name, s)] ?? ''} placeholder="0" aria-label={`Estoque ${c.name} ${s}`}
                            onChange={(e) => setStock({ ...stock, [key(c.name, s)]: e.target.value.replace(/\D/g, '') })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="ad-btn small ghost" onClick={fillAll}>Preencher todos com o mesmo número</button>
            <p className="ad-hint">Quando chega a 0, o tamanho aparece riscado na loja. O estoque baixa sozinho a cada venda no site.</p>
          </section>
        </div>

        <div className="ad-col narrow">
          <section className="ad-card">
            <h2>Preço</h2>
            <Field label="Preço de venda"><MoneyInput value={priceIn} onChange={setPriceIn} /></Field>
            <Field label="Preço “de” (opcional)" hint="Preencha só em promoção. Aparece riscado ao lado do preço de venda.">
              <MoneyInput value={compareIn} onChange={setCompareIn} />
            </Field>
          </section>
          <section className="ad-card">
            <h2>Organização</h2>
            <Field label="Categoria">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {tax.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Coleção" hint={<>Crie e renomeie em <Link to="/admin/configuracoes">Configurações</Link>.</>}>
              <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                <option value="">Nenhuma</option>
                {tax.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </section>
          {!isNew && <button type="button" className="ad-btn danger block" onClick={remove}>Apagar peça</button>}
        </div>
      </div>
    </form>
  )
}
