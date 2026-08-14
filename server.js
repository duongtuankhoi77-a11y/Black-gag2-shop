const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("black_gag2.db");

/* ==================================================
   TÀI KHOẢN ADMIN
   ================================================== */

const ADMIN_USERNAME = "blackadmin";

/*
   ĐỔI MẬT KHẨU ADMIN Ở ĐÂY
*/
const ADMIN_PASSWORD = "11102011tuankhoi";

/* ==================================================
   DATABASE
   ================================================== */

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


/* ==================================================
   THÊM CỘT NẾU DATABASE CŨ CHƯA CÓ
   ================================================== */

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (!columns.some(x => x.name === column)) {
    db.exec(`
      ALTER TABLE ${table}
      ADD COLUMN ${column} ${definition}
    `);
  }
}

addColumnIfMissing(
  "topups",
  "credited_amount",
  "INTEGER"
);

addColumnIfMissing(
  "products",
  "image",
  "TEXT"
);


/* ==================================================
   SẢN PHẨM MẶC ĐỊNH
   ================================================== */

const count = db.prepare(
  "SELECT COUNT(*) c FROM products"
).get().c;

if (!count) {

  const ins = db.prepare(`
    INSERT INTO products
    (name,price,stock)
    VALUES(?,?,?)
  `);

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


/* ==================================================
   TẠO ADMIN
   ================================================== */

function createAdmin() {

  const admin = db.prepare(`
    SELECT *
    FROM users
    WHERE username=?
  `).get(ADMIN_USERNAME);

  const hash = bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

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

    console.log(
      "Đã tạo tài khoản Admin:",
      ADMIN_USERNAME
    );

  } else if (admin.role !== "admin") {

    db.prepare(`
      UPDATE users
      SET
        role='admin',
        password_hash=?
      WHERE username=?
    `).run(
      hash,
      ADMIN_USERNAME
    );
  }
}

createAdmin();


/* ==================================================
   SERVER
   ================================================== */

app.use(express.json({limit:"8mb"}));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* ==================================================
   TOKEN
   ================================================== */

function createToken() {

  return crypto
    .randomBytes(32)
    .toString("hex");
}


/* ==================================================
   LẤY USER
   ================================================== */

function getUser(req) {

  const auth =
    req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  const token =
    auth.slice(7);

  return db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u
      ON u.id=s.user_id
    WHERE s.token=?
  `).get(token) || null;
}


/* ==================================================
   REQUIRE USER
   ================================================== */

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


/* ==================================================
   REQUIRE ADMIN
   ================================================== */

function requireAdmin(req, res, next) {

  const user = getUser(req);

  if (
    !user ||
    user.role !== "admin"
  ) {

    return res.status(403).json({
      error: "Không có quyền Admin."
    });
  }

  req.user = user;
  next();
}


/* ==================================================
   SẢN PHẨM
   ================================================== */

app.get(
  "/api/products",
  (req, res) => {

    const products = db.prepare(`
      SELECT
        id,
        name,
        price,
        stock,
        image
      FROM products
      WHERE active=1
      ORDER BY id
    `).all();

    res.json(products);
  }
);


/* ==================================================
   ĐĂNG KÝ
   ================================================== */

app.post(
  "/api/register",
  (req, res) => {

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
        error:
          "Vui lòng nhập đủ thông tin. Mật khẩu tối thiểu 6 ký tự."
      });
    }

    if (
      username.trim() ===
      ADMIN_USERNAME
    ) {

      return res.status(400).json({
        error:
          "Tên đăng nhập này đã được sử dụng."
      });
    }

    const c =
      String(contact).trim();

    const email =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(c);

    const phone =
      /^(\+?84|0)\d{9,10}$/.test(
        c.replace(/[ .-]/g, "")
      );

    if (!email && !phone) {

      return res.status(400).json({
        error:
          "Email hoặc số điện thoại không hợp lệ."
      });
    }

    try {

      const hash =
        bcrypt.hashSync(
          password,
          12
        );

      const result =
        db.prepare(`
          INSERT INTO users
          (username,contact,password_hash)
          VALUES(?,?,?)
        `).run(
          username.trim(),
          c,
          hash
        );

      const token =
        createToken();

      db.prepare(`
        INSERT INTO sessions
        (token,user_id)
        VALUES(?,?)
      `).run(
        token,
        result.lastInsertRowid
      );

      res.json({
        token,
        username:
          username.trim(),
        role: "user",
        balance: 0
      });

    } catch (e) {

      res.status(400).json({
        error:
          "Tên đăng nhập đã tồn tại."
      });
    }
  }
);


/* ==================================================
   ĐĂNG NHẬP
   ================================================== */

app.post(
  "/api/login",
  (req, res) => {

    const {
      login,
      password
    } = req.body || {};

    const value =
      String(login || "").trim();

    const user =
      db.prepare(`
        SELECT *
        FROM users
        WHERE username=?
        OR contact=?
      `).get(
        value,
        value
      );

    if (
      !user ||
      !bcrypt.compareSync(
        String(password || ""),
        user.password_hash
      )
    ) {

      return res.status(401).json({
        error:
          "Thông tin đăng nhập không đúng."
      });
    }

    const token =
      createToken();

    db.prepare(`
      INSERT INTO sessions
      (token,user_id)
      VALUES(?,?)
    `).run(
      token,
      user.id
    );

    res.json({
      token,
      username:
        user.username,
      role:
        user.role,
      balance:
        user.balance
    });
  }
);


/* ==================================================
   ME
   ================================================== */

app.get(
  "/api/me",
  requireUser,
  (req, res) => {

    res.json({
      username:
        req.user.username,
      contact:
        req.user.contact,
      balance:
        req.user.balance,
      role:
        req.user.role
    });
  }
);


/* ==================================================
   LOGOUT
   ================================================== */

app.post(
  "/api/logout",
  requireUser,
  (req, res) => {

    const auth =
      req.headers.authorization || "";

    const token =
      auth.replace(
        "Bearer ",
        ""
      );

    db.prepare(`
      DELETE FROM sessions
      WHERE token=?
    `).run(token);

    res.json({
      ok: true
    });
  }
);


/* ==================================================
   ĐẶT HÀNG
   ================================================== */

app.post(
  "/api/orders",
  requireUser,
  (req, res) => {

    const items =
      Array.isArray(req.body.items)
        ? req.body.items
        : [];

    if (!items.length) {

      return res.status(400).json({
        error:
          "Giỏ hàng trống."
      });
    }

    let total = 0;
    const checked = [];

    for (const item of items) {

      const product =
        db.prepare(`
          SELECT *
          FROM products
          WHERE id=?
          AND active=1
        `).get(
          Number(item.productId)
        );

      const qty =
        Math.max(
          1,
          Math.floor(
            Number(item.qty) || 1
          )
        );

      if (!product) {

        return res.status(400).json({
          error:
            "Sản phẩm không tồn tại."
        });
      }

      if (
        product.stock > 0 &&
        product.stock < qty
      ) {

        return res.status(400).json({
          error:
            `Không đủ hàng: ${product.name}`
        });
      }

      total +=
        product.price * qty;

      checked.push({
        product,
        qty
      });
    }

    if (
      req.user.balance <
      total
    ) {

      return res.status(400).json({
        error:
          "Số dư không đủ."
      });
    }

    const transaction =
      db.transaction(() => {

        db.prepare(`
          UPDATE users
          SET balance=balance-?
          WHERE id=?
        `).run(
          total,
          req.user.id
        );

        const order =
          db.prepare(`
            INSERT INTO orders
            (user_id,total,status)
            VALUES(?,?, 'PENDING')
          `).run(
            req.user.id,
            total
          );

        const itemInsert =
          db.prepare(`
            INSERT INTO order_items
            (order_id,product_id,qty,unit_price)
            VALUES(?,?,?,?)
          `);

        for (
          const x of checked
        ) {

          itemInsert.run(
            order.lastInsertRowid,
            x.product.id,
            x.qty,
            x.product.price
          );

          if (
            x.product.stock > 0
          ) {

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

    const orderId =
      transaction();

    res.json({
      orderId
    });
  }
);


/* ==================================================
   XEM ĐƠN
   ================================================== */

app.get(
  "/api/orders",
  requireUser,
  (req, res) => {

    const orders =
      db.prepare(`
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
      `).all(
        req.user.id
      );

    res.json(orders);
  }
);


/* ==================================================
   NẠP CARD
   CHIẾT KHẤU 16%
   ================================================== */

app.post(
  "/api/topups/card",
  requireUser,
  (req, res) => {

    const {
      provider,
      value,
      serial,
      code
    } = req.body || {};

    const faceValue =
      Number(value);

    if (
      !provider ||
      !Number.isFinite(faceValue) ||
      faceValue <= 0 ||
      !serial ||
      !code
    ) {

      return res.status(400).json({
        error:
          "Thiếu thông tin thẻ."
      });
    }

    const providerRef =
      JSON.stringify({
        provider,
        serial: String(serial).trim(),
        code: String(code).trim()
      });

    const expectedCredit =
      Math.floor(
        faceValue * 0.84
      );

    const result =
      db.prepare(`
        INSERT INTO topups
        (
          user_id,
          method,
          amount,
          status,
          provider_ref,
          credited_amount
        )
        VALUES(?,?,?,?,?,?)
      `).run(
        req.user.id,
        "CARD",
        faceValue,
        "PENDING",
        providerRef,
        expectedCredit
      );

    res.json({
      id:
        result.lastInsertRowid,
      status:
        "PENDING",
      faceValue,
      expectedCredit
    });
  }
);


/* ==================================================
   NẠP BANK / ZALOPAY
   TỐI THIỂU 10.000đ
   ================================================== */

app.post(
  "/api/topups/bank",
  requireUser,
  (req, res) => {

    const amount =
      Number(
        req.body?.amount
      );

    if (
      !Number.isFinite(amount) ||
      amount < 10000
    ) {

      return res.status(400).json({
        error:
          "Số tiền nạp Bank tối thiểu là 10.000đ."
      });
    }

    const result =
      db.prepare(`
        INSERT INTO topups
        (user_id,method,amount,status)
        VALUES(?,?,?,'PENDING')
      `).run(
        req.user.id,
        "BANK",
        Math.floor(amount)
      );

    res.json({
      id:
        result.lastInsertRowid,
      status:
        "PENDING"
    });
  }
);/* ==================================================
   ADMIN - OVERVIEW
   ================================================== */

app.get(
  "/api/admin/overview",
  requireAdmin,
  (req, res) => {

    const users =
      db.prepare(`
        SELECT
          id,
          username,
          contact,
          balance,
          role,
          created_at
        FROM users
        ORDER BY id DESC
      `).all();

    const products =
      db.prepare(`
        SELECT *
        FROM products
        ORDER BY id
      `).all();

    const orders =
      db.prepare(`
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
      `).all();

    const topups =
      db.prepare(`
        SELECT
          t.id,
          u.username,
          u.contact,
          t.method,
          t.amount,
          t.credited_amount,
          t.status,
          t.provider_ref,
          t.created_at
        FROM topups t
        JOIN users u
          ON u.id=t.user_id
        ORDER BY t.id DESC
      `).all();

    /*
      Giải mã thông tin card để
      Admin nhìn rõ nhà mạng,
      serial và mã thẻ.
    */

    for (
      const t of topups
    ) {

      if (
        t.method === "CARD" &&
        t.provider_ref
      ) {

        try {

          const data =
            JSON.parse(
              t.provider_ref
            );

          t.provider =
            data.provider;

          t.serial =
            data.serial;

          t.code =
            data.code;

        } catch {

          const parts =
            String(
              t.provider_ref
            ).split("|");

          t.provider =
            parts[0] || "";

          t.serial =
            parts[1] || "";

          t.code =
            parts[2] || "";
        }
      }
    }

    res.json({
      users,
      products,
      orders,
      topups
    });
  }
);


/* ==================================================
   ADMIN - THÊM SẢN PHẨM
   ================================================== */

app.post(
  "/api/admin/products",
  requireAdmin,
  (req, res) => {

    const {
      name,
      price,
      stock,
      image
    } = req.body || {};

    const p =
      Number(price);

    const s =
      Number(stock);

    if (
      !name ||
      !Number.isFinite(p) ||
      p <= 0
    ) {

      return res.status(400).json({
        error:
          "Tên hoặc giá không hợp lệ."
      });
    }

    const cleanImage =
      typeof image === "string" &&
      image.startsWith("data:image/")
        ? image
        : null;

    const result =
      db.prepare(`
        INSERT INTO products
        (name,price,stock,image)
        VALUES(?,?,?,?)
      `).run(
        name.trim(),
        Math.floor(p),
        Number.isFinite(s)
          ? Math.max(
              0,
              Math.floor(s)
            )
          : 0,
        cleanImage
      );

    res.json({
      id:
        result.lastInsertRowid
    });
  }
);


/* ==================================================
   ADMIN - SỬA SẢN PHẨM
   ================================================== */

app.patch(
  "/api/admin/products/:id",
  requireAdmin,
  (req, res) => {

    const {
      name,
      price,
      stock,
      active,
      image
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

    const img =
      image === undefined
        ? null
        : (
            typeof image === "string" &&
            image.startsWith("data:image/")
              ? image
              : ""
          );

    if (
      p !== null &&
      (
        !Number.isFinite(p) ||
        p <= 0
      )
    ) {

      return res.status(400).json({
        error:
          "Giá không hợp lệ."
      });
    }

    if (
      s !== null &&
      (
        !Number.isFinite(s) ||
        s < 0
      )
    ) {

      return res.status(400).json({
        error:
          "Tồn kho không hợp lệ."
      });
    }

    db.prepare(`
      UPDATE products
      SET
        name=COALESCE(?,name),
        price=COALESCE(?,price),
        stock=COALESCE(?,stock),
        active=COALESCE(?,active),
        image=COALESCE(?,image)
      WHERE id=?
    `).run(
      name || null,

      p === null
        ? null
        : Math.floor(p),

      s === null
        ? null
        : Math.floor(s),

      a,

      img,

      Number(
        req.params.id
      )
    );

    res.json({
      ok: true
    });
  }
);


/* ==================================================
   ADMIN - DUYỆT CARD / BANK
   ==================================================

   Với CARD:
   Admin có thể nhập số tiền thực tế muốn cộng.

   Nếu không nhập:
   hệ thống tự dùng 84% mệnh giá
   (chiết khấu 16%).

   Ví dụ card 20.000:
   mặc định cộng 16.800.
   ================================================== */

app.post(
  "/api/admin/topups/:id/approve",
  requireAdmin,
  (req, res) => {

    const topup =
      db.prepare(`
        SELECT *
        FROM topups
        WHERE id=?
      `).get(
        Number(req.params.id)
      );

    if (
      !topup ||
      topup.status !== "PENDING"
    ) {

      return res.status(400).json({
        error:
          "Yêu cầu không hợp lệ hoặc đã xử lý."
      });
    }

    let credit;

    if (
      topup.method === "CARD"
    ) {

      const custom =
        Number(
          req.body?.creditedAmount
        );

      credit =
        Number.isFinite(custom) &&
        custom > 0
          ? Math.floor(custom)
          : Math.floor(
              topup.amount * 0.84
            );

    } else {

      credit =
        Math.floor(
          topup.amount
        );
    }

    if (
      !Number.isFinite(credit) ||
      credit <= 0
    ) {

      return res.status(400).json({
        error:
          "Số tiền cộng không hợp lệ."
      });
    }

    const transaction =
      db.transaction(() => {

        db.prepare(`
          UPDATE topups
          SET
            status='APPROVED',
            credited_amount=?
          WHERE id=?
        `).run(
          credit,
          topup.id
        );

        db.prepare(`
          UPDATE users
          SET balance=balance+?
          WHERE id=?
        `).run(
          credit,
          topup.user_id
        );
      });

    transaction();

    res.json({
      ok: true,
      creditedAmount:
        credit
    });
  }
);


/* ==================================================
   ADMIN - TỪ CHỐI CARD / BANK
   ================================================== */

app.post(
  "/api/admin/topups/:id/reject",
  requireAdmin,
  (req, res) => {

    const topup =
      db.prepare(`
        SELECT *
        FROM topups
        WHERE id=?
      `).get(
        Number(req.params.id)
      );

    if (
      !topup ||
      topup.status !== "PENDING"
    ) {

      return res.status(400).json({
        error:
          "Yêu cầu không hợp lệ hoặc đã xử lý."
      });
    }

    db.prepare(`
      UPDATE topups
      SET status='REJECTED'
      WHERE id=?
    `).run(
      topup.id
    );

    res.json({
      ok: true
    });
  }
);/* ==================================================
   ADMIN - ĐỔI TRẠNG THÁI ĐƠN
   ==================================================

   PENDING
   PROCESSING
   COMPLETED
   CANCELLED

   Nếu CANCELLED:
   - Hoàn tiền khách
   - Hoàn tồn kho
   - Chỉ hoàn một lần
   ================================================== */

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

    const newStatus =
      req.body?.status;

    if (
      !allowed.includes(
        newStatus
      )
    ) {

      return res.status(400).json({
        error:
          "Trạng thái không hợp lệ."
      });
    }

    const order =
      db.prepare(`
        SELECT *
        FROM orders
        WHERE id=?
      `).get(
        Number(req.params.id)
      );

    if (!order) {

      return res.status(404).json({
        error:
          "Không tìm thấy đơn."
      });
    }

    if (
      order.status ===
      newStatus
    ) {

      return res.json({
        ok: true
      });
    }

    if (
      newStatus ===
        "CANCELLED" &&
      order.status !==
        "CANCELLED"
    ) {

      const transaction =
        db.transaction(() => {

          db.prepare(`
            UPDATE orders
            SET status=?
            WHERE id=?
          `).run(
            "CANCELLED",
            order.id
          );

          db.prepare(`
            UPDATE users
            SET balance=balance+?
            WHERE id=?
          `).run(
            order.total,
            order.user_id
          );

          const items =
            db.prepare(`
              SELECT
                product_id,
                qty
              FROM order_items
              WHERE order_id=?
            `).all(
              order.id
            );

          for (
            const item of items
          ) {

            db.prepare(`
              UPDATE products
              SET stock=stock+?
              WHERE id=?
              AND stock>0
            `).run(
              item.qty,
              item.product_id
            );
          }
        });

      transaction();

    } else {

      db.prepare(`
        UPDATE orders
        SET status=?
        WHERE id=?
      `).run(
        newStatus,
        order.id
      );
    }

    res.json({
      ok: true,
      status:
        newStatus
    });
  }
);


/* ==================================================
   ADMIN - XÓA / ẨN SẢN PHẨM
   ================================================== */

app.post(
  "/api/admin/products/:id/hide",
  requireAdmin,
  (req, res) => {

    db.prepare(`
      UPDATE products
      SET active=0
      WHERE id=?
    `).run(
      Number(
        req.params.id
      )
    );

    res.json({
      ok: true
    });
  }
);


/* ==================================================
   ADMIN - HIỆN LẠI SẢN PHẨM
   ================================================== */

app.post(
  "/api/admin/products/:id/show",
  requireAdmin,
  (req, res) => {

    db.prepare(`
      UPDATE products
      SET active=1
      WHERE id=?
    `).run(
      Number(
        req.params.id
      )
    );

    res.json({
      ok: true
    });
  }
);


/* ==================================================
   TRANG SHOP
   ================================================== */

app.use(
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);


/* ==================================================
   START SERVER
   ================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `BLACK GAG2 SHOP running on port ${PORT}`
    );

    console.log(
      `Admin username: ${ADMIN_USERNAME}`
    );

  }
);
