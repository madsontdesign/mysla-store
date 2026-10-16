import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import './admin.css'
import { ToastProvider } from './ui'
import Report from './Report'
import { OrderDetail, Orders } from './Orders'
import { ProductEditor, Products } from './Products'
import Showcase from './Showcase'
import WhatsAppSales from './WhatsAppSales'
import Settings from './Settings'

type Me = { email: string; demo: boolean }

export default function AdminApp() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  useEffect(() => {
    document.title = 'Painel — MYSLA'
    api<Me>('/admin/me').then(setMe).catch(() => setMe(null))
  }, [])
  if (me === undefined) return <div className="admin ad-boot" />
  if (me === null) return <Login onLogin={setMe} />
  return (
    <ToastProvider>
      <Shell me={me} onLogout={() => setMe(null)} />
    </ToastProvider>
  )
}

function Login({ onLogin }: { onLogin: (m: Me) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/admin/login', { body: { email, password } })
      onLogin(await api<Me>('/admin/me'))
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.') }
    setBusy(false)
  }
  return (
    <div className="admin ad-login">
      <form onSubmit={submit}>
        <img src="/mysla-logo.png" alt="MYSLA" />
        <span className="ad-eyebrow">PAINEL DA LOJA</span>
        <label className="ad-field"><span className="ad-label">E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="ad-field"><span className="ad-label">Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="ad-error">{error}</div>}
        <button className="ad-btn primary block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <a className="ad-link" href="/inicio">← Voltar para a loja</a>
      </form>
    </div>
  )
}

const NAV = [
  ['/admin', 'Relatório', true],
  ['/admin/pedidos', 'Pedidos', false],
  ['/admin/pecas', 'Peças', false],
  ['/admin/vitrine', 'Banner e tarja', false],
  ['/admin/whatsapp', 'Vendas WhatsApp', false],
  ['/admin/configuracoes', 'Configurações', false],
] as const

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const navigate = useNavigate()
  const [paidCount, setPaidCount] = useState(0)
  useEffect(() => {
    api<{ awaiting_shipment: number }>('/admin/overview').then((o) => setPaidCount(o.awaiting_shipment)).catch(() => {})
  }, [])
  const logout = async () => {
    await api('/admin/logout', { method: 'POST' }).catch(() => {})
    onLogout()
    navigate('/admin')
  }
  return (
    <div className="admin ad-shell">
      <aside className="ad-side">
        <a href="/inicio" className="ad-brand" title="Abrir a loja"><img src="/mysla-logo.png" alt="MYSLA" /><span>PAINEL</span></a>
        <nav>
          {NAV.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
              {to === '/admin/pedidos' && paidCount > 0 && <em title="Pedidos pagos aguardando envio">{paidCount}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="ad-side-foot">
          {me.demo && <div className="ad-demo" title="Configure as chaves do Mercado Pago no arquivo .env">Pagamentos em modo demonstração</div>}
          <span className="ad-me">{me.email}</span>
          <div className="ad-side-links"><a href="/inicio" target="_blank" rel="noreferrer">Ver loja ↗</a><button onClick={logout}>Sair</button></div>
        </div>
      </aside>
      <main className="ad-main">
        <Routes>
          <Route index element={<Report />} />
          <Route path="pedidos" element={<Orders onChange={setPaidCount} />} />
          <Route path="pedidos/:code" element={<OrderDetail onChange={setPaidCount} />} />
          <Route path="pecas" element={<Products />} />
          <Route path="pecas/nova" element={<ProductEditor />} />
          <Route path="pecas/:id" element={<ProductEditor />} />
          <Route path="vitrine" element={<Showcase />} />
          <Route path="whatsapp" element={<WhatsAppSales />} />
          <Route path="configuracoes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
