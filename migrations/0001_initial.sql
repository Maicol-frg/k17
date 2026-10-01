PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'worker')),
  active INTEGER NOT NULL DEFAULT 1,
  commission REAL NOT NULL DEFAULT 5 CHECK(commission >= 0 AND commission <= 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES('setup_complete', '0');
INSERT OR IGNORE INTO settings(key, value) VALUES('order_sequence', '123');

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  worker_id INTEGER NOT NULL REFERENCES users(id),
  commission_rate REAL NOT NULL,
  created_at TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_orders_worker_date ON orders(worker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  size TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  image_key TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_image ON items(image_key);
