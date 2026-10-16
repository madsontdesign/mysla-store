export type Variant = { id: number; color: string; color_hex: string; size: string; stock: number }
export type Ref = { id: number; name: string; slug: string }
export type Product = {
  id: number
  slug: string
  name: string
  description: string
  composition: string
  price_cents: number
  compare_at_cents: number | null
  active: boolean
  category: Ref | null
  collection: Ref | null
  images: string[]
  variants: Variant[]
  sold: number
  created_at: string
}
export type Banner = {
  eyebrow: string
  title: string
  subtitle?: string
  cta_label: string
  cta_link: string
  image: string
  image_mobile?: string
  caption?: string
}
export type StoreInfo = {
  store_name: string
  store_tagline: string
  instagram_url: string
  tiktok_url: string
  has_whatsapp: boolean
  shipping_flat_cents: number
  free_shipping_min_cents: number
  max_installments: number
  announcement: string | null
  hero: Banner
  campaign: Banner
  categories: Ref[]
  collections: (Ref & { description: string })[]
  payments: { demo: boolean; public_key: string }
}
export type OrderItem = { name: string; color: string; size: string; image: string; unit_cents: number; qty: number }
export type Address = { cep: string; street: string; number: string; complement: string; district: string; city: string; state: string }
export type Order = {
  code: string
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'
  payment_method: 'pix' | 'card' | null
  payment_status: string | null
  customer_name: string
  customer_email: string
  address: Address
  items: OrderItem[]
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  tracking_code: string | null
  created_at: string
  paid_at: string | null
  pix: { qr: string; qr_base64: string; expires_at: string } | null
  token?: string
  card_result?: string
  message?: string | null
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Algo deu errado. Tente de novo.', res.status)
  return data as T
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** R$ 549,00 → "R$ 549,00" sem quebra no meio */
export const price = (cents: number) => brl(cents).replace(/\s/g, ' ')

export const waLink = (source: string, extra: Record<string, string | number | undefined> = {}) => {
  const params = new URLSearchParams({ source })
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') params.set(k, String(v))
  return `/api/wa?${params}`
}

export const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'U', '34', '36', '38', '40', '42', '44', '46']
export const sortSizes = (sizes: string[]) =>
  [...new Set(sizes)].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })

export const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}
