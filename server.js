```js
const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/* ==================================================
   DATABASE
   Trên Render:
   đặt biến môi trường DB_PATH nếu dùng Persistent Disk.
   Ví dụ:
   /var/data/black_gag2.db

   Nếu chưa đặt DB_PATH:
   dùng black_gag2.db trong project.
================================================== */

const DEFAULT_DB_PATH =
  path.join(__dirname, "black_gag2.db");

const DB_PATH =
  process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : DEFAULT_DB_PATH;

fs.mkdirSync(
  path.dirname(DB_PATH),
  {
    recursive: true
  }
);

let db;

try {
  db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");

  console.log(
    "Database:",
    DB_PATH
  );

} catch (error) {

  console.error(
    "Không mở được SQLite database:",
    error
  );

  process.exit(1);
}


/* ==================================================
   ADMIN
================================================== */

const ADMIN_USERNAME =
  "blackadmin";

const ADMIN_PASSWORD =
  "11102011tuankhoi";


/* ==================================================
   DATABASE TABLES
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
  active INTEGER NOT NULL DEFAULT 1,
  image TEXT
);

CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  game_username TEXT,
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
  credited_amount INTEGER,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);


/* ==================================================
   ADD COLUMN FOR OLD DATABASE
================================================== */

function addColumnIfMissing(
  table,
  column,
  definition
) {

  const columns =
    db
      .prepare(
        `PRAGMA table_info(${table})`
      )
      .all();

  const exists =
    columns.some(
      x => x.name === column
    );

  if (!exists) {

    db.exec(`
      ALTER TABLE ${table}
      ADD COLUMN ${column} ${definition}
    `);

    console.log(
      `Added column ${table}.${column}`
    );

  }
}


try {

  addColumnIfMissing(
    "products",
    "image",
    "TEXT"
  );

  addColumnIfMissing(
    "orders",
    "game_username",
    "TEXT"
  );

  addColumnIfMissing(
    "topups",
    "credited_amount",
    "INTEGER"
  );

  addColumnIfMissing(
    "topups",
    "reject_reason",
    "TEXT"
  );

} catch (error) {

  console.error(
    "Lỗi cập nhật database:",
    error
  );

  process.exit(1);
}


/* ==================================================
   DEFAULT PRODUCTS
================================================== */

const productCount =
  db
    .prepare(
      "SELECT COUNT(*) AS c FROM products"
    )
    .get()
    .c;

if (productCount === 0) {

  const insert =
    db.prepare(`
      INSERT INTO products
      (
        name,
        price,
        stock,
        active,
        image
      )
      VALUES (?, ?, ?, 1, NULL)
    `);

  const defaultProducts = [

    [
      "Dragon Breath Seed",
      4000,
      0
    ],

    [
      "Star Fruit",
      8000,
      0
    ],

    [
      "Sun Bloom",
      3000,
      0
    ],

    [
      "Super Watering",
      1000,
      0
    ],

    [
      "Super Sprinkler",
      1000,
      0
    ],

    [
      "Hypno Bloom",
      2000,
      0
    ],

    [
      "Moon Bloom",
      2000,
      0
    ],

    [
      "Mega Seed",
      1000,
      0
    ],

    [
      "Rainbow Seed",
      1000,
      0
    ]

  ];

  for (
    const product of defaultProducts
  ) {

    insert.run(
      ...product
    );

  }

}


/* ==================================================
   CREATE ADMIN
================================================== */

function createAdmin() {

  const hash =
    bcrypt.hashSync(
      ADMIN_PASSWORD,
      12
    );

  const admin =
    db
      .prepare(`
        SELECT id
        FROM users
        WHERE username=?
      `)
      .get(
        ADMIN_USERNAME
      );

  if (!admin) {

    db.prepare(`
      INSERT INTO users
      (
        username,
        contact,
        password_hash,
        role
      )
      VALUES (?, ?, ?, 'admin')
    `).run(
      ADMIN_USERNAME,
      "admin@black-gag2.local",
      hash
    );

    console.log(
      "Created admin:",
      ADMIN_USERNAME
    );

  } else {

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
   EXPRESS
================================================== */

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


/* ==================================================
   AUTH HELPERS
================================================== */

function createToken() {

  return crypto
    .randomBytes(32)
    .toString("hex");

}


function getUser(req) {

  const auth =
    req.headers.authorization || "";

  if (
    !auth.startsWith("Bearer ")
  ) {
    return null;
  }

  const token =
    auth
      .slice(7)
      .trim();

  if (!token) {
    return null;
  }

  const user =
    db
      .prepare(`
        SELECT
          u.*
        FROM sessions s
        JOIN users u
          ON u.id=s.user_id
        WHERE s.token=?
      `)
      .get(
        token
      );

  return user || null;
}


function requireUser(
  req,
  res,
  next
) {

  const user =
    getUser(req);

  if (!user) {

    return res
      .status(401)
      .json({
        error:
          "Đăng nhập trước."
      });

  }

  req.user =
    user;

  next();
}


function requireAdmin(
  req,
  res,
  next
) {

  const user =
    getUser(req);

  if (
    !user ||
    user.role !== "admin"
  ) {

    return res
      .status(403)
      .json({
        error:
          "Không có quyền Admin."
      });

  }

  req.user =
    user;

  next();
}


/* ==================================================
   PRODUCTS
================================================== */

app.get(
  "/api/products",
  (req, res) => {

    const products =
      db
        .prepare(`
          SELECT
            id,
            name,
            price,
            stock,
            active,
            image
          FROM products
          WHERE active=1
          ORDER BY id
        `)
        .all();

    res.json(
      products
    );

  }
);


/* ==================================================
   REGISTER
================================================== */

app.post(
  "/api/register",
  (req, res) => {

    const username =
      String(
        req.body?.username || ""
      ).trim();

    const contact =
      String(
        req.body?.contact || ""
      ).trim();

    const password =
      String(
        req.body?.password || ""
      );

    if (
      username.length < 3 ||
      !contact ||
      password.length < 6
    ) {

      return res
        .status(400)
        .json({
          error:
            "Vui lòng nhập đủ thông tin. Mật khẩu tối thiểu 6 ký tự."
        });

    }

    if (
      username.toLowerCase() ===
      ADMIN_USERNAME.toLowerCase()
    ) {

      return res
        .status(400)
        .json({
          error:
            "Tên đăng nhập này đã được sử dụng."
        });

    }

    const exists =
      db
        .prepare(`
          SELECT id
          FROM users
          WHERE username=?
        `)
        .get(
          username
        );

    if (exists) {

      return res
        .status(400)
        .json({
          error:
            "Tên đăng nhập đã tồn tại."
        });

    }

    const hash =
      bcrypt.hashSync(
        password,
        12
      );

    const result =
      db
        .prepare(`
          INSERT INTO users
          (
            username,
            contact,
            password_hash
          )
          VALUES (?, ?, ?)
        `)
        .run(
          username,
          contact,
          hash
        );

    const token =
      createToken();

    db.prepare(`
      INSERT INTO sessions
      (
        token,
        user_id
      )
      VALUES (?, ?)
    `).run(
      token,
      result.lastInsertRowid
    );

    res.json({
      token
    });

  }
);


/* ==================================================
   LOGIN
================================================== */

app.post(
  "/api/login",
  (req, res) => {

    const login =
      String(
        req.body?.login || ""
      ).trim();

    const password =
      String(
        req.body?.password || ""
      );

    const user =
      db
        .prepare(`
          SELECT *
          FROM users
          WHERE username=?
          OR contact=?
        `)
        .get(
          login,
          login
        );

    if (
      !user ||
      !bcrypt.compareSync(
        password,
        user.password_hash
      )
    ) {

      return res
        .status(401)
        .json({
          error:
            "Thông tin đăng nhập không đúng."
        });

    }

    const token =
      createToken();

    db.prepare(`
      INSERT INTO sessions
      (
        token,
        user_id
      )
      VALUES (?, ?)
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
      auth
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    db.prepare(`
      DELETE FROM sessions
      WHERE token=?
    `).run(
      token
    );

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   CREATE ORDER
================================================== */

app.post(
  "/api/orders",
  requireUser,
  (req, res) => {

    const items =
      Array.isArray(
        req.body?.items
      )
      ? req.body.items
      : [];

    const gameUsername =
      String(
        req.body?.gameUsername || ""
      ).trim();

    if (
      !gameUsername
    ) {

      return res
        .status(400)
        .json({
          error:
            "Vui lòng nhập tên tài khoản game."
        });

    }

    if (
      items.length === 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Giỏ hàng trống."
        });

    }

    let total = 0;

    const checked = [];


    for (
      const item of items
    ) {

      const product =
        db
          .prepare(`
            SELECT *
            FROM products
            WHERE id=?
            AND active=1
          `)
          .get(
            Number(
              item.productId
            )
          );

      const qty =
        Math.max(
          1,
          Math.floor(
            Number(
              item.qty
            ) || 1
          )
        );

      if (!product) {

        return res
          .status(400)
          .json({
            error:
              "Sản phẩm không tồn tại."
          });

      }

      if (
        product.stock > 0 &&
        product.stock < qty
      ) {

        return res
          .status(400)
          .json({
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
      req.user.balance < total
    ) {

      return res
        .status(400)
        .json({
          error:
            "Số dư không đủ."
        });

    }


    const transaction =
      db.transaction(() => {

        db.prepare(`
          UPDATE users
          SET
            balance=balance-?
          WHERE id=?
        `).run(
          total,
          req.user.id
        );

        const order =
          db
            .prepare(`
              INSERT INTO orders
              (
                user_id,
                total,
                status,
                game_username
              )
              VALUES(
                ?,
                ?,
                'PENDING',
                ?
              )
            `)
            .run(
              req.user.id,
              total,
              gameUsername
            );

        const insertItem =
          db.prepare(`
            INSERT INTO order_items
            (
              order_id,
              product_id,
              qty,
              unit_price
            )
            VALUES (?, ?, ?, ?)
          `);

        for (
          const item of checked
        ) {

          insertItem.run(
            order.lastInsertRowid,
            item.product.id,
            item.qty,
            item.product.price
          );

          if (
            item.product.stock > 0
          ) {

            db.prepare(`
              UPDATE products
              SET
                stock=stock-?
              WHERE id=?
            `).run(
              item.qty,
              item.product.id
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
   USER ORDER HISTORY
================================================== */

app.get(
  "/api/orders",
  requireUser,
  (req, res) => {

    const orders =
      db
        .prepare(`
          SELECT
            o.id,
            o.total,
            o.status,
            o.game_username,
            o.created_at
          FROM orders o
          WHERE o.user_id=?
          ORDER BY o.id DESC
        `)
        .all(
          req.user.id
        );

    const itemQuery =
      db.prepare(`
        SELECT
          oi.product_id,
          oi.qty,
          oi.unit_price,
          p.name,
          p.image
        FROM order_items oi
        JOIN products p
          ON p.id=oi.product_id
        WHERE oi.order_id=?
      `);

    const result =
      orders.map(
        order => ({

          ...order,

          items:
            itemQuery.all(
              order.id
            )

        })
      );

    res.json(
      result
    );

  }
);


/* ==================================================
   BANK INFO
   4 QR
================================================== */

app.get(
  "/api/bank-info",
  requireUser,
  (req, res) => {

    res.json({

      configured:
        true,

      minAmount:
        10000,

      bankName:
        process.env.BANK_NAME || "",

      account:
        process.env.BANK_ACCOUNT || "",

      accountName:
        process.env.BANK_ACCOUNT_NAME || "",

      qr: {

        10000:
          "/qr-10k.png",

        20000:
          "/qr-20k.png",

        50000:
          "/qr-50k.png",

        100000:
          "/qr-100k.png"

      }

    });

  }
);


/* ==================================================
   BANK TOPUP
================================================== */

app.post(
  "/api/topups/bank",
  requireUser,
  (req, res) => {

    const amount =
      Math.floor(
        Number(
          req.body?.amount
        ) || 0
      );

    const allowed = [
      10000,
      20000,
      50000,
      100000
    ];

    if (
      !allowed.includes(
        amount
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            "Mệnh giá Bank không hợp lệ."
        });

    }

    const result =
      db
        .prepare(`
          INSERT INTO topups
          (
            user_id,
            method,
            amount,
            status
          )
          VALUES(
            ?,
            'BANK',
            ?,
            'PENDING'
          )
        `)
        .run(
          req.user.id,
          amount
        );

    res.json({
      id:
        result.lastInsertRowid
    });

  }
);


/* ==================================================
   CARD TOPUP
================================================== */

app.post(
  "/api/topups/card",
  requireUser,
  (req, res) => {

    const provider =
      String(
        req.body?.provider || ""
      ).trim();

    const value =
      Math.floor(
        Number(
          req.body?.value
        ) || 0
      );

    const serial =
      String(
        req.body?.serial || ""
      ).trim();

    const code =
      String(
        req.body?.code || ""
      ).trim();

    if (
      !provider ||
      !value ||
      !serial ||
      !code
    ) {

      return res
        .status(400)
        .json({
          error:
            "Vui lòng nhập đầy đủ thông tin thẻ."
        });

    }

    const providerRef =
      JSON.stringify({
        provider,
        serial,
        code
      });

    const result =
      db
        .prepare(`
          INSERT INTO topups
          (
            user_id,
            method,
            amount,
            status,
            provider_ref
          )
          VALUES(
            ?,
            'CARD',
            ?,
            'PENDING',
            ?
          )
        `)
        .run(
          req.user.id,
          value,
          providerRef
        );

    res.json({
      id:
        result.lastInsertRowid
    });

  }
);


/* ==================================================
   TOPUP HISTORY
================================================== */

app.get(
  "/api/topups/history",
  requireUser,
  (req, res) => {

    const rows =
      db
        .prepare(`
          SELECT
            id,
            method,
            amount,
            status,
            credited_amount,
            reject_reason,
            created_at
          FROM topups
          WHERE user_id=?
          ORDER BY id DESC
        `)
        .all(
          req.user.id
        );

    res.json(
      rows
    );

  }
);


/* ==================================================
   ADMIN OVERVIEW
================================================== */

app.get(
  "/api/admin/overview",
  requireAdmin,
  (req, res) => {

    const users =
      db
        .prepare(`
          SELECT
            id,
            username,
            contact,
            balance,
            role,
            created_at
          FROM users
          ORDER BY id DESC
        `)
        .all();


    const products =
      db
        .prepare(`
          SELECT *
          FROM products
          ORDER BY id
        `)
        .all();


    const orders =
      db
        .prepare(`
          SELECT
            o.id,
            u.username,
            o.game_username,
            o.total,
            o.status,
            o.created_at
          FROM orders o
          JOIN users u
            ON u.id=o.user_id
          ORDER BY o.id DESC
        `)
        .all();


    const itemQuery =
      db.prepare(`
        SELECT
          oi.product_id,
          oi.qty,
          oi.unit_price,
          p.name
        FROM order_items oi
        JOIN products p
          ON p.id=oi.product_id
        WHERE oi.order_id=?
      `);


    for (
      const order of orders
    ) {

      order.items =
        itemQuery.all(
          order.id
        );

    }


    const topups =
      db
        .prepare(`
          SELECT
            t.id,
            u.username,
            u.contact,
            t.method,
            t.amount,
            t.credited_amount,
            t.status,
            t.provider_ref,
            t.reject_reason,
            t.created_at
          FROM topups t
          JOIN users u
            ON u.id=t.user_id
          ORDER BY t.id DESC
        `)
        .all();


    for (
      const topup of topups
    ) {

      if (
        topup.method === "CARD" &&
        topup.provider_ref
      ) {

        try {

          const data =
            JSON.parse(
              topup.provider_ref
            );

          topup.provider =
            data.provider || "";

          topup.serial =
            data.serial || "";

          topup.code =
            data.code || "";

        } catch {

          topup.provider =
            "";

          topup.serial =
            "";

          topup.code =
            "";

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
   ADMIN ADD PRODUCT
================================================== */

app.post(
  "/api/admin/products",
  requireAdmin,
  (req, res) => {

    const name =
      String(
        req.body?.name || ""
      ).trim();

    const price =
      Number(
        req.body?.price
      );

    const stock =
      Number(
        req.body?.stock
      );

    let image =
      null;


    if (
      typeof req.body?.image === "string" &&
      req.body.image.startsWith(
        "data:image/"
      )
    ) {

      image =
        req.body.image;

    }


    if (
      !name ||
      !Number.isFinite(
        price
      ) ||
      price <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Tên hoặc giá không hợp lệ."
        });

    }


    const result =
      db
        .prepare(`
          INSERT INTO products
          (
            name,
            price,
            stock,
            active,
            image
          )
          VALUES(
            ?,
            ?,
            ?,
            1,
            ?
          )
        `)
        .run(

          name,

          Math.floor(
            price
          ),

          Number.isFinite(
            stock
          )
          ? Math.max(
              0,
              Math.floor(
                stock
              )
            )
          : 0,

          image

        );


    res.json({

      ok: true,

      id:
        result.lastInsertRowid

    });

  }
);


/* ==================================================
   ADMIN EDIT PRODUCT
================================================== */

app.patch(
  "/api/admin/products/:id",
  requireAdmin,
  (req, res) => {

    const id =
      Number(
        req.params.id
      );

    const old =
      db
        .prepare(`
          SELECT *
          FROM products
          WHERE id=?
        `)
        .get(
          id
        );


    if (!old) {

      return res
        .status(404)
        .json({
          error:
            "Không tìm thấy sản phẩm."
        });

    }


    const name =
      req.body?.name === undefined
      ? old.name
      : String(
          req.body.name
        ).trim();


    const price =
      req.body?.price === undefined
      ? old.price
      : Number(
          req.body.price
        );


    const stock =
      req.body?.stock === undefined
      ? old.stock
      : Number(
          req.body.stock
        );


    const active =
      req.body?.active === undefined
      ? old.active
      : req.body.active
        ? 1
        : 0;


    let image =
      old.image || null;


    if (
      typeof req.body?.image === "string" &&
      req.body.image.startsWith(
        "data:image/"
      )
    ) {

      image =
        req.body.image;

    }


    if (
      !name ||
      !Number.isFinite(
        price
      ) ||
      price <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Tên hoặc giá không hợp lệ."
        });

    }


    if (
      !Number.isFinite(
        stock
      ) ||
      stock < 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Số lượng không hợp lệ."
        });

    }


    db.prepare(`
      UPDATE products
      SET
        name=?,
        price=?,
        stock=?,
        active=?,
        image=?
      WHERE id=?
    `).run(

      name,

      Math.floor(
        price
      ),

      Math.floor(
        stock
      ),

      active,

      image,

      id

    );


    res.json({

      ok: true,

      product:
        db
          .prepare(`
            SELECT *
            FROM products
            WHERE id=?
          `)
          .get(
            id
          )

    });

  }
);


/* ==================================================
   ADMIN REMOVE PRODUCT IMAGE
================================================== */

app.post(
  "/api/admin/products/:id/remove-image",
  requireAdmin,
  (req, res) => {

    db.prepare(`
      UPDATE products
      SET image=NULL
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
   ADMIN HIDE PRODUCT
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
   ADMIN SHOW PRODUCT
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
   ADMIN APPROVE TOPUP
   CARD = 84%
   BANK = 100%
================================================== */

app.post(
  "/api/admin/topups/:id/approve",
  requireAdmin,
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const topup =
      db
        .prepare(`
          SELECT *
          FROM topups
          WHERE id=?
        `)
        .get(
          id
        );


    if (
      !topup ||
      topup.status !== "PENDING"
    ) {

      return res
        .status(400)
        .json({
          error:
            "Yêu cầu không hợp lệ hoặc đã xử lý."
        });

    }


    const credit =
      topup.method === "CARD"
      ? Math.floor(
          topup.amount * 0.84
        )
      : Math.floor(
          topup.amount
        );


    const transaction =
      db.transaction(() => {

        const result =
          db
            .prepare(`
              UPDATE topups
              SET
                status='APPROVED',
                credited_amount=?,
                reject_reason=NULL
              WHERE id=?
              AND status='PENDING'
            `)
            .run(
              credit,
              id
            );


        if (
          result.changes === 0
        ) {

          throw new Error(
            "Yêu cầu đã được xử lý."
          );

        }


        db.prepare(`
          UPDATE users
          SET
            balance=balance+?
          WHERE id=?
        `).run(
          credit,
          topup.user_id
        );

      });


    try {

      transaction();

    } catch (error) {

      return res
        .status(400)
        .json({
          error:
            error.message
        });

    }


    res.json({

      ok: true,

      status:
        "APPROVED",

      creditedAmount:
        credit

    });

  }
);


/* ==================================================
   ADMIN REJECT TOPUP
================================================== */

app.post(
  "/api/admin/topups/:id/reject",
  requireAdmin,
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const topup =
      db
        .prepare(`
          SELECT *
          FROM topups
          WHERE id=?
        `)
        .get(
          id
        );


    if (
      !topup ||
      topup.status !== "PENDING"
    ) {

      return res
        .status(400)
        .json({
          error:
            "Yêu cầu không hợp lệ hoặc đã xử lý."
        });

    }


    const reason =
      String(
        req.body?.reason ||
        "Thẻ sai hoặc giao dịch không hợp lệ."
      ).trim();


    db.prepare(`
      UPDATE topups
      SET
        status='REJECTED',
        credited_amount=0,
        reject_reason=?
      WHERE id=?
      AND status='PENDING'
    `).run(
      reason,
      id
    );


    res.json({

      ok: true,

      status:
        "REJECTED",

      reason

    });

  }
);


/* ==================================================
   ADMIN ADD BALANCE
================================================== */

app.post(
  "/api/admin/users/add-balance",
  requireAdmin,
  (req, res) => {

    const username =
      String(
        req.body?.username || ""
      ).trim();


    const amount =
      Math.floor(
        Number(
          req.body?.amount
        ) || 0
      );


    if (
      !username ||
      amount <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Nhập đúng username và số tiền."
        });

    }


    const user =
      db
        .prepare(`
          SELECT
            id,
            username,
            balance,
            role
          FROM users
          WHERE username=?
        `)
        .get(
          username
        );


    if (!user) {

      return res
        .status(404)
        .json({
          error:
            "Không tìm thấy tài khoản user."
        });

    }


    if (
      user.role === "admin"
    ) {

      return res
        .status(400)
        .json({
          error:
            "Không thể cộng tiền trực tiếp cho Admin."
        });

    }


    db.prepare(`
      UPDATE users
      SET
        balance=balance+?
      WHERE id=?
    `).run(
      amount,
      user.id
    );


    const updated =
      db
        .prepare(`
          SELECT
            id,
            username,
            balance
          FROM users
          WHERE id=?
        `)
        .get(
          user.id
        );


    res.json({

      ok: true,

      username:
        updated.username,

      oldBalance:
        user.balance,

      added:
        amount,

      newBalance:
        updated.balance

    });

  }
);


/* ==================================================
   ADMIN REMOVE BALANCE
================================================== */

app.post(
  "/api/admin/users/remove-balance",
  requireAdmin,
  (req, res) => {

    const username =
      String(
        req.body?.username || ""
      ).trim();


    const amount =
      Math.floor(
        Number(
          req.body?.amount
        ) || 0
      );


    if (
      !username ||
      amount <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            "Nhập đúng username và số tiền."
        });

    }


    const user =
      db
        .prepare(`
          SELECT
            id,
            username,
            balance
          FROM users
          WHERE username=?
        `)
        .get(
          username
        );


    if (!user) {

      return res
        .status(404)
        .json({
          error:
            "Không tìm thấy tài khoản user."
        });

    }


    if (
      user.balance <
      amount
    ) {

      return res
        .status(400)
        .json({
          error:
            "Số dư user không đủ."
        });

    }


    db.prepare(`
      UPDATE users
      SET
        balance=balance-?
      WHERE id=?
    `).run(
      amount,
      user.id
    );


    const updated =
      db
        .prepare(`
          SELECT
            id,
            username,
            balance
          FROM users
          WHERE id=?
        `)
        .get(
          user.id
        );


    res.json({

      ok: true,

      username:
        updated.username,

      oldBalance:
        user.balance,

      removed:
        amount,

      newBalance:
        updated.balance

    });

  }
);


/* ==================================================
   ADMIN ORDER STATUS
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

      return res
        .status(400)
        .json({
          error:
            "Trạng thái không hợp lệ."
        });

    }


    const order =
      db
        .prepare(`
          SELECT *
          FROM orders
          WHERE id=?
        `)
        .get(
          Number(
            req.params.id
          )
        );


    if (!order) {

      return res
        .status(404)
        .json({
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
            SET
              status='CANCELLED'
            WHERE id=?
          `).run(
            order.id
          );


          db.prepare(`
            UPDATE users
            SET
              balance=balance+?
            WHERE id=?
          `).run(
            order.total,
            order.user_id
          );


          const items =
            db
              .prepare(`
                SELECT
                  product_id,
                  qty
                FROM order_items
                WHERE order_id=?
              `)
              .all(
                order.id
              );


          for (
            const item of items
          ) {

            db.prepare(`
              UPDATE products
              SET
                stock=stock+?
              WHERE id=?
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
        SET
          status=?
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
   HEALTH
================================================== */

app.get(
  "/api/health",
  (req, res) => {

    let users = 0;
    let products = 0;

    try {

      users =
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM users"
          )
          .get()
          .c;

      products =
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM products"
          )
          .get()
          .c;

    } catch (error) {

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });

    }


    res.json({

      ok: true,

      database:
        DB_PATH,

      users,

      products,

      time:
        new Date()
          .toISOString()

    });

  }
);


/* ==================================================
   FALLBACK
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
   SERVER START
================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "===================================="
    );

    console.log(
      "BLACK GAG2 SHOP"
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Database:",
      DB_PATH
    );

    console.log(
      "Admin:",
      ADMIN_USERNAME
    );

    console.log(
      "===================================="
    );

  }
);


/* ==================================================
   ERROR HANDLERS
================================================== */

process.on(
  "uncaughtException",
  error => {

    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );

  }
);

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "UNHANDLED REJECTION:",
      error
    );

  }
);
```
