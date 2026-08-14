const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("black_gag2.db");

/* =========================
   TÀI KHOẢN ADMIN
   ========================= */
const ADMIN_USERNAME = "blackadmin";
const ADMIN_PASSWORD = "11102011tuankhoi";
// ↑ Đổi dòng trên thành mật khẩu riêng của m.

/* =========================
   DATABASE
   ========================= */
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 contact TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 balance INTEGER NOT NULL DEFAULT 0,
 role TEXT NOT NULL DEFAULT 'user',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 price INTEGER NOT NULL,
 stock INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL,
 qty INTEGER NOT NULL,
 unit_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topups(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 method TEXT NOT NULL,
 amount INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 provider_ref TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions(
 token TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

/* =========================
   SẢN PHẨM MẶC ĐỊNH
   ========================= */
const count = db.prepare(
  "SELECT COUNT(*) c FROM products"
).get().c;

if (!count) {
  const ins = db.prepare(
    "INSERT INTO products(name,price,stock) VALUES(?,?,?)"
  );

  [
    ["Dragon Breath Seed", 4000, 0],
    ["Star Fruit", 8000, 0],
    ["Sun Bloom", 3000, 0],
    ["Super Watering", 1000, 0],
    ["Super Sprinkler", 1000, 0],
    ["Hypno Bloom", 2000, 0],
    ["Moon Bloom", 2000, 0],
    ["Mega Seed", 1000, 0],
    ["Rainbow Seed", 1000, 0]
  ].forEach(x => ins.run(...x));
}

/* =========================
   TẠO ADMIN TỰ ĐỘNG
   ========================= */
function createAdmin() {
  const admin = db.prepare(
    "SELECT * FROM users WHERE username=?"
  ).get(ADMIN_USERNAME);

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

  if (!admin) {
    db.prepare(`
      INSERT INTO users
      (username,contact,password_hash,role)
      VALUES(?,?,?,'admin')
    `).run(
      ADMIN_USERNAME,
      "admin@black-gag2.local",
      hash
    );

    console.log("Đã tạo tài khoản Admin:", ADMIN_USERNAME);
  } else if (admin.role !== "admin") {
    db.prepare(`
      UPDATE users
      SET role='admin', password_hash=?
      WHERE username=?
    `).run(hash, ADMIN_USERNAME);
  }
}

createAdmin();

/* =========================
   SERVER
   ========================= */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   ĐĂNG NHẬP
   ========================= */
function getUser(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7);

  return db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token=?
  `).get(token) || null;
}

function requireUser(req, res, next) {
  const user = getUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Đăng nhập trước."
    });
  }

  req.user = user;
  next();
}

/* =========================
   KIỂM TRA ADMIN
   ========================= */
function requireAdmin(req, res, next) {
  const user = getUser(req);

  if (!user || user.role !== "admin") {
    return res.status(403).json({
      error: "Không có quyền Admin."
    });
  }

  req.user = user;
  next();
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

/* =========================
   SẢN PHẨM
   ========================= */
app.get("/api/products", (req, res) => {
  const products = db.prepare(`
    SELECT id,name,price,stock
    FROM products
    WHERE active=1
    ORDER BY id
  `).all();

  res.json(products);
});

/* =========================
   ĐĂNG KÝ
   ========================= */
app.post("/api/register", (req, res) => {
  const {
    username,
    contact,
    password
  } = req.body || {};

  if (
    !username ||
    username.length < 3 ||
    !contact ||
    !password ||
    password.length < 6
  ) {
    return res.status(400).json({
      error: "Vui lòng nhập đủ thông tin. Mật khẩu tối thiểu 6 ký tự."
    });
  }

  if (username.trim() === ADMIN_USERNAME) {
    return res.status(400).json({
      error: "Tên đăng nhập này đã được sử dụng."
    });
  }

  const c = String(contact).trim();

  const email =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

  const phone =
    /^(\+?84|0)\d{9,10}$/.test(
      c.replace(/[ .-]/g, "")
    );

  if (!email && !phone) {
    return res.status(400).json({
      error: "Email hoặc số điện thoại không hợp lệ."
    });
  }

  try {
    const hash = bcrypt.hashSync(password, 12);

    const result = db.prepare(`
      INSERT INTO users
      (username,contact,password_hash)
      VALUES(?,?,?)
    `).run(
      username.trim(),
      c,
      hash
    );

    const token = createToken();

    db.prepare(`
      INSERT INTO sessions(token,user_id)
      VALUES(?,?)
    `).run(
      token,
      result.lastInsertRowid
    );

    res.json({
      token,
      username: username.trim(),
      role: "user",
      balance: 0
    });

  } catch (e) {
    res.status(400).json({
      error: "Tên đăng nhập đã tồn tại."
    });
  }
});

/* =========================
   ĐĂNG NHẬP
   ========================= */
app.post("/api/login", (req, res) => {
  const {
    login,
    password
  } = req.body || {};

  const value = String(login || "").trim();

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE username=? OR contact=?
  `).get(value, value);

  if (
    !user ||
    !bcrypt.compareSync(
      String(password || ""),
      user.password_hash
    )
  ) {
    return res.status(401).json({
      error: "Thông tin đăng nhập không đúng."
    });
  }

  const token = createToken();

  db.prepare(`
    INSERT INTO sessions(token,user_id)
    VALUES(?,?)
  `).run(token, user.id);

  res.json({
    token,
    username: user.username,
    role: user.role,
    balance: user.balance
  });
});

/* =========================
   ME
   ========================= */
app.get("/api/me", requireUser, (req, res) => {
  res.json({
    username: req.user.username,
    contact: req.user.contact,
    balance: req.user.balance,
    role: req.user.role
  });
});

/* =========================
   LOGOUT
   ========================= */
app.post("/api/logout", requireUser, (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");

  db.prepare(
    "DELETE FROM sessions WHERE token=?"
  ).run(token);

  res.json({
    ok: true
  });
});

/* =========================
   ĐƠN HÀNG
   ========================= */
app.post("/api/orders", requireUser, (req, res) => {
  const items = Array.isArray(req.body.items)
    ? req.body.items
    : [];

  if (!items.length) {
    return res.status(400).json({
      error: "Giỏ hàng trống."
    });
  }

  let total = 0;
  const checked = [];

  for (const item of items) {
    const product = db.prepare(`
      SELECT *
      FROM products
      WHERE id=? AND active=1
    `).get(Number(item.productId));

    const qty = Math.max(
      1,
      Math.floor(Number(item.qty) || 1)
    );

    if (!product) {
      return res.status(400).json({
        error: "Sản phẩm không tồn tại."
      });
    }

    if (
      product.stock > 0 &&
      product.stock < qty
    ) {
      return res.status(400).json({
        error: `Không đủ hàng: ${product.name}`
      });
    }

    total += product.price * qty;

    checked.push({
      product,
      qty
    });
  }

  if (req.user.balance < total) {
    return res.status(400).json({
      error: "Số dư không đủ."
    });
  }

  const transaction = db.transaction(() => {

    db.prepare(`
      UPDATE users
      SET balance=balance-?
      WHERE id=?
    `).run(
      total,
      req.user.id
    );

    const order = db.prepare(`
      INSERT INTO orders(user_id,total)
      VALUES(?,?)
    `).run(
      req.user.id,
      total
    );

    const itemInsert = db.prepare(`
      INSERT INTO order_items
      (order_id,product_id,qty,unit_price)
      VALUES(?,?,?,?)
    `);

    for (const x of checked) {

      itemInsert.run(
        order.lastInsertRowid,
        x.product.id,
        x.qty,
        x.product.price
      );

      if (x.product.stock > 0) {
        db.prepare(`
          UPDATE products
          SET stock=stock-?
          WHERE id=?
        `).run(
          x.qty,
          x.product.id
        );
      }
    }

    return order.lastInsertRowid;
  });

  res.json({
    orderId: transaction()
  });
});

/* =========================
   XEM ĐƠN
   ========================= */
app.get("/api/orders", requireUser, (req, res) => {
  const orders = db.prepare(`
    SELECT
      o.id,
      o.total,
      o.status,
      o.created_at,
      GROUP_CONCAT(
        p.name || ' × ' || oi.qty,
        ', '
      ) items
    FROM orders o
    JOIN order_items oi
      ON oi.order_id=o.id
    JOIN products p
      ON p.id=oi.product_id
    WHERE o.user_id=?
    GROUP BY o.id
    ORDER BY o.id DESC
  `).all(req.user.id);

  res.json(orders);
});

/* =========================
   NẠP THẺ
   ========================= */
app.post("/api/topups/card", requireUser, (req, res) => {

  const {
    provider,
    value,
    serial,
    code
  } = req.body || {};

  if (
    !provider ||
    !value ||
    !serial ||
    !code
  ) {
    return res.status(400).json({
      error: "Thiếu thông tin thẻ."
    });
  }

  const result = db.prepare(`
    INSERT INTO topups
    (user_id,method,amount,provider_ref)
    VALUES(?,?,?,?)
  `).run(
    req.user.id,
    "CARD",
    Number(value),
    provider + "|" + serial
  );

  res.json({
    id: result.lastInsertRowid,
    status: "PENDING"
  });
});

/* =========================
   NẠP BANK
   ========================= */
app.post("/api/topups/bank", requireUser, (req, res) => {

  const amount = Number(
    req.body?.amount
  );

  if (
    !Number.isFinite(amount) ||
    amount < 1000
  ) {
    return res.status(400).json({
      error: "Số tiền không hợp lệ."
    });
  }

  const result = db.prepare(`
    INSERT INTO topups
    (user_id,method,amount)
    VALUES(?,?,?)
  `).run(
    req.user.id,
    "BANK",
    amount
  );

  res.json({
    id: result.lastInsertRowid,
    status: "PENDING"
  });
});

/* ==================================================
   ADMIN
   ================================================== */

/* Xem toàn bộ dữ liệu */
app.get(
  "/api/admin/overview",
  requireAdmin,
  (req, res) => {

    res.json({

      users: db.prepare(`
        SELECT
          id,
          username,
          contact,
          balance,
          role,
          created_at
        FROM users
        ORDER BY id DESC
      `).all(),

      products: db.prepare(`
        SELECT *
        FROM products
        ORDER BY id
      `).all(),

      orders: db.prepare(`
        SELECT
          o.id,
          u.username,
          o.total,
          o.status,
          o.created_at
        FROM orders o
        JOIN users u
          ON u.id=o.user_id
        ORDER BY o.id DESC
      `).all(),

      topups: db.prepare(`
        SELECT
          t.id,
          u.username,
          t.method,
          t.amount,
          t.status,
          t.created_at
        FROM topups t
        JOIN users u
          ON u.id=t.user_id
        ORDER BY t.id DESC
      `).all()
    });
  }
);

/* Thêm sản phẩm */
app.post(
  "/api/admin/products",
  requireAdmin,
  (req, res) => {

    const {
      name,
      price,
      stock
    } = req.body || {};

    const p = Number(price);
    const s = Number(stock);

    if (
      !name ||
      !Number.isFinite(p) ||
      p <= 0
    ) {
      return res.status(400).json({
        error: "Tên hoặc giá không hợp lệ."
      });
    }

    const result = db.prepare(`
      INSERT INTO products
      (name,price,stock)
      VALUES(?,?,?)
    `).run(
      name.trim(),
      Math.floor(p),
      Number.isFinite(s)
        ? Math.max(0, Math.floor(s))
        : 0
    );

    res.json({
      id: result.lastInsertRowid
    });
  }
);

/* Sửa sản phẩm */
app.patch(
  "/api/admin/products/:id",
  requireAdmin,
  (req, res) => {

    const {
      name,
      price,
      stock,
      active
    } = req.body || {};

    const p =
      price === undefined
        ? null
        : Number(price);

    const s =
      stock === undefined
        ? null
        : Number(stock);

    const a =
      active === undefined
        ? null
        : active
          ? 1
          : 0;

    if (
      p !== null &&
      (!Number.isFinite(p) || p <= 0)
    ) {
      return res.status(400).json({
        error: "Giá không hợp lệ."
      });
    }

    if (
      s !== null &&
      (!Number.isFinite(s) || s < 0)
    ) {
      return res.status(400).json({
        error: "Tồn kho không hợp lệ."
      });
    }

    db.prepare(`
      UPDATE products
      SET
        name=COALESCE(?,name),
        price=COALESCE(?,price),
        stock=COALESCE(?,stock),
        active=COALESCE(?,active)
      WHERE id=?
    `).run(
      name || null,
      p === null ? null : Math.floor(p),
      s === null ? null : Math.floor(s),
      a,
      Number(req.params.id)
    );

    res.json({
      ok: true
    });
  }
);

/* Duyệt nạp tiền */
app.post(
  "/api/admin/topups/:id/approve",
  requireAdmin,
  (req, res) => {

    const topup = db.prepare(`
      SELECT *
      FROM topups
      WHERE id=?
    `).get(Number(req.params.id));

    if (
      !topup ||
      topup.status !== "PENDING"
    ) {
      return res.status(400).json({
        error: "Yêu cầu không hợp lệ."
      });
    }

    const transaction = db.transaction(() => {

      db.prepare(`
        UPDATE topups
        SET status='APPROVED'
        WHERE id=?
      `).run(topup.id);

      db.prepare(`
        UPDATE users
        SET balance=balance+?
        WHERE id=?
      `).run(
        topup.amount,
        topup.user_id
      );
    });

    transaction();

    res.json({
      ok: true
    });
  }
);

/* Đổi trạng thái đơn */
app.post(
  "/api/admin/orders/:id/status",
  requireAdmin,
  (req, res) => {

    const allowed = [
      "PENDING",
      "PROCESSING",
      "COMPLETED",
      "CANCELLED"
    ];

    if (
      !allowed.includes(
        req.body?.status
      )
    ) {
      return res.status(400).json({
        error: "Trạng thái không hợp lệ."
      });
    }

    db.prepare(`
      UPDATE orders
      SET status=?
      WHERE id=?
    `).run(
      req.body.status,
      Number(req.params.id)
    );

    res.json({
      ok: true
    });
  }
);

/* =========================
   TRANG SHOP
   ========================= */
app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(
  PORT,
  () => {
    console.log(
      `BLACK GAG2 SHOP running on http://localhost:${PORT}`
    );
    console.log(
      `Admin: ${ADMIN_USERNAME}`
    );
  }
);