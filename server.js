// ===============================
// BLACK GAG2 SHOP SERVER
// ===============================

const express = require("express");
const sqlite3 = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({limit:"10mb"}));
app.use(express.static("public"));

// ===============================
// DATABASE
// ===============================

const db = new sqlite3("black_gag2.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE,
 contact TEXT,
 password TEXT,
 balance INTEGER DEFAULT 0,
 role TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS sessions(
 token TEXT PRIMARY KEY,
 user_id INTEGER
);

CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 price INTEGER,
 stock INTEGER DEFAULT 0,
 image TEXT,
 active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 total INTEGER,
 game_username TEXT,
 status TEXT DEFAULT 'PENDING',
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER,
 product_id INTEGER,
 qty INTEGER
);

CREATE TABLE IF NOT EXISTS topups(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 method TEXT,
 amount INTEGER,
 provider TEXT,
 serial TEXT,
 code TEXT,
 status TEXT DEFAULT 'PENDING',
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);


// ===============================
// TẠO ADMIN
// ===============================

const admin = db.prepare(
"SELECT * FROM users WHERE username=?"
).get("blackadmin");


if(!admin){

 db.prepare(`
 INSERT INTO users
(username,contact,password,role)
VALUES(?,?,?,?)
 `).run(
 "blackadmin",
 "admin",
 "tuankhoi123",
 "admin"
 );

 console.log("Created admin: blackadmin / tuankhoi123");

}


// ===============================
// TẠO SẢN PHẨM MẶC ĐỊNH
// ===============================

const count = db.prepare(
"SELECT COUNT(*) as c FROM products"
).get().c;


if(count===0){

const items=[
["Dragon Breath Seed",4000],
["Star Fruit",8000],
["Sun Bloom",3000],
["Super Watering",1000],
["Super Sprinkler",1000],
["Hypno Bloom",2000],
["Moon Bloom",2000],
["Mega Seed",1000],
["Rainbow Seed",1000]
];


for(const p of items){

db.prepare(`
INSERT INTO products(name,price)
VALUES(?,?)
`).run(
p[0],
p[1]
);

}

}


// ===============================
// AUTH
// ===============================

function auth(req,res,next){

const token=req.headers.authorization?.replace(
"Bearer ",
""
);

if(!token)
return res.status(401).json({
error:"Chưa đăng nhập"
});


const session=db.prepare(`
SELECT users.*
FROM sessions
JOIN users
ON users.id=sessions.user_id
WHERE token=?
`).get(token);


if(!session)
return res.status(401).json({
error:"Token sai"
});


req.user=session;

next();

}// ===============================
// REGISTER
// ===============================

app.post("/api/register",(req,res)=>{

const {username,contact,password}=req.body;

if(!username||!password)
return res.status(400).json({
error:"Thiếu thông tin"
});


try{

const result=db.prepare(`
INSERT INTO users(username,contact,password)
VALUES(?,?,?)
`).run(
username,
contact||"",
password
);


const token=crypto.randomBytes(32).toString("hex");


db.prepare(`
INSERT INTO sessions(token,user_id)
VALUES(?,?)
`).run(
token,
result.lastInsertRowid
);


res.json({
token
});


}catch(e){

res.status(400).json({
error:"Tên tài khoản đã tồn tại"
});

}

});



// ===============================
// LOGIN
// ===============================

app.post("/api/login",(req,res)=>{

const {login,password}=req.body;


const user=db.prepare(`
SELECT *
FROM users
WHERE username=? OR contact=?
`).get(
login,
login
);


if(!user || user.password!==password){

return res.status(401).json({
error:"Sai tài khoản hoặc mật khẩu"
});

}


const token=crypto.randomBytes(32).toString("hex");


db.prepare(`
INSERT INTO sessions(token,user_id)
VALUES(?,?)
`).run(
token,
user.id
);


res.json({
token
});


});



// ===============================
// ME
// ===============================

app.get("/api/me",auth,(req,res)=>{

res.json(req.user);

});



// ===============================
// LOGOUT
// ===============================

app.post("/api/logout",auth,(req,res)=>{

const token=req.headers.authorization.replace(
"Bearer ",
""
);


db.prepare(`
DELETE FROM sessions WHERE token=?
`).run(token);


res.json({
ok:true
});

});



// ===============================
// PRODUCTS
// ===============================

app.get("/api/products",(req,res)=>{

const products=db.prepare(`
SELECT *
FROM products
WHERE active=1
`).all();


res.json(products);

});



// ===============================
// BUY PRODUCT
// ===============================

app.post("/api/orders",auth,(req,res)=>{


const {
items,
gameUsername
}=req.body;


let total=0;


for(const item of items){

const p=db.prepare(`
SELECT *
FROM products
WHERE id=?
`).get(item.productId);


if(!p)
return res.status(400).json({
error:"Không có sản phẩm"
});


total += p.price * item.qty;

}



if(req.user.balance < total){

return res.status(400).json({
error:"Không đủ tiền"
});

}



const order=db.prepare(`
INSERT INTO orders
(user_id,total,game_username)
VALUES(?,?,?)
`).run(
req.user.id,
total,
gameUsername
);



for(const item of items){

db.prepare(`
INSERT INTO order_items
(order_id,product_id,qty)
VALUES(?,?,?)
`).run(
order.lastInsertRowid,
item.productId,
item.qty
);


}



db.prepare(`
UPDATE users
SET balance=balance-?
WHERE id=?
`).run(
total,
req.user.id
);



res.json({
orderId:order.lastInsertRowid
});


});



// ===============================
// HISTORY ORDER
// ===============================

app.get("/api/orders",auth,(req,res)=>{


const orders=db.prepare(`
SELECT *
FROM orders
WHERE user_id=?
ORDER BY id DESC
`).all(
req.user.id
);


res.json(orders);


});// ===============================
// TOPUP CARD
// ===============================

app.post("/api/topups/card",auth,(req,res)=>{

const {
provider,
value,
serial,
code
}=req.body;


if(!value||!serial||!code)
return res.status(400).json({
error:"Thiếu thông tin thẻ"
});


db.prepare(`
INSERT INTO topups
(user_id,method,amount,provider,serial,code)
VALUES(?,?,?,?,?,?)
`).run(
req.user.id,
"CARD",
value,
provider,
serial,
code
);


res.json({
ok:true
});


});



// ===============================
// TOPUP BANK
// ===============================

app.post("/api/topups/bank",auth,(req,res)=>{


const amount=Number(req.body.amount);


if(amount<10000)
return res.status(400).json({
error:"Nạp tối thiểu 10.000đ"
});


db.prepare(`
INSERT INTO topups
(user_id,method,amount)
VALUES(?,?,?)
`).run(
req.user.id,
"BANK",
amount
);


res.json({
ok:true
});


});



// ===============================
// TOPUP HISTORY
// ===============================

app.get("/api/topups/history",auth,(req,res)=>{


const data=db.prepare(`
SELECT *
FROM topups
WHERE user_id=?
ORDER BY id DESC
`).all(
req.user.id
);


res.json(data);


});



// ===============================
// BANK INFO QR
// ===============================

app.get("/api/bank-info",(req,res)=>{


res.json({

bankName:"MB Bank",

account:"0123456789",

accountName:"BLACK GAG2 SHOP",

qr:{

10000:"",
20000:"",
50000:"",
100000:""

}

});


});



// ===============================
// ADMIN CHECK
// ===============================

function adminOnly(req,res,next){

if(req.user.role!=="admin"){

return res.status(403).json({
error:"Không có quyền"
});

}

next();

}



// ===============================
// ADMIN OVERVIEW
// ===============================

app.get("/api/admin/overview",
auth,
adminOnly,
(req,res)=>{


res.json({

users:db.prepare(`
SELECT id,username,contact,balance
FROM users
`).all(),


products:db.prepare(`
SELECT *
FROM products
`).all(),


topups:db.prepare(`
SELECT topups.*,users.username
FROM topups
JOIN users
ON users.id=topups.user_id
ORDER BY topups.id DESC
`).all(),


orders:db.prepare(`
SELECT orders.*,users.username
FROM orders
JOIN users
ON users.id=orders.user_id
ORDER BY orders.id DESC
`).all()


});


});



// ===============================
// ADMIN ADD BALANCE
// ===============================

app.post("/api/admin/users/add-balance",
auth,
adminOnly,
(req,res)=>{


const {
username,
amount
}=req.body;


db.prepare(`
UPDATE users
SET balance=balance+?
WHERE username=?
`).run(
amount,
username
);


res.json({
added:amount
});


}); 
// ===============================
// ADMIN APPROVE TOPUP
// ===============================

app.post("/api/admin/topups/:id/approve",
auth,
adminOnly,
(req,res)=>{


const id=req.params.id;


const topup=db.prepare(`
SELECT *
FROM topups
WHERE id=?
`).get(id);


if(!topup)
return res.status(404).json({
error:"Không tìm thấy"
});


db.prepare(`
UPDATE topups
SET status='APPROVED'
WHERE id=?
`).run(id);



db.prepare(`
UPDATE users
SET balance=balance+?
WHERE id=?
`).run(
topup.amount,
topup.user_id
);



res.json({
ok:true,
creditedAmount:topup.amount
});


});



// ===============================
// ADMIN REJECT TOPUP
// ===============================

app.post("/api/admin/topups/:id/reject",
auth,
adminOnly,
(req,res)=>{


db.prepare(`
UPDATE topups
SET status='REJECTED'
WHERE id=?
`).run(
req.params.id
);


res.json({
ok:true
});


});



// ===============================
// ADMIN ADD PRODUCT
// ===============================

app.post("/api/admin/products",
auth,
adminOnly,
(req,res)=>{


const {
name,
price,
stock,
image
}=req.body;


db.prepare(`
INSERT INTO products
(name,price,stock,image)
VALUES(?,?,?,?)
`).run(
name,
price,
stock||0,
image||""
);


res.json({
ok:true
});


});



// ===============================
// ADMIN UPDATE PRODUCT
// ===============================

app.patch("/api/admin/products/:id",
auth,
adminOnly,
(req,res)=>{


const {
name,
price,
stock,
image
}=req.body;


db.prepare(`
UPDATE products
SET name=?,
price=?,
stock=?,
image=COALESCE(?,image)
WHERE id=?
`).run(
name,
price,
stock,
image||null,
req.params.id
);



res.json({
ok:true
});


});



// ===============================
// ADMIN DELETE/HIDE PRODUCT
// ===============================

app.post("/api/admin/products/:id/hide",
auth,
adminOnly,
(req,res)=>{


db.prepare(`
UPDATE products
SET active=0
WHERE id=?
`).run(
req.params.id
);


res.json({
ok:true
});


});



// ===============================
// FRONTEND
// ===============================

app.get("*",(req,res)=>{

res.sendFile(
path.join(
__dirname,
"public",
"index.html"
)
);

});



// ===============================
// START SERVER
// ===============================

const PORT=process.env.PORT || 3000;


app.listen(PORT,()=>{

console.log(
"BLACK GAG2 SHOP running on port "+PORT
);

});
