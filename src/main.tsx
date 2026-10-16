import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './store.css'
import './store-extra.css'
import { StoreProvider } from './store/StoreContext'
import Layout from './store/Layout'
import { About, Entry, Home, NotFound, ProductPage, Shop } from './store/pages'
import { Checkout, OrderLookup, OrderPage } from './store/checkout'

// O painel só é baixado por quem entra em /admin
const AdminApp = lazy(() => import('./admin/AdminApp'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
        <Route path="*" element={
          <StoreProvider>
            <Routes>
              <Route path="/" element={<Entry />} />
              <Route element={<Layout />}>
                <Route path="/inicio" element={<Home />} />
                <Route path="/produtos" element={<Shop />} />
                <Route path="/produto/:slug" element={<ProductPage />} />
                <Route path="/sobre" element={<About />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/pedido/:code" element={<OrderPage />} />
                <Route path="/meu-pedido" element={<OrderLookup />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </StoreProvider>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
