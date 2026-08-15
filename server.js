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

function addColumnIfMissing(
  table,
  column,
  definition
){

  const columns =
    db.prepare(
      `PRAGMA table_info(${table})`
    ).all();

  if(
    !columns.some(
      x => x.name === column
    )
  ){

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

const count =
  db.prepare(
    "SELECT COUNT(*) c FROM products"
  ).get().c;


if(!count){

  const ins =
    db.prepare(`
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
  ].forEach(
    x => ins.run(...x)
  );

}


/* ==================================================
   TẠO ADMIN
================================================== */

function createAdmin(){

  const admin =
    db.prepare(`
      SELECT *
      FROM users
      WHERE username=?
    `).get(
      ADMIN_USERNAME
    );

  const hash =
    bcrypt.hashSync(
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
      "Đã tạo tài khoản Admin:",
      ADMIN_USERNAME
    );

  }else{

    if(admin.role !== "admin"){

      db.prepare(`
        UPDATE users
        SET role='admin'
        WHERE username=?
      `).run(
        ADMIN_USERNAME
      );

    }

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
    path.join(
      __dirname,
      "public"
    )
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
   LẤY USER
================================================== */

function getUser(req){

  const auth =
    req.headers.authorization || "";

  if(
    !auth.startsWith("Bearer ")
  ){

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

function requireUser(
  req,
  res,
  next
){

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

function requireAdmin(
  req,
  res,
  next
){

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

    const products =
      db.prepare(`
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
      String(
        username || ""
      ).trim();

    const cleanContact =
      String(
        contact || ""
      ).trim();

    const cleanPassword =
      String(
        password || ""
      );


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


    const exists =
      db.prepare(`
        SELECT id
        FROM users
        WHERE username=?
      `).get(
        cleanUsername
      );


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


    const result =
      db.prepare(`
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
      String(
        login || ""
      ).trim();

    const pass =
      String(
        password || ""
      );


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
      username: user.username,
      role: user.role,
      balance: user.balance
    });

  }
);


/*
