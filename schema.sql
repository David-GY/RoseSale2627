CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES ('installation_id',lower(hex(randomblob(16))));
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','cashier'))
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, current_revision INTEGER
);
CREATE TABLE IF NOT EXISTS product_versions (
 id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
 name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
 active INTEGER NOT NULL CHECK(active IN (0,1)), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
 id INTEGER PRIMARY KEY, cashier_id INTEGER NOT NULL REFERENCES users(id), device TEXT NOT NULL,
 opened_at TEXT NOT NULL, closed_at TEXT, opening_cash INTEGER NOT NULL CHECK(opening_cash>=0),
 closing_cash INTEGER CHECK(closing_cash>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts(cashier_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS sales (
 id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT NOT NULL UNIQUE,
 receipt TEXT UNIQUE, payload TEXT NOT NULL, cashier_id INTEGER NOT NULL REFERENCES users(id),
 device TEXT NOT NULL, shift_id INTEGER NOT NULL REFERENCES shifts(id),
 client_at TEXT NOT NULL, created_at TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency='PHP'),
 total INTEGER NOT NULL CHECK(total>=0), status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided','refunded'))
);
CREATE TABLE IF NOT EXISTS sale_items (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
 product_id INTEGER NOT NULL REFERENCES products(id), revision INTEGER NOT NULL REFERENCES product_versions(id),
 sku TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
 quantity INTEGER NOT NULL CHECK(quantity>0)
);
CREATE TABLE IF NOT EXISTS payments (
 sale_id INTEGER PRIMARY KEY REFERENCES sales(id), method TEXT NOT NULL CHECK(method IN ('cash','gcash')),
 status TEXT NOT NULL CHECK(status IN ('paid','pending_verification')),
 received INTEGER NOT NULL CHECK(received>=0), change_due INTEGER NOT NULL CHECK(change_due>=0),
 reference TEXT, verified_by INTEGER REFERENCES users(id), verified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_gcash_reference ON payments(reference) WHERE method='gcash' AND reference IS NOT NULL;
CREATE TABLE IF NOT EXISTS sale_actions (
 id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
 kind TEXT NOT NULL CHECK(kind IN ('void','refund','verify')), actor_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS prevent_sale_delete BEFORE DELETE ON sales BEGIN SELECT RAISE(ABORT,'Sales cannot be deleted'); END;
PRAGMA user_version=1;