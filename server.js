const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database("black_gag2.db");

/* ==================================================
   ADMIN
================================================== */

const ADMIN_USERNAME = "blackadmin";
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);


/* ==================================================
   THÊM CỘT CHO DATABASE CŨ
================================================== */

function addColumnIfMissing(table, column, definition){

  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  if(!columns.some(x => x.name === column)){

    db.exec(`
      ALTER TABLE ${table}
      ADD COLUMN ${column} ${definition}
    `);

  }

}

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


/* ==================================================
   SẢN PHẨM MẶC ĐỊNH
================================================== */

const productCount = db
  .prepare("SELECT COUNT(*) AS c FROM products")
  .get().c;

if(!productCount){

  const insertProduct = db.prepare(`
    INSERT INTO products
    (name, price, stock)
    VALUES (?, ?, ?)
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
  ].forEach(product => {
    insertProduct.run(...product);
  });

}


/* ==================================================
   TẠO ADMIN
================================================== */

function createAdmin(){

  const admin = db.prepare(`
    SELECT *
    FROM users
    WHERE username=?
  `).get(ADMIN_USERNAME);

  const hash = bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

  if(!admin){

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
      "Đã tạo Admin:",
      ADMIN_USERNAME
    );

  }else{

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

app.use(
  express.json({
    limit: "12mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "12mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* ==================================================
   TOKEN
================================================== */

function createToken(){

  return crypto
    .randomBytes(32)
    .toString("hex");

}


/* ==================================================
   GET USER
================================================== */

function getUser(req){

  const auth =
    req.headers.authorization || "";

  if(!auth.startsWith("Bearer ")){

    return null;

  }

  const token =
    auth.slice(7).trim();

  if(!token){

    return null;

  }

  return db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) || null;

}


/* ==================================================
   REQUIRE USER
================================================== */

function requireUser(req,res,next){

  const user =
    getUser(req);

  if(!user){

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

function requireAdmin(req,res,next){

  const user =
    getUser(req);

  if(
    !user ||
    user.role !== "admin"
  ){

    return res.status(403).json({
      error: "Không có quyền Admin."
    });

  }

  req.user = user;

  next();

}


/* ==================================================
   PRODUCTS
================================================== */

app.get(
  "/api/products",
  (req,res)=>{

    const products = db.prepare(`
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
    `).all();

    res.json(products);

  }
);


/* ==================================================
   REGISTER
================================================== */

app.post(
  "/api/register",
  (req,res)=>{

    const {
      username,
      contact,
      password
    } = req.body || {};

    const cleanUsername =
      String(username || "").trim();

    const cleanContact =
      String(contact || "").trim();

    const cleanPassword =
      String(password || "");

    if(
      cleanUsername.length < 3 ||
      !cleanContact ||
      cleanPassword.length < 6
    ){

      return res.status(400).json({
        error:
          "Vui lòng nhập đủ thông tin. Mật khẩu tối thiểu 6 ký tự."
      });

    }

    if(
      cleanUsername.toLowerCase() ===
      ADMIN_USERNAME.toLowerCase()
    ){

      return res.status(400).json({
        error:
          "Tên đăng nhập này đã được sử dụng."
      });

    }

    const exists = db.prepare(`
      SELECT id
      FROM users
      WHERE username=?
    `).get(cleanUsername);

    if(exists){

      return res.status(400).json({
        error:
          "Tên đăng nhập đã tồn tại."
      });

    }

    const hash =
      bcrypt.hashSync(
        cleanPassword,
        12
      );

    const result = db.prepare(`
      INSERT INTO users
      (
        username,
        contact,
        password_hash
      )
      VALUES (?, ?, ?)
    `).run(
      cleanUsername,
      cleanContact,
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
  (req,res)=>{

    const {
      login,
      password
    } = req.body || {};

    const value =
      String(login || "").trim();

    const pass =
      String(password || "");

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE username=?
      OR contact=?
    `).get(
      value,
      value
    );

    if(
      !user ||
      !bcrypt.compareSync(
        pass,
        user.password_hash
      )
    ){

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
      VALUES (?,?)
    `).run(
      token,
      user.id
    );

    res.json({
      token,
      username: user.username,
      role: user.role,
      balance: user.balance
    });

  }
);


/* ==================================================
   ME
================================================== */

app.get(
  "/api/me",
  requireUser,
  (req,res)=>{

    res.json({
      username: req.user.username,
      contact: req.user.contact,
      balance: req.user.balance,
      role: req.user.role
    });

  }
);


/* ==================================================
   LOGOUT
================================================== */

app.post(
  "/api/logout",
  requireUser,
  (req,res)=>{

    const auth =
      req.headers.authorization || "";

    const token =
      auth.replace("Bearer ", "").trim();

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
   ORDERS
================================================== */

app.post(
  "/api/orders",
  requireUser,
  (req,res)=>{

    const items =
      Array.isArray(req.body?.items)
        ? req.body.items
        : [];

    const gameUsername =
      String(
        req.body?.gameUsername || ""
      ).trim();

    if(!gameUsername){

      return res.status(400).json({
        error:
          "Vui lòng nhập tên tài khoản game."
      });

    }

    if(!items.length){

      return res.status(400).json({
        error:
          "Giỏ hàng trống."
      });

    }

    let total = 0;

    const checked = [];

    for(const item of items){

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

      if(!product){

        return res.status(400).json({
          error:
            "Sản phẩm không tồn tại."
        });

      }

      if(
        product.stock > 0 &&
        product.stock < qty
      ){

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

    if(
      req.user.balance < total
    ){

      return res.status(400).json({
        error:
          "Số dư không đủ."
      });

    }

    const transaction =
      db.transaction(()=>{

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
            (
              user_id,
              total,
              status,
              game_username
            )
            VALUES (
              ?,
              ?,
              'PENDING',
              ?
            )
          `).run(
            req.user.id,
            total,
            gameUsername
          );

        const itemInsert =
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

        for(const x of checked){

          itemInsert.run(
            order.lastInsertRowid,
            x.product.id,
            x.qty,
            x.product.price
          );

          if(x.product.stock > 0){

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
   GET ORDERS
================================================== */

app.get(
  "/api/orders",
  requireUser,
  (req,res)=>{

    const orders =
      db.prepare(`
        SELECT
          o.id,
          o.total,
          o.status,
          o.game_username,
          o.created_at
        FROM orders o
        WHERE o.user_id=?
        ORDER BY o.id DESC
      `).all(
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
      orders.map(order => ({

        ...order,

        items:
          itemQuery.all(order.id)

      }));

    res.json(result);

  }
);


/* ==================================================
   BANK INFO
================================================== */

app.get(
  "/api/bank-info",
  requireUser,
  (req,res)=>{

    res.json({

      configured: true,

      minAmount: 10000,

      account:
        process.env.BANK_ACCOUNT || "",

      accountName:
        process.env.BANK_ACCOUNT_NAME || "",

      qrUrl:
        process.env.BANK_QR_URL || ""

    });

  }
);


/* ==================================================
   TOPUP BANK
================================================== */

app.post(
  "/api/topups/bank",
  requireUser,
  (req,res)=>{

    const amount =
      Math.floor(
        Number(
          req.body?.amount
        ) || 0
      );

    if(amount < 10000){

      return res.status(400).json({
        error:
          "Số tiền nạp tối thiểu là 10.000đ."
      });

    }

    const result =
      db.prepare(`
        INSERT INTO topups
        (
          user_id,
          method,
          amount,
          status
        )
        VALUES (
          ?,
          'BANK',
          ?,
          'PENDING'
        )
      `).run(
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
   TOPUP CARD
================================================== */

app.post(
  "/api/topups/card",
  requireUser,
  (req,res)=>{

    const {
      provider,
      value,
      serial,
      code
    } = req.body || {};

    const amount =
      Math.floor(
        Number(value) || 0
      );

    const cleanProvider =
      String(provider || "").trim();

    const cleanSerial =
      String(serial || "").trim();

    const cleanCode =
      String(code || "").trim();

    if(
      !cleanProvider ||
      !cleanSerial ||
      !cleanCode ||
      !amount
    ){

      return res.status(400).json({
        error:
          "Vui lòng nhập đầy đủ thông tin thẻ."
      });

    }

    const providerRef =
      JSON.stringify({
        provider: cleanProvider,
        serial: cleanSerial,
        code: cleanCode
      });

    const result =
      db.prepare(`
        INSERT INTO topups
        (
          user_id,
          method,
          amount,
          status,
          provider_ref
        )
        VALUES (
          ?,
          'CARD',
          ?,
          'PENDING',
          ?
        )
      `).run(
        req.user.id,
        amount,
        providerRef
      );

    res.json({
      id:
        result.lastInsertRowid
    });

  }
);


/* ==================================================
   ADMIN OVERVIEW
================================================== */

app.get(
  "/api/admin/overview",
  requireAdmin,
  (req,res)=>{

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
          o.game_username,
          o.total,
          o.status,
          o.created_at
        FROM orders o
        JOIN users u
          ON u.id=o.user_id
        ORDER BY o.id DESC
      `).all();

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

    for(const order of orders){

      order.items =
        itemQuery.all(order.id);

    }

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

    for(const topup of topups){

      if(
        topup.method === "CARD" &&
        topup.provider_ref
      ){

        try{

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

        }catch{

          const parts =
            String(
              topup.provider_ref
            ).split("|");

          topup.provider =
            parts[0] || "";

          topup.serial =
            parts[1] || "";

          topup.code =
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
   ADMIN THÊM SẢN PHẨM
================================================== */

app.post(
  "/api/admin/products",
  requireAdmin,
  (req,res)=>{

    const {
      name,
      price,
      stock,
      image
    } = req.body || {};

    const cleanName =
      String(name || "").trim();

    const p =
      Number(price);

    const s =
      Number(stock);

    if(
      !cleanName ||
      !Number.isFinite(p) ||
      p <= 0
    ){

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
        (
          name,
          price,
          stock,
          active,
          image
        )
        VALUES (?, ?, ?, 1, ?)
      `).run(
        cleanName,
        Math.floor(p),
        Number.isFinite(s)
          ? Math.max(0, Math.floor(s))
          : 0,
        cleanImage
      );

    res.json({
      ok: true,
      id:
        result.lastInsertRowid
    });

  }
);


/* ==================================================
   ADMIN SỬA SẢN PHẨM
================================================== */

app.patch(
  "/api/admin/products/:id",
  requireAdmin,
  (req,res)=>{

    const id =
      Number(req.params.id);

    const old =
      db.prepare(`
        SELECT *
        FROM products
        WHERE id=?
      `).get(id);

    if(!old){

      return res.status(404).json({
        error:
          "Không tìm thấy sản phẩm."
      });

    }

    const {
      name,
      price,
      stock,
      active,
      image
    } = req.body || {};

    const cleanName =
      name === undefined
        ? old.name
        : String(name).trim();

    const p =
      price === undefined
        ? old.price
        : Number(price);

    const s =
      stock === undefined
        ? old.stock
        : Number(stock);

    const a =
      active === undefined
        ? old.active
        : active
          ? 1
          : 0;

    let finalImage =
      old.image || null;

    if(
      typeof image === "string" &&
      image.startsWith("data:image/")
    ){

      finalImage = image;

    }

    if(
      !cleanName ||
      !Number.isFinite(p) ||
      p <= 0
    ){

      return res.status(400).json({
        error:
          "Tên hoặc giá không hợp lệ."
      });

    }

    if(
      !Number.isFinite(s) ||
      s < 0
    ){

      return res.status(400).json({
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
      cleanName,
      Math.floor(p),
      Math.floor(s),
      a,
      finalImage,
      id
    );

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   ADMIN XÓA ẢNH SẢN PHẨM
================================================== */

app.post(
  "/api/admin/products/:id/remove-image",
  requireAdmin,
  (req,res)=>{

    const id =
      Number(req.params.id);

    db.prepare(`
      UPDATE products
      SET image=NULL
      WHERE id=?
    `).run(id);

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   ADMIN HIDE
================================================== */

app.post(
  "/api/admin/products/:id/hide",
  requireAdmin,
  (req,res)=>{

    db.prepare(`
      UPDATE products
      SET active=0
      WHERE id=?
    `).run(
      Number(req.params.id)
    );

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   ADMIN SHOW
================================================== */

app.post(
  "/api/admin/products/:id/show",
  requireAdmin,
  (req,res)=>{

    db.prepare(`
      UPDATE products
      SET active=1
      WHERE id=?
    `).run(
      Number(req.params.id)
    );

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   ADMIN APPROVE TOPUP
================================================== */

app.post(
  "/api/admin/topups/:id/approve",
  requireAdmin,
  (req,res)=>{

    const id =
      Number(req.params.id);

    const topup =
      db.prepare(`
        SELECT *
        FROM topups
        WHERE id=?
      `).get(id);

    if(
      !topup ||
      topup.status !== "PENDING"
    ){

      return res.status(400).json({
        error:
          "Yêu cầu không hợp lệ hoặc đã xử lý."
      });

    }

    let credit;

    if(topup.method === "CARD"){

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

    }else{

      credit =
        Math.floor(topup.amount);

    }

    if(
      !Number.isFinite(credit) ||
      credit <= 0
    ){

      return res.status(400).json({
        error:
          "Số tiền cộng không hợp lệ."
      });

    }

    const transaction =
      db.transaction(()=>{

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
      creditedAmount: credit
    });

  }
);


/* ==================================================
   ADMIN REJECT TOPUP
================================================== */

app.post(
  "/api/admin/topups/:id/reject",
  requireAdmin,
  (req,res)=>{

    const topup =
      db.prepare(`
        SELECT *
        FROM topups
        WHERE id=?
      `).get(
        Number(req.params.id)
      );

    if(
      !topup ||
      topup.status !== "PENDING"
    ){

      return res.status(400).json({
        error:
          "Yêu cầu không hợp lệ hoặc đã xử lý."
      });

    }

    db.prepare(`
      UPDATE topups
      SET status='REJECTED'
      WHERE id=?
    `).run(topup.id);

    res.json({
      ok: true
    });

  }
);


/* ==================================================
   ADMIN ORDER STATUS
================================================== */

app.post(
  "/api/admin/orders/:id/status",
  requireAdmin,
  (req,res)=>{

    const allowed = [
      "PENDING",
      "PROCESSING",
      "COMPLETED",
      "CANCELLED"
    ];

    const newStatus =
      req.body?.status;

    if(
      !allowed.includes(newStatus)
    ){

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

    if(!order){

      return res.status(404).json({
        error:
          "Không tìm thấy đơn."
      });

    }

    if(
      order.status === newStatus
    ){

      return res.json({
        ok: true
      });

    }

    if(
      newStatus === "CANCELLED" &&
      order.status !== "CANCELLED"
    ){

      const transaction =
        db.transaction(()=>{

          db.prepare(`
            UPDATE orders
            SET status='CANCELLED'
            WHERE id=?
          `).run(order.id);

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
            `).all(order.id);

          for(const item of items){

            db.prepare(`
              UPDATE products
              SET stock=stock+?
              WHERE id=?
            `).run(
              item.qty,
              item.product_id
            );

          }

        });

      transaction();

    }else{

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
      status: newStatus
    });

  }
);


/* ==================================================
   TRANG SHOP
================================================== */

app.use(
  (req,res)=>{

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
  ()=>{

    console.log(
      `BLACK GAG2 SHOP running on port ${PORT}`
    );

    console.log(
      `Admin username: ${ADMIN_USERNAME}`
    );

  }
);
