import { useState } from 'react'
import { Link } from 'react-router-dom'
import { price, sortSizes, type Product } from '../lib/api'
import { useStore } from './StoreContext'

export const Arrow = () => <span aria-hidden="true">↗</span>
export const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
export const BagIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>
export const MenuIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 17h18" /></svg>
export const CloseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg>
export const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="wa-icon">
    <path d="M4.2 19.8 5.3 16A8 8 0 1 1 8.1 18.7L4.2 19.8Z" />
    <path d="M9.2 8.6c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.3.5.8 1.1 1.3 1.5.6.5 1.1.7 1.5.9.2.1.4 0 .5-.1l.6-.7c.2-.2.3-.2.6-.1l1.5.7c.3.1.4.2.4.4 0 .5-.2 1.2-.8 1.5-.5.3-1.4.5-2.9-.1-1.3-.5-2.8-1.7-3.6-3-.6-1-1-2-.9-2.8 0-.6.4-1.1.6-1.4Z" />
  </svg>
)

export function Logo({ inverse = false, to = '/inicio', label = 'MYSLA — início' }: { inverse?: boolean; to?: string; label?: string }) {
  return (
    <Link className={`logo-button ${inverse ? 'inverse' : ''}`} to={to} aria-label={label}>
      <img src="/mysla-logo.png" alt="Mysla" />
    </Link>
  )
}

type TextLinkProps = { children: React.ReactNode; to?: string; onClick?: () => void; className?: string; href?: string; external?: boolean }
export function TextLink({ children, to, onClick, className = '', href, external }: TextLinkProps) {
  if (href) return <a className={`text-link ${className}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} onClick={onClick}>{children}</a>
  if (to) return <Link className={`text-link ${className}`} to={to} onClick={onClick}>{children}</Link>
  return <button type="button" className={`text-link ${className}`} onClick={onClick}>{children}</button>
}

export function SectionHead({ title, action, to }: { title: string; action?: string; to?: string }) {
  return <div className="section-head"><h2>{title}</h2>{action && to && <TextLink to={to}>{action} →</TextLink>}</div>
}

export function PriceTag({ product }: { product: Product }) {
  return (
    <span className="price-tag">
      {product.compare_at_cents ? <s>{price(product.compare_at_cents)}</s> : null}
      {price(product.price_cents)}
    </span>
  )
}

export const colorsOf = (p: Product) => [...new Map(p.variants.map((v) => [v.color, v])).values()]
export const inStock = (p: Product) => p.variants.some((v) => v.stock > 0)

export function ProductCard({ product }: { product: Product }) {
  const { addToBag } = useStore()
  const [picking, setPicking] = useState(false)
  const colors = colorsOf(product)
  const firstColor = colors.find((c) => product.variants.some((v) => v.color === c.color && v.stock > 0))?.color
  const sizes = sortSizes(product.variants.filter((v) => v.color === firstColor).map((v) => v.size))
  const available = inStock(product)
  const href = `/produto/${product.slug}`
  const [main, alt] = product.images

  return (
    <article className="product-card" onMouseLeave={() => setPicking(false)}>
      <Link className="product-image" to={href} aria-label={`Ver ${product.name}`}>
        {main ? <img className="primary" src={main} alt={product.name} loading="lazy" /> : <div className="img-placeholder" />}
        {alt && <img className="alternate" src={alt} alt="" loading="lazy" />}
        {!available && <span className="badge">ESGOTADO</span>}
        {available && product.compare_at_cents ? <span className="badge">PROMOÇÃO</span> : null}
      </Link>
      {available && (
        colors.length > 1 ? (
          <Link className="quick-add" to={href}>ESCOLHER COR E TAMANHO</Link>
        ) : picking ? (
          <div className="quick-add quick-sizes">
            {sizes.map((s) => {
              const v = product.variants.find((x) => x.color === firstColor && x.size === s)!
              return <button key={s} disabled={v.stock < 1} onClick={() => { addToBag(v.id); setPicking(false) }}>{s}</button>
            })}
          </div>
        ) : (
          <button className="quick-add" onClick={() => setPicking(true)}>ADICIONAR À SACOLA +</button>
        )
      )}
      <Link className="product-info" to={href}>
        <span>{product.name}</span><PriceTag product={product} />
      </Link>
      <span className="product-color">{colors.map((c) => c.color).join(' / ')}</span>
    </article>
  )
}

export function Loading() {
  return <div className="page-loading" aria-live="polite">CARREGANDO…</div>
}
