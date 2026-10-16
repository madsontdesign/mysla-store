import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new Database(path.join(DATA_DIR, 'loja.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '', position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  composition TEXT DEFAULT '',
  price_cents INTEGER NOT NULL,
  compare_at_cents INTEGER,               -- preço "de" quando em promoção
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL, position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT NOT NULL, color_hex TEXT DEFAULT '#111111',
  size TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, color, size)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,              -- protege a página do pedido do cliente
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | shipped | delivered | cancelled
  payment_method TEXT,                     -- pix | card
  payment_status TEXT,                     -- status devolvido pelo Mercado Pago
  mp_payment_id TEXT,
  pix_qr TEXT, pix_qr_base64 TEXT, pix_expires_at TEXT,
  installments INTEGER,
  customer_name TEXT NOT NULL, customer_email TEXT NOT NULL,
  customer_cpf TEXT NOT NULL, customer_phone TEXT NOT NULL,
  address TEXT NOT NULL,                   -- JSON
  subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
  tracking_code TEXT, notes TEXT,
  stock_released INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, variant_id INTEGER,
  name TEXT NOT NULL, color TEXT, size TEXT, image TEXT,
  unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_clicks (
  id INTEGER PRIMARY KEY,
  product_id INTEGER, source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS whatsapp_sales (
  id INTEGER PRIMARY KEY,
  product_id INTEGER, description TEXT DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1, amount_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_paid ON orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON whatsapp_clicks(created_at);
`)

// ---------- configurações ----------
const DEFAULT_SETTINGS = {
  store_name: 'MYSLA',
  store_tagline: 'Moda contemporânea\nSão Paulo / Brasil',
  whatsapp_number: '5585999999999',
  whatsapp_message: 'Olá! Vim pelo site da MYSLA e gostaria de ajuda.',
  instagram_url: 'https://www.instagram.com/',
  tiktok_url: 'https://www.tiktok.com/',
  shipping_flat_cents: 2990,
  free_shipping_min_cents: 80000,
  max_installments: 6,
  announcement: {
    enabled: true,
    text: 'FRETE GRÁTIS EM COMPRAS ACIMA DE R$ 800',
    ends_at: null,
  },
  hero: {
    eyebrow: 'COLEÇÃO ATUAL / 01—26',
    title: 'FORM\n/ MOVEMENT',
    subtitle: 'Um estudo de estrutura suave e proporção sem esforço.',
    cta_label: 'DESCOBRIR A COLEÇÃO',
    cta_link: '/produtos?colecao=form-movement',
    image: 'https://images.unsplash.com/photo-1762605135321-d025ebbd13d8?auto=format&fit=crop&w=1800&q=88',
    image_mobile: '',
    caption: 'MYSLA / COLEÇÃO 01',
  },
  campaign: {
    eyebrow: 'CAMPANHA 01 / 2026',
    title: 'ENTRE\nFORMA & MOVIMENTO',
    cta_label: 'EXPLORAR A SELEÇÃO',
    cta_link: '/produtos',
    image: 'https://images.unsplash.com/photo-1603189343302-e603f7add05a?auto=format&fit=crop&w=1800&q=88',
  },
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? JSON.parse(row.value) : DEFAULT_SETTINGS[key]
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}
export function allSettings() {
  const out = { ...DEFAULT_SETTINGS }
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = JSON.parse(row.value)
  return out
}
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS)

export function slugify(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

// ---------- primeiro uso: administrador e catálogo de exemplo ----------
export function bootstrap() {
  const admins = db.prepare('SELECT COUNT(*) n FROM admin_users').get().n
  if (!admins) {
    const email = (process.env.ADMIN_EMAIL || 'admin@mysla.com.br').toLowerCase()
    const password = process.env.ADMIN_PASSWORD || 'mysla123'
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, bcrypt.hashSync(password, 10))
    console.log(`[painel] usuário criado: ${email}${process.env.ADMIN_PASSWORD ? '' : ' / senha: mysla123 (troque no painel!)'}`)
  }

  const hasProducts = db.prepare('SELECT COUNT(*) n FROM products').get().n
  const hasCategories = db.prepare('SELECT COUNT(*) n FROM categories').get().n
  if (hasProducts || hasCategories) return

  const cats = ['Conjuntos', 'Calças', 'Blusas', 'Vestidos', 'Saias', 'Shorts', 'Acessórios']
  const insCat = db.prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, ?)')
  cats.forEach((c, i) => insCat.run(c, slugify(c), i))
  const cols = [
    ['Form / Movement', 'Estudos de estrutura suave e proporção.'],
    ['Still Life', ''], ['Second Skin', ''], ['After Light', ''],
  ]
  const insCol = db.prepare('INSERT INTO collections (name, slug, description, position) VALUES (?, ?, ?, ?)')
  cols.forEach(([n, d], i) => insCol.run(n, slugify(n), d, i))

  const catId = (name) => db.prepare('SELECT id FROM categories WHERE name = ?').get(name).id
  const colId = db.prepare('SELECT id FROM collections WHERE slug = ?').get('form-movement').id
  const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=88`

  const seed = [
    ['Vestido Sienna', 549, 'Vestidos', ['Marfim', '#e9e5dc'], ['photo-1722926898838-3f605d4e8dff', 'photo-1785354745594-c205b95004e2', 'photo-1751470433909-cf391ce06c2b'], 'Vestido midi fluido, com decote limpo e silhueta de estrutura suave.'],
    ['Blazer Alma', 679, 'Blusas', ['Pedra', '#d8d3cc'], ['photo-1779406166699-662a041a12a9', 'photo-1779406167603-d0afe0a4cdd7'], 'Blazer de alfaiataria leve, ombros naturais e caimento reto.'],
    ['Saia Noa', 389, 'Saias', ['Preto', '#111111'], ['photo-1714207427812-ef765d0e6a4c', 'photo-1702651419103-72b50df2a037'], 'Saia midi de cintura alta com movimento fluido.'],
    ['Vestido Miro', 629, 'Vestidos', ['Preto', '#111111'], ['photo-1585131552878-bbfcbd998d57', 'photo-1762605135332-8a7ce1403187'], 'Vestido longo de linhas retas e decote nas costas.'],
    ['Top Lina', 289, 'Blusas', ['Branco', '#ffffff'], ['photo-1759350075124-4268c95108ba', 'photo-1759350075133-d8dab3dcafc3'], 'Top de alças finas em malha encorpada.'],
    ['Conjunto Cora', 749, 'Conjuntos', ['Caramelo', '#b98a5e'], ['photo-1772714601004-23b94ae3913d', 'photo-1772714601002-fbb0fea8a911'], 'Conjunto de camisa e calça em linho misto.'],
    ['Calça Maura', 449, 'Calças', ['Pedra', '#d8d3cc'], ['photo-1618244965061-1d27b208d6e8', 'photo-1694026331525-88786ccd7639'], 'Calça pantalona de cintura alta e pregas frontais.'],
    ['Vestido Ada', 589, 'Vestidos', ['Cacau', '#5a3e32'], ['photo-1713425887001-5c7bb45711f8', 'photo-1654254124804-ff11a2db81ed'], 'Vestido midi acinturado com mangas amplas.'],
  ]
  const insP = db.prepare(`INSERT INTO products (slug, name, description, composition, price_cents, category_id, collection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const insI = db.prepare('INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)')
  const insV = db.prepare('INSERT INTO variants (product_id, color, color_hex, size, stock) VALUES (?, ?, ?, ?, ?)')
  db.transaction(() => {
    // Insere do último para o primeiro, para "Novidades" mostrar a ordem do protótipo
    seed.reverse()
    seed.forEach(([name, price, cat, [color, hex], imgs, desc], idx) => {
      const pid = insP.run(slugify(name), name, desc, 'Viscose premium. Lavar à mão e secar à sombra.',
        price * 100, catId(cat), idx >= 4 ? colId : null).lastInsertRowid
      imgs.forEach((im, i) => insI.run(pid, photo(im), i))
      for (const size of ['PP', 'P', 'M', 'G', 'GG']) insV.run(pid, color, hex, size, 5)
      if (name === 'Vestido Sienna') for (const size of ['PP', 'P', 'M', 'G', 'GG']) insV.run(pid, 'Preto', '#111111', size, 3)
    })
  })()
  console.log('[loja] catálogo de exemplo criado (8 peças). Edite ou apague pelo painel.')
}
