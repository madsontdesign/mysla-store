import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, price, waLink } from '../lib/api'
import { useStore } from './StoreContext'
import { BagIcon, CloseIcon, Logo, MenuIcon, SearchIcon, TextLink, WhatsAppIcon, PriceTag } from './components'

export default function Layout() {
  const { pathname, search } = useLocation()
  const { setBagOpen, setSearchOpen } = useStore()
  // Volta ao topo e fecha painéis ao trocar de página
  useEffect(() => {
    window.scrollTo({ top: 0 })
    setBagOpen(false)
    setSearchOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }, [pathname, search, setBagOpen, setSearchOpen])

  return (
    <div className="site">
      <Header />
      <Outlet />
      <Footer />
      <CartDrawer />
      <SearchOverlay />
      <WhatsAppFloat />
    </div>
  )
}

function Header() {
  const { info, products, bagCount, setBagOpen, setSearchOpen } = useStore()
  const [menu, setMenu] = useState(false)
  const [mobileSection, setMobileSection] = useState<'shop' | 'collections' | null>(null)
  const close = () => setMenu(false)
  const categories = info?.categories || []
  const collections = info?.collections || []
  const shopImage = products[1]?.images[1] || products[0]?.images[0]
  const colImage = products[3]?.images[1] || products[0]?.images[1]

  return (
    <>
      {info?.announcement && <div className="announcement" role="note">{info.announcement}</div>}
      <header className="header">
        <nav className="desktop-nav nav-left" aria-label="Principal">
          <TextLink to="/produtos?ordem=novidades">NOVIDADES</TextLink>
          <div className="nav-dropdown-item">
            <TextLink to="/produtos">LOJA</TextLink>
            <div className="mega-menu">
              <div className="mega-intro"><span>LOJA / 01</span><p>O guarda-roupa MYSLA completo, pensado para todos os dias.</p></div>
              <div className="mega-links">
                <span>CATEGORIAS</span>
                <Link className="featured" to="/produtos">Ver tudo<span>→</span></Link>
                {categories.map((c) => <Link key={c.id} to={`/produtos?categoria=${c.slug}`}>{c.name}<span>→</span></Link>)}
              </div>
              <div className="mega-image">{shopImage && <img src={shopImage} alt="" />}<span>NOVA COLEÇÃO / {new Date().getFullYear()}</span></div>
            </div>
          </div>
          <div className="nav-dropdown-item">
            <TextLink to="/produtos">COLEÇÕES</TextLink>
            <div className="mega-menu">
              <div className="mega-intro"><span>COLEÇÕES / 02</span><p>Estudos de temporada sobre forma, movimento e feminilidade moderna.</p></div>
              <div className="mega-links">
                <span>ARQUIVO</span>
                {collections.map((c, i) => <Link key={c.id} className={i === 0 ? 'featured' : ''} to={`/produtos?colecao=${c.slug}`}>{c.name}<span>→</span></Link>)}
              </div>
              <div className="mega-image">{colImage && <img src={colImage} alt="" />}<span>{collections[0]?.name.toUpperCase()}</span></div>
            </div>
          </div>
          <TextLink to="/produtos?ordem=mais-vendidos">MAIS VENDIDOS</TextLink>
          <TextLink to="/sobre">SOBRE</TextLink>
        </nav>
        <button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label="Abrir menu"><MenuIcon /></button>
        <Logo />
        <nav className="desktop-nav nav-actions" aria-label="Conta e sacola">
          <TextLink onClick={() => setSearchOpen(true)}>BUSCAR</TextLink>
          <TextLink to="/meu-pedido">MEU PEDIDO</TextLink>
          <TextLink onClick={() => setBagOpen(true)}>SACOLA ({bagCount})</TextLink>
        </nav>
        <div className="mobile-actions mobile-only">
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="Buscar"><SearchIcon /></button>
          <button className="icon-button bag-button" onClick={() => setBagOpen(true)} aria-label={`Sacola, ${bagCount} itens`}>
            <BagIcon />{bagCount > 0 && <i>{bagCount}</i>}
          </button>
        </div>
      </header>
      <div className={`mobile-menu ${menu ? 'open' : ''}`} aria-hidden={!menu}>
        <div className="drawer-head"><span>MENU</span><button className="icon-button" onClick={close} aria-label="Fechar"><CloseIcon /></button></div>
        <div className="mobile-menu-links">
          <TextLink to="/produtos?ordem=novidades" onClick={close}>NOVIDADES <span>→</span></TextLink>
          <div className={`mobile-nav-group ${mobileSection === 'shop' ? 'open' : ''}`}>
            <button className="mobile-nav-trigger" onClick={() => setMobileSection(mobileSection === 'shop' ? null : 'shop')}>LOJA <span>{mobileSection === 'shop' ? '−' : '+'}</span></button>
            <div className="mobile-submenu">
              <Link to="/produtos" onClick={close}>Ver tudo</Link>
              {categories.map((c) => <Link key={c.id} to={`/produtos?categoria=${c.slug}`} onClick={close}>{c.name}</Link>)}
            </div>
          </div>
          <div className={`mobile-nav-group ${mobileSection === 'collections' ? 'open' : ''}`}>
            <button className="mobile-nav-trigger" onClick={() => setMobileSection(mobileSection === 'collections' ? null : 'collections')}>COLEÇÕES <span>{mobileSection === 'collections' ? '−' : '+'}</span></button>
            <div className="mobile-submenu">{collections.map((c) => <Link key={c.id} to={`/produtos?colecao=${c.slug}`} onClick={close}>{c.name}</Link>)}</div>
          </div>
          <TextLink to="/produtos?ordem=mais-vendidos" onClick={close}>MAIS VENDIDOS <span>→</span></TextLink>
          <TextLink to="/sobre" onClick={close}>SOBRE <span>→</span></TextLink>
          <TextLink to="/meu-pedido" onClick={close}>MEU PEDIDO <span>→</span></TextLink>
        </div>
        <div className="drawer-caption">{info?.store_name || 'MYSLA'} / GUARDA-ROUPA CONTEMPORÂNEO</div>
      </div>
      {menu && <button className="scrim" aria-label="Fechar menu" onClick={close} />}
    </>
  )
}

function Footer() {
  const { info } = useStore()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle')
  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api('/subscribe', { body: { email } }); setState('ok'); setEmail('') } catch { setState('error') }
  }
  return (
    <>
      <section className="newsletter">
        <div><span>NOTAS PRIVADAS</span><p>Novidades, histórias e cartas ocasionais da {info?.store_name || 'MYSLA'}.</p></div>
        <form onSubmit={subscribe}>
          <label>
            <input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setState('idle') }} placeholder="SEU E-MAIL" aria-label="Seu e-mail" />
            <button aria-label="Inscrever">→</button>
          </label>
          {state === 'ok' && <small className="form-note">Pronto! Você vai receber nossas novidades.</small>}
          {state === 'error' && <small className="form-note error">Confira o e-mail e tente de novo.</small>}
        </form>
      </section>
      <footer>
        <div className="footer-brand"><Logo to="/" label="MYSLA — portal" /><p>{(info?.store_tagline || '').split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p></div>
        <div className="footer-links">
          <div><span>EXPLORE</span><TextLink to="/produtos">Loja</TextLink><TextLink to="/sobre">Sobre</TextLink><TextLink to="/meu-pedido">Meu pedido</TextLink></div>
          <div><span>ATENDIMENTO</span>{info?.has_whatsapp && <TextLink href={waLink('rodape')} external>Fale conosco</TextLink>}<TextLink to="/sobre#envio">Envio e trocas</TextLink><TextLink to="/sobre#medidas">Guia de medidas</TextLink></div>
          <div><span>SIGA</span>{info?.instagram_url && <a href={info.instagram_url} target="_blank" rel="noreferrer">Instagram</a>}{info?.tiktok_url && <a href={info.tiktok_url} target="_blank" rel="noreferrer">TikTok</a>}</div>
        </div>
        <div className="footer-bottom"><span>{info?.store_name || 'MYSLA'} © {new Date().getFullYear()}</span><span>PAGAMENTO SEGURO — PIX E CARTÃO</span><span>ENVIO PARA TODO O BRASIL</span></div>
      </footer>
    </>
  )
}

function CartDrawer() {
  const { info, bag, bagCount, subtotal, bagOpen, setBagOpen, setQty, removeFromBag } = useStore()
  const navigate = useNavigate()
  const freeMin = info?.free_shipping_min_cents || 0
  const missing = Math.max(0, freeMin - subtotal)
  const hasProblem = bag.some((i) => i.qty > i.variant.stock || !i.product.active)
  const close = () => setBagOpen(false)
  return (
    <>
      <aside className={`side-drawer cart-drawer ${bagOpen ? 'open' : ''}`} aria-hidden={!bagOpen} aria-label="Sacola">
        <div className="drawer-head"><span>SACOLA ({bagCount})</span><button className="icon-button" onClick={close} aria-label="Fechar sacola"><CloseIcon /></button></div>
        {freeMin > 0 && (
          <div className="shipping-note">
            {missing > 0 ? <>FALTAM {price(missing)} PARA O FRETE GRÁTIS</> : <>VOCÊ GANHOU FRETE GRÁTIS</>}
            <div><i style={{ width: `${Math.min(100, (subtotal / freeMin) * 100)}%` }} /></div>
          </div>
        )}
        <div className="cart-items">
          {bag.length === 0 ? (
            <div className="empty-bag"><span>SUA SACOLA ESTÁ VAZIA</span><p>Explore a coleção e descubra sua próxima peça essencial.</p></div>
          ) : bag.map((item) => (
            <article className="cart-item" key={item.variantId}>
              <img src={item.product.images[0]} alt="" />
              <div>
                <span>{item.product.name}</span>
                <small>{item.variant.color} / {item.variant.size}</small>
                <div className="quantity">
                  <button onClick={() => setQty(item.variantId, item.qty - 1)} aria-label="Diminuir">−</button>
                  <span>{item.qty}</span>
                  <button onClick={() => setQty(item.variantId, item.qty + 1)} disabled={item.qty >= item.variant.stock} aria-label="Aumentar">+</button>
                </div>
                {item.variant.stock < 1 ? <small className="stock-warn">ESGOTOU — REMOVA PARA CONTINUAR</small>
                  : item.qty > item.variant.stock ? <small className="stock-warn">SÓ {item.variant.stock} DISPONÍVEIS</small> : null}
                <button className="remove" onClick={() => removeFromBag(item.variantId)}>REMOVER</button>
              </div>
              <b>{price(item.product.price_cents * item.qty)}</b>
            </article>
          ))}
        </div>
        <div className="cart-bottom">
          <div><span>SUBTOTAL</span><span>{price(subtotal)}</span></div>
          <small>FRETE CALCULADO NO CHECKOUT.</small>
          <button className="primary-button" disabled={!bag.length || hasProblem} onClick={() => { close(); navigate('/checkout') }}>FINALIZAR COMPRA</button>
          <span>PIX OU CARTÃO EM ATÉ {info?.max_installments || 1}X</span>
        </div>
      </aside>
      {bagOpen && <button className="scrim" aria-label="Fechar sacola" onClick={close} />}
    </>
  )
}

function SearchOverlay() {
  const { products, searchOpen, setSearchOpen } = useStore()
  const [query, setQuery] = useState('')
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  const results = q
    ? products.filter((p) => norm([p.name, p.category?.name, p.collection?.name, ...p.variants.map((v) => v.color)].join(' ')).includes(q))
    : [...products].sort((a, b) => b.sold - a.sold).slice(0, 3)
  return (
    <div className={`search-overlay ${searchOpen ? 'open' : ''}`} aria-hidden={!searchOpen}>
      <div className="search-top"><span>BUSCAR NA MYSLA</span><button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"><CloseIcon /></button></div>
      <label className="search-field">
        <SearchIcon />
        {searchOpen && <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="O QUE VOCÊ PROCURA?" aria-label="Buscar" />}
      </label>
      <div className="search-suggestions">
        <span>{q ? (results.length ? `RESULTADOS PARA “${query}”` : `NADA ENCONTRADO PARA “${query}”`) : 'EM ALTA'}</span>
        {results.slice(0, 8).map((p) => (
          <Link key={p.id} to={`/produto/${p.slug}`} onClick={() => setSearchOpen(false)}>
            <img src={p.images[0]} alt="" /><span>{p.name}<small><PriceTag product={p} /></small></span><span>→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function WhatsAppFloat() {
  const { info } = useStore()
  const { pathname } = useLocation()
  if (!info?.has_whatsapp || pathname.startsWith('/checkout') || pathname.startsWith('/pedido')) return null
  return (
    <a className="wa-float" href={waLink('botao-flutuante')} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
      <WhatsAppIcon />
    </a>
  )
}
