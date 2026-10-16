import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, type Product, type StoreInfo, type Variant } from '../lib/api'

export type BagLine = { variantId: number; qty: number }
export type BagItem = BagLine & { product: Product; variant: Variant }

type Ctx = {
  info: StoreInfo | null
  products: Product[]
  loading: boolean
  reload: () => void
  bag: BagItem[]
  bagCount: number
  subtotal: number
  addToBag: (variantId: number, qty?: number) => void
  setQty: (variantId: number, qty: number) => void
  removeFromBag: (variantId: number) => void
  clearBag: () => void
  bagOpen: boolean
  setBagOpen: (v: boolean) => void
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
}

const StoreCtx = createContext<Ctx | null>(null)
const BAG_KEY = 'mysla.bag'

function readBag(): BagLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((l) => l && Number(l.variantId) && Number(l.qty) > 0) : []
  } catch {
    return []
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<StoreInfo | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [lines, setLines] = useState<BagLine[]>(readBag)
  const [bagOpen, setBagOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const reload = useCallback(() => {
    Promise.all([api<StoreInfo>('/store'), api<Product[]>('/products')])
      .then(([i, p]) => { setInfo(i); setProducts(p) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  useEffect(reload, [reload])

  useEffect(() => {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(lines)) } catch { /* navegação privada */ }
  }, [lines])

  // Liga cada linha da sacola à peça e à variação atuais (preço e estoque sempre atualizados)
  const bag = useMemo(() => {
    const out: BagItem[] = []
    for (const l of lines) {
      for (const p of products) {
        const v = p.variants.find((x) => x.id === l.variantId)
        if (v) { out.push({ ...l, product: p, variant: v }); break }
      }
    }
    return out
  }, [lines, products])

  const addToBag = useCallback((variantId: number, qty = 1) => {
    setLines((old) => {
      const found = old.find((l) => l.variantId === variantId)
      return found ? old.map((l) => (l === found ? { ...l, qty: Math.min(20, l.qty + qty) } : l)) : [...old, { variantId, qty }]
    })
    setBagOpen(true)
  }, [])
  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((old) => old.map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, Math.min(20, qty)) } : l)))
  }, [])
  const removeFromBag = useCallback((variantId: number) => setLines((old) => old.filter((l) => l.variantId !== variantId)), [])
  const clearBag = useCallback(() => setLines([]), [])

  const value: Ctx = {
    info, products, loading, reload,
    bag,
    bagCount: bag.reduce((n, i) => n + i.qty, 0),
    subtotal: bag.reduce((s, i) => s + i.product.price_cents * i.qty, 0),
    addToBag, setQty, removeFromBag, clearBag,
    bagOpen, setBagOpen, searchOpen, setSearchOpen,
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore fora do StoreProvider')
  return ctx
}
