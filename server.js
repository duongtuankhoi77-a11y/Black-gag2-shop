const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;


// =========================
// DATABASE
// =========================

// Render Free không dùng được /data
const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "black_gag2.db");

console.log("Database:", DB_PATH);

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


// =========================
// TABLES
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    contact TEXT NOT NULL,
    password TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    bank_price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    image TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    amount INTEGER NOT NULL,
    provider TEXT DEFAULT '',
    serial TEXT DEFAULT '',
    code TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
`);// =========================
// DEFAULT PRODUCTS
// =========================

const productCount = db
  .prepare("SELECT COUNT(*) AS count FROM products")
  .get().count;


if (productCount === 0) {

  const insert = db.prepare(`
    INSERT INTO products
    (name, price, bank_price, stock, image, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);


  const products = [
    ["Dragon Breath Seed",4000,4000,0,"",""],
    ["Star Fruit",8000,8000,0,"",""],
    ["Sun Bloom",3000,3000,0,"",""],
    ["Super Watering",1000,1000,0,"",""],
    ["Super Sprinkler",1000,1000,0,"",""],
    ["Hypno Bloom",2000,2000,0,"",""],
    ["Moon Bloom",2000,2000,0,"",""],
    ["Mega Seed",1000,1000,0,"",""],
    ["Rainbow Seed",1000,1000,0,"",""]
  ];


  const insertAll = db.transaction(()=>{

    for(const p of products){
      insert.run(...p);
    }

  });


  insertAll();

}



// =========================
// EXPRESS
// =========================

app.use(express.json({
  limit:"2mb"
}));

app.use(express.urlencoded({
  extended:true
}));

app.use(express.static(
  path.join(__dirname,"public")
));



// =========================
// HELPERS
// =========================

function hashPassword(password){

  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");

}


function createToken(){

  return crypto
    .randomBytes(32)
    .toString("hex");

}


function getUserFromToken(token){

  if(!token) return null;


  return db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users
    ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);

}



function auth(req,res,next){

  const token = req.headers.authorization?.replace("Bearer ","");

  const user = getUserFromToken(token);


  if(!user){

    return res.status(401).json({
      success:false,
      message:"Bạn chưa đăng nhập"
    });

  }


  req.user=user;
  req.token=token;

  next();

}



function adminAuth(req,res,next){

  const token = req.headers.authorization?.replace("Bearer ","");

  const user = getUserFromToken(token);


  if(!user || user.username !== process.env.ADMIN_USERNAME){

    return res.status(403).json({
      success:false,
      message:"Không có quyền admin"
    });

  }


  req.user=user;
  req.token=token;

  next();

}



// =========================
// HEALTH
// =========================

app.get("/api/health",(req,res)=>{

  res.json({
    success:true,
    status:"online",
    database:DB_PATH
  });

});



// =========================
// PRODUCTS
// =========================

app.get("/api/products",(req,res)=>{

  const products = db.prepare(`
    SELECT *
    FROM products
    ORDER BY id ASC
  `).all();


  res.json({
    success:true,
    products
  });

});



// =========================
// REGISTER
// =========================

app.post("/api/register",(req,res)=>{

try{

const {
username,
contact,
password
}=req.body;


if(!username || !contact || !password){

return res.status(400).json({
success:false,
message:"Vui lòng nhập đầy đủ thông tin"
});

}



const old = db.prepare(`
SELECT id FROM users WHERE username=?
`).get(username);



if(old){

return res.status(400).json({
success:false,
message:"Tên tài khoản đã tồn tại"
});

}



const result = db.prepare(`
INSERT INTO users
(username,contact,password,balance)
VALUES (?,?,?,0)
`).run(
username,
contact,
hashPassword(password)
);



const token=createToken();



db.prepare(`
INSERT INTO sessions
(token,user_id)
VALUES (?,?)
`).run(
token,
result.lastInsertRowid
);



res.json({

success:true,

token,

user:{
id:result.lastInsertRowid,
username,
contact,
balance:0
}

});


}catch(e){

console.log(e);

res.status(500).json({
success:false,
message:"Lỗi server"
});

}


});



// =========================
// LOGIN
// =========================

app.post("/api/login",(req,res)=>{


const {
username,
password
}=req.body;



const user=db.prepare(`
SELECT *
FROM users
WHERE username=?
`).get(username);



if(!user || user.password!==hashPassword(password)){

return res.status(401).json({

success:false,

message:"Sai tài khoản hoặc mật khẩu"

});

}



const token=createToken();



db.prepare(`
INSERT INTO sessions
(token,user_id)
VALUES (?,?)
`).run(
token,
user.id
);



res.json({

success:true,

token,

user:{
id:user.id,
username:user.username,
contact:user.contact,
balance:user.balance
}

});


});// =========================
// CURRENT USER
// =========================

app.get("/api/me", auth, (req,res)=>{

  res.json({
    success:true,
    user:{
      id:req.user.id,
      username:req.user.username,
      contact:req.user.contact,
      balance:req.user.balance,
      created_at:req.user.created_at
    }
  });

});


// =========================
// LOGOUT
// =========================

app.post("/api/logout", auth, (req,res)=>{

  db.prepare(`
    DELETE FROM sessions
    WHERE token=?
  `).run(req.token);


  res.json({
    success:true,
    message:"Đã đăng xuất"
  });

});


// =========================
// TOPUP CARD
// =========================

app.post("/api/topups/card", auth, (req,res)=>{

  const {
    provider,
    value,
    serial,
    code
  } = req.body;


  if(!provider || !value || !serial || !code){

    return res.status(400).json({
      success:false,
      message:"Thiếu thông tin thẻ"
    });

  }


  const result=db.prepare(`
    INSERT INTO topups
    (user_id,method,amount,provider,serial,code,status)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    req.user.id,
    "CARD",
    Number(value),
    provider,
    serial,
    code,
    "pending"
  );


  res.json({
    success:true,
    message:"Đã gửi thẻ chờ duyệt",
    topup_id:result.lastInsertRowid
  });


});


// =========================
// TOPUP BANK
// =========================

app.post("/api/topups/bank", auth, (req,res)=>{

  const amount=Number(req.body.amount);


  if(!Number.isFinite(amount) || amount < 10000){

    return res.status(400).json({
      success:false,
      message:"Nạp bank tối thiểu 10.000đ"
    });

  }


  const result=db.prepare(`
    INSERT INTO topups
    (user_id,method,amount,status)
    VALUES (?,?,?,'pending')
  `).run(
    req.user.id,
    "BANK",
    amount
  );


  res.json({
    success:true,
    message:"Đã tạo yêu cầu nạp bank",
    topup_id:result.lastInsertRowid,
    amount
  });


});


// =========================
// USER ORDERS
// =========================

app.get("/api/orders", auth, (req,res)=>{

  const orders=db.prepare(`
    SELECT *
    FROM orders
    WHERE user_id=?
    ORDER BY id DESC
  `).all(req.user.id);


  res.json({
    success:true,
    orders
  });

});


// =========================
// CREATE ORDER
// =========================

app.post("/api/orders", auth, (req,res)=>{

try{


const {items}=req.body;


if(!Array.isArray(items)||items.length===0){

return res.status(400).json({
success:false,
message:"Giỏ hàng trống"
});

}



const transaction=db.transaction(()=>{


let total=0;
const checked=[];



for(const item of items){


const product=db.prepare(`
SELECT *
FROM products
WHERE id=?
`).get(item.product_id);



if(!product){

throw new Error("Không có sản phẩm");

}



const quantity=Number(item.quantity);



if(quantity<=0){

throw new Error("Số lượng không hợp lệ");

}



if(product.stock<quantity){

throw new Error("Không đủ hàng");

}



total += product.price*quantity;


checked.push({
product,
quantity
});


}



const user=db.prepare(`
SELECT *
FROM users
WHERE id=?
`).get(req.user.id);



if(user.balance<total){

throw new Error("Không đủ số dư");

}



const order=db.prepare(`
INSERT INTO orders
(user_id,total,status)
VALUES(?,?,?)
`).run(
user.id,
total,
"completed"
);



const addItem=db.prepare(`
INSERT INTO order_items
(order_id,product_id,quantity,price)
VALUES(?,?,?,?)
`);



for(const item of checked){


addItem.run(
order.lastInsertRowid,
item.product.id,
item.quantity,
item.product.price
);



db.prepare(`
UPDATE products
SET stock=stock-?
WHERE id=?
`).run(
item.quantity,
item.product.id
);


}



db.prepare(`
UPDATE users
SET balance=balance-?
WHERE id=?
`).run(
total,
user.id
);



return order.lastInsertRowid;



})();



res.json({
success:true,
message:"Mua hàng thành công",
order_id:transaction
});



}catch(e){

res.status(400).json({
success:false,
message:e.message
});

}


});
