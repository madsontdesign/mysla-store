import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { api } from '../lib/api'

// ---------- dinheiro ----------
export const centsToInput = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace('.', ',') : '')
export const inputToCents = (s: string) => {
  const clean = String(s).replace(/[^\d,.-]/g, '')
  if (!clean) return 0
  // aceita "1.234,56", "1234,56" e "1234.56"
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  return Math.round(Number(normalized) * 100) || 0
}

// ---------- avisos ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {})
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="ad-toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`ad-toast ${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------- campos ----------
type FieldProps = {
  label: string
  hint?: React.ReactNode
  children?: React.ReactNode
  className?: string
}
export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <label className={`ad-field ${className}`}>
      <span className="ad-label">{label}</span>
      {children}
      {hint && <small className="ad-hint">{hint}</small>}
    </label>
  )
}

export function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="ad-money">
      <span>R$</span>
      <input inputMode="decimal" value={value} placeholder={placeholder || '0,00'} onChange={(e) => onChange(e.target.value)}
        onBlur={() => value && onChange(centsToInput(inputToCents(value)))} />
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`ad-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <i /><span>{label}</span>
    </button>
  )
}

/** Envia imagens para o servidor e devolve os endereços. */
export async function uploadFiles(files: FileList | File[]) {
  const fd = new FormData()
  for (const f of Array.from(files)) fd.append('files', f)
  const r = await api<{ urls: string[] }>('/admin/upload', { method: 'POST', body: fd })
  return r.urls
}

export function ImagePicker({ value, onChange, label, hint, aspect = '16 / 9' }: { value: string; onChange: (url: string) => void; label: string; hint?: string; aspect?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try { onChange((await uploadFiles([files[0]]))[0]) } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }
  return (
    <div className="ad-field">
      <span className="ad-label">{label}</span>
      <div className={`ad-image-pick ${value ? 'has' : ''}`} style={{ aspectRatio: aspect }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files) }}>
        {value ? <img src={value} alt="" /> : <span>{busy ? 'Enviando…' : 'Arraste uma imagem ou clique para escolher'}</span>}
        <div className="ad-image-actions">
          <button type="button" className="ad-btn small" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Enviando…' : value ? 'Trocar' : 'Escolher imagem'}</button>
          {value && <button type="button" className="ad-btn small ghost" onClick={() => onChange('')}>Remover</button>}
        </div>
      </div>
      {hint && <small className="ad-hint">{hint}</small>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="ad-page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="ad-head-actions">{children}</div>}
    </div>
  )
}

export const fmtDate = (s: string | null, withTime = true) => {
  if (!s) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/')
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return d.toLocaleString('pt-BR', withTime ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  const s = new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
