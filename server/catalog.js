import { db } from './db.js'

const PAID = "('paid','shipped','delivered')"

/** Monta os produtos com fotos, variações e total vendido. */
export function loadProducts({ includeInactive = false, id = null, slug = null } = {}) {
  const where = []
  const params = []
  if (!includeInactive) where.push('p.active = 1')
  if (id != null) { where.push('p.id = ?'); params.push(id) }
  if (slug != null) { where.push('p.slug = ?'); params.push(slug) }
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug,
           co.name AS collection_name, co.slug AS collection_slug,
           COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                     WHERE oi.product_id = p.id AND o.status IN ${PAID}), 0) AS sold
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN collections co ON co.id = p.collection_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.created_at DESC, p.id DESC`).all(...params)
  if (!rows.length) return []

  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => '?').join(',')
  const images = db.prepare(`SELECT product_id, url FROM product_images WHERE product_id IN (${marks}) ORDER BY position, id`).all(...ids)
  const variants = db.prepare(`SELECT id, product_id, color, color_hex, size, stock FROM variants WHERE product_id IN (${marks}) ORDER BY id`).all(...ids)

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    composition: p.composition,
    price_cents: p.price_cents,
    compare_at_cents: p.compare_at_cents,
    active: !!p.active,
    category: p.category_id ? { id: p.category_id, name: p.category_name, slug: p.category_slug } : null,
    collection: p.collection_id ? { id: p.collection_id, name: p.collection_name, slug: p.collection_slug } : null,
    images: images.filter((i) => i.product_id === p.id).map((i) => i.url),
    variants: variants.filter((v) => v.product_id === p.id).map(({ product_id, ...v }) => v),
    sold: p.sold,
    created_at: p.created_at,
  }))
}

export function loadTaxonomy() {
  return {
    categories: db.prepare('SELECT id, name, slug FROM categories ORDER BY position, name').all(),
    collections: db.prepare('SELECT id, name, slug, description FROM collections ORDER BY position, name').all(),
  }
}

/** Remove o estoque mínimo e devolve só o necessário para a loja pública. */
export function publicProduct(p) {
  return { ...p, variants: p.variants.map((v) => ({ ...v, stock: Math.max(0, Math.min(v.stock, 99)) })) }
}
