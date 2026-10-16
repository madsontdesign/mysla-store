import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { price, sortSizes, waLink, type Product } from '../lib/api'
import { useStore } from './StoreContext'
import { Arrow, CloseIcon, Loading, Logo, PriceTag, ProductCard, SectionHead, TextLink, colorsOf, inStock, WhatsAppIcon } from './components'

const lines = (text = '') => text.split('\n').map((l, i, all) => <span key={i}>{l}{i < all.length - 1 && <br />}</span>)

// ---------- Portal de entrada ----------
export function Entry() {
  const { info } = useStore()
  return (
    <main className="entry">
      <div className="entry-center">
        <Logo inverse />
        <nav className="entry-links" aria-label="Portal">
          <TextLink to="/inicio">ENTRAR NO SITE <Arrow /></TextLink>
          {info?.has_whatsapp && <a href={waLink('portal')} target="_blank" rel="noreferrer">WHATSAPP <Arrow /></a>}
          {info?.tiktok_url && <a href={info.tiktok_url} target="_blank" rel="noreferrer">TIKTOK <Arrow /></a>}
        </nav>
      </div>
      <div className="entry-footer">{info?.store_name || 'MYSLA'} © {new Date().getFullYear()}</div>
    </main>
  )
}

// ---------- Início ----------
export function Home() {
  const { info, products, loading } = useStore()
  if (loading || !info) return <Loading />
  const { hero, campaign } = info
  const newest = products.slice(0, 4)
  const best = [...products].sort((a, b) => b.sold - a.sold || a.id - b.id).filter((p) => !newest.includes(p)).slice(0, 4)
  const categoryTiles = info.categories
    .map((c) => ({ c, img: products.find((p) => p.category?.id === c.id)?.images[0] }))
    .filter((t) => t.img)
    .slice(0, 4)

  return (
    <main>
      <section className="hero collection-hero">
        <div className="collection-hero-copy">
          <span className="eyebrow">{hero.eyebrow}</span>
          <h1 className="collection-title">{lines(hero.title)}</h1>
          {hero.subtitle && <p>{hero.subtitle}</p>}
          {hero.cta_label && <TextLink to={hero.cta_link || '/produtos'}>{hero.cta_label} →</TextLink>}
        </div>
        <div className="collection-hero-image">
          <picture>
            {hero.image_mobile && <source media="(max-width: 900px)" srcSet={hero.image_mobile} />}
            <img src={hero.image} alt={hero.title.replace(/\n/g, ' ')} />
          </picture>
          {hero.caption && <span>{hero.caption}</span>}
        </div>
      </section>
      {newest.length > 0 && (
        <section className="content-section">
          <SectionHead title="NOVIDADES" action="VER TUDO" to="/produtos?ordem=novidades" />
          <div className="product-grid">{newest.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
      {campaign?.image && (
        <section className="campaign">
          <img src={campaign.image} alt="" />
          <div className="campaign-copy">
            <span className="eyebrow">{campaign.eyebrow}</span>
            <div className="display">{lines(campaign.title)}</div>
            {campaign.cta_label && <TextLink to={campaign.cta_link || '/produtos'}>{campaign.cta_label} →</TextLink>}
          </div>
        </section>
      )}
      {categoryTiles.length > 0 && (
        <section className="content-section categories">
          <SectionHead title="COMPRE POR CATEGORIA" />
          <div className="category-grid">
            {categoryTiles.map(({ c, img }) => (
              <Link key={c.id} className="category" to={`/produtos?categoria=${c.slug}`}>
                <img src={img} alt="" loading="lazy" /><span>{c.name.toUpperCase()} →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {best.length > 0 && (
        <section className="content-section">
          <SectionHead title="MAIS VENDIDOS" action="DESCOBRIR" to="/produtos?ordem=mais-vendidos" />
          <div className="product-grid">{best.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
      <section className="statement">
        <div className="statement-copy">
          <span className="eyebrow">A PERSPECTIVA MYSLA</span>
          <div className="statement-text">Um estudo de proporção, textura e da confiança silenciosa de roupas feitas para serem vividas.</div>
          <TextLink to="/sobre">SOBRE A MYSLA →</TextLink>
        </div>
        <img src="https://images.unsplash.com/photo-1779400203231-102e4e62a5f3?auto=format&fit=crop&w=1200&q=88" alt="Retrato editorial MYSLA" loading="lazy" />
      </section>
    </main>
  )
}

// ---------- Loja / catálogo ----------
const SORTS: Record<string, string> = { destaques: 'DESTAQUES', novidades: 'NOVIDADES', 'mais-vendidos': 'MAIS VENDIDOS', 'menor-preco': 'MENOR PREÇO', 'maior-preco': 'MAIOR PREÇO' }
const PAGE = 12

export function Shop() {
  const { info, products, loading } = useStore()
  const [params, setParams] = useSearchParams()
  const [filterOpen, setFilterOpen] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const category = params.get('categoria') || ''
  const collection = params.get('colecao') || ''
  const sort = params.get('ordem') || 'destaques'
  const sizes = params.getAll('tamanho')
  const colors = params.getAll('cor')

  useEffect(() => setShown(PAGE), [params])

  const allSizes = useMemo(() => sortSizes(products.flatMap((p) => p.variants.map((v) => v.size))), [products])
  const allColors = useMemo(() => [...new Map(products.flatMap((p) => p.variants).map((v) => [v.color, v])).values()], [products])

  const visible = useMemo(() => {
    let list = products.filter((p) =>
      (!category || p.category?.slug === category) &&
      (!collection || p.collection?.slug === collection) &&
      (!sizes.length || p.variants.some((v) => v.stock > 0 && sizes.includes(v.size))) &&
      (!colors.length || p.variants.some((v) => colors.includes(v.color))))
    list = [...list]
    if (sort === 'menor-preco') list.sort((a, b) => a.price_cents - b.price_cents)
    else if (sort === 'maior-preco') list.sort((a, b) => b.price_cents - a.price_cents)
    else if (sort === 'mais-vendidos') list.sort((a, b) => b.sold - a.sold)
    else if (sort === 'destaques') list.sort((a, b) => Number(inStock(b)) - Number(inStock(a)))
    return list
  }, [products, category, collection, sort, sizes.join(), colors.join()])

  const update = (fn: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params)
    fn(next)
    setParams(next, { replace: true })
  }
  const toggle = (key: string, value: string) => update((p) => {
    const cur = p.getAll(key)
    p.delete(key)
    for (const v of cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]) p.append(key, v)
  })
  const sortKeys = Object.keys(SORTS)
  const nextSort = () => update((p) => p.set('ordem', sortKeys[(sortKeys.indexOf(sort) + 1) % sortKeys.length]))

  const col = info?.collections.find((c) => c.slug === collection)
  const cat = info?.categories.find((c) => c.slug === category)
  const title = col?.name || cat?.name || (sort === 'novidades' ? 'Novidades' : sort === 'mais-vendidos' ? 'Mais vendidos' : 'A coleção')
  const filtersActive = sizes.length + colors.length + (category ? 1 : 0)

  if (loading) return <Loading />
  return (
    <main className="shop-page">
      <div className="shop-title">
        <span className="eyebrow">{col ? 'MYSLA / COLEÇÃO' : 'MYSLA / LOJA'}</span>
        <h1>{title.toUpperCase()}</h1>
        {col?.description && <p className="shop-desc">{col.description}</p>}
      </div>
      <div className="catalog-toolbar">
        <span>{visible.length} {visible.length === 1 ? 'PEÇA' : 'PEÇAS'}</span>
        <div>
          <TextLink onClick={() => setFilterOpen(true)}>FILTRAR {filtersActive ? `(${filtersActive})` : '+'}</TextLink>
          <TextLink onClick={nextSort}>ORDEM: {SORTS[sort] || SORTS.destaques} ↓</TextLink>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="empty-state">
          <span>NENHUMA PEÇA ENCONTRADA</span>
          <p>Tente tirar alguns filtros.</p>
          <TextLink onClick={() => setParams({}, { replace: true })}>LIMPAR FILTROS</TextLink>
        </div>
      ) : (
        <div className="catalog-grid">{visible.slice(0, shown).map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
      {visible.length > 0 && (
        <div className="load-more">
          <span>MOSTRANDO {Math.min(shown, visible.length)} DE {visible.length}</span>
          <div className="progress"><i style={{ width: `${(Math.min(shown, visible.length) / visible.length) * 100}%` }} /></div>
          {shown < visible.length && <TextLink onClick={() => setShown(shown + PAGE)}>CARREGAR MAIS</TextLink>}
        </div>
      )}
      <aside className={`side-drawer filter-drawer ${filterOpen ? 'open' : ''}`} aria-hidden={!filterOpen}>
        <div className="drawer-head"><span>FILTROS</span><button className="icon-button" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros"><CloseIcon /></button></div>
        <div className="filter-scroll">
          <div className="filter-block">
            <span>CATEGORIA</span>
            <button className={!category ? 'selected' : ''} onClick={() => update((p) => p.delete('categoria'))}>TODAS<span>{!category ? '●' : '○'}</span></button>
            {info?.categories.map((c) => (
              <button key={c.id} className={category === c.slug ? 'selected' : ''} onClick={() => update((p) => p.set('categoria', c.slug))}>
                {c.name.toUpperCase()}<span>{category === c.slug ? '●' : '○'}</span>
              </button>
            ))}
          </div>
          <div className="filter-block">
            <span>TAMANHO</span>
            <div className="size-row">{allSizes.map((s) => <button key={s} className={sizes.includes(s) ? 'selected' : ''} onClick={() => toggle('tamanho', s)}>{s}</button>)}</div>
          </div>
          <div className="filter-block">
            <span>COR</span>
            {allColors.map((c) => (
              <button key={c.color} className={colors.includes(c.color) ? 'selected' : ''} onClick={() => toggle('cor', c.color)}>
                <em className="dot" style={{ background: c.color_hex }} />{c.color.toUpperCase()}<span>{colors.includes(c.color) ? '●' : '○'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filter-actions">
          {filtersActive > 0 && <button className="secondary-button" onClick={() => update((p) => { p.delete('tamanho'); p.delete('cor'); p.delete('categoria') })}>LIMPAR</button>}
          <button className="primary-button" onClick={() => setFilterOpen(false)}>VER {visible.length} {visible.length === 1 ? 'PEÇA' : 'PEÇAS'}</button>
        </div>
      </aside>
      {filterOpen && <button className="scrim" aria-label="Fechar filtros" onClick={() => setFilterOpen(false)} />}
    </main>
  )
}

// ---------- Página da peça ----------
export function ProductPage() {
  const { slug } = useParams()
  const { info, products, loading, addToBag } = useStore()
  const product = products.find((p) => p.slug === slug)
  const colors = product ? colorsOf(product) : []
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [openInfo, setOpenInfo] = useState('DESCRIÇÃO')

  useEffect(() => {
    if (!product) return
    const firstAvailable = colors.find((c) => product.variants.some((v) => v.color === c.color && v.stock > 0))
    setColor((firstAvailable || colors[0])?.color || '')
    setSize('')
    if (product) document.title = `${product.name} — ${info?.store_name || 'MYSLA'}`
    return () => { document.title = info?.store_name || 'MYSLA' }
  }, [product?.id])

  if (loading) return <Loading />
  if (!product) return <NotFound />

  const sizes = sortSizes(product.variants.filter((v) => v.color === color).map((v) => v.size))
  const variant = product.variants.find((v) => v.color === color && v.size === size)
  const related = [
    ...products.filter((p) => p.id !== product.id && p.category?.id === product.category?.id),
    ...products.filter((p) => p.id !== product.id && p.category?.id !== product.category?.id),
  ].slice(0, 4)
  const installments = info?.max_installments || 1
  const lowStock = variant && variant.stock > 0 && variant.stock <= 2
  const accordions: [string, string][] = [
    ['DESCRIÇÃO', product.description],
    ['COMPOSIÇÃO E CUIDADOS', product.composition],
    ['ENVIO E TROCAS', `Enviamos para todo o Brasil. ${info?.free_shipping_min_cents ? `Frete grátis em compras acima de ${price(info.free_shipping_min_cents)}. ` : ''}Primeira troca grátis em até 30 dias após o recebimento.`],
  ]

  return (
    <main className="pdp">
      <div className="pdp-gallery">
        {product.images.map((src, i) => <img key={src + i} src={src} alt={i === 0 ? product.name : `${product.name}, foto ${i + 1}`} loading={i > 1 ? 'lazy' : undefined} />)}
      </div>
      <div className="pdp-details">
        <div className="pdp-sticky">
          <span className="eyebrow">{product.collection ? product.collection.name.toUpperCase() : product.category?.name.toUpperCase()}</span>
          <h1 className="pdp-name">{product.name}</h1>
          <div className="pdp-price">
            <PriceTag product={product} />
            {installments > 1 && <span>OU {installments}X DE {price(Math.ceil(product.price_cents / installments))}</span>}
          </div>
          <div className="selector-head"><span>COR — {color.toUpperCase()}</span></div>
          <div className="swatches">
            {colors.map((c) => (
              <button key={c.color} aria-label={c.color} title={c.color} className={color === c.color ? 'active' : ''}
                style={{ background: c.color_hex }} onClick={() => { setColor(c.color); setSize('') }} />
            ))}
          </div>
          <div className="selector-head"><span>ESCOLHA O TAMANHO</span><TextLink to="/sobre#medidas">GUIA DE MEDIDAS</TextLink></div>
          <div className="sizes" style={{ gridTemplateColumns: `repeat(${Math.max(sizes.length, 5)}, 1fr)` }}>
            {sizes.map((s) => {
              const v = product.variants.find((x) => x.color === color && x.size === s)!
              return <button key={s} className={`${size === s ? 'selected' : ''} ${v.stock < 1 ? 'sold-out' : ''}`} disabled={v.stock < 1} onClick={() => setSize(s)} aria-label={v.stock < 1 ? `${s}, esgotado` : s}>{s}</button>
            })}
          </div>
          {lowStock && <div className="stock-note">ÚLTIMAS {variant!.stock} PEÇAS NESSE TAMANHO</div>}
          {inStock(product) ? (
            <button className="primary-button" disabled={!variant || variant.stock < 1} onClick={() => variant && addToBag(variant.id)}>
              {variant ? 'ADICIONAR À SACOLA' : 'ESCOLHA UM TAMANHO'}
            </button>
          ) : (
            <button className="primary-button" disabled>ESGOTADO</button>
          )}
          {info?.has_whatsapp && (
            <a className="secondary-button wa-button" href={waLink('pagina-produto', { product: product.id, size, color })} target="_blank" rel="noreferrer">
              <WhatsAppIcon /> COMPRAR PELO WHATSAPP
            </a>
          )}
          <div className="prototype-note">PAGUE COM PIX OU CARTÃO EM ATÉ {installments}X</div>
          <div className="accordions">
            {accordions.filter(([, text]) => text).map(([label, text]) => (
              <div key={label} className={openInfo === label ? 'accordion open' : 'accordion'}>
                <button onClick={() => setOpenInfo(openInfo === label ? '' : label)}><span>{label}</span><span>{openInfo === label ? '−' : '+'}</span></button>
                {openInfo === label && <p>{text}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <section className="related content-section"><SectionHead title="VOCÊ TAMBÉM PODE GOSTAR" /><div className="product-grid">{related.map((p: Product) => <ProductCard key={p.id} product={p} />)}</div></section>
      )}
    </main>
  )
}

// ---------- Sobre ----------
export function About() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [hash])
  return (
    <main className="about">
      <div className="about-hero"><img src="https://images.unsplash.com/photo-1762605135332-8a7ce1403187?auto=format&fit=crop&w=1800&q=88" alt="Mulher em vestido preto em cenário arquitetônico" /><span>MYSLA / UMA PERSPECTIVA EDITORIAL</span></div>
      <section className="about-intro">
        <span className="eyebrow">SOBRE A MYSLA</span>
        <h1>Roupas pensadas a partir da linha, do movimento e da matéria.</h1>
        <p>A MYSLA explora um guarda-roupa contemporâneo com clareza e intenção. Cada coleção é um exercício de contenção, desenhado em torno da mulher que a veste.</p>
      </section>
      <section className="about-grid">
        <img src="https://images.unsplash.com/photo-1779406165962-7df12de281b1?auto=format&fit=crop&w=1200&q=88" alt="Retrato em movimento" loading="lazy" />
        <div><span className="eyebrow">NOSSO JEITO</span><p>Valorizamos a simplicidade expressiva: peças imediatas, pessoais e duradouras, sem precisar se anunciar.</p></div>
        <img src="https://images.unsplash.com/photo-1788500304966-2c60274a5de7?auto=format&fit=crop&w=1200&q=88" alt="Camisas em estúdio iluminado" loading="lazy" />
      </section>
      <section className="info-section" id="envio">
        <span className="eyebrow">ENVIO E TROCAS</span>
        <div>
          <p>Enviamos para todo o Brasil. O prazo começa a contar depois da confirmação do pagamento — no Pix, a confirmação é na hora.</p>
          <p>A primeira troca é grátis em até 30 dias após o recebimento. A peça precisa estar sem uso, com etiqueta. Fale com a gente pelo WhatsApp para iniciar.</p>
        </div>
      </section>
      <section className="info-section" id="medidas">
        <span className="eyebrow">GUIA DE MEDIDAS (CM)</span>
        <div className="size-table-wrap">
          <table className="size-table">
            <thead><tr><th>TAMANHO</th><th>BUSTO</th><th>CINTURA</th><th>QUADRIL</th></tr></thead>
            <tbody>
              {[['PP', '80–84', '62–66', '88–92'], ['P', '85–89', '67–71', '93–97'], ['M', '90–94', '72–76', '98–102'], ['G', '95–100', '77–82', '103–108'], ['GG', '101–106', '83–88', '109–114']].map((r) => (
                <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="empty-state page">
      <span>PÁGINA NÃO ENCONTRADA</span>
      <p>O endereço pode ter mudado ou a peça saiu do catálogo.</p>
      <TextLink to="/produtos">VER A COLEÇÃO →</TextLink>
    </main>
  )
}
