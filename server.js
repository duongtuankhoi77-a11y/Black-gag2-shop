const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


/* =========================
   ADMIN
========================= */

const ADMIN_USERNAME = "blackadmin";
const ADMIN_PASSWORD = "11102011tuankhoi";


/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({
  limit:"20mb"
}));

app.use(express.urlencoded({
  extended:true,
  limit:"20mb"
}));

app.use(express.static(
  path.join(__dirname,"public")
));


/* =========================
   DATABASE INIT
========================= */

async function initDB(){

await pool.query(`

CREATE TABLE IF NOT EXISTS users(
 id SERIAL PRIMARY KEY,
 username TEXT UNIQUE NOT NULL,
 contact TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 balance INTEGER DEFAULT 0,
 role TEXT DEFAULT 'user',
 created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS products(
 id SERIAL PRIMARY KEY,
 name TEXT NOT NULL,
 price INTEGER NOT NULL,
 stock INTEGER DEFAULT 0,
 active INTEGER DEFAULT 1,
 image TEXT
);


CREATE TABLE IF NOT EXISTS orders(
 id SERIAL PRIMARY KEY,
 user_id INTEGER REFERENCES users(id),
 total INTEGER NOT NULL,
 status TEXT DEFAULT 'PENDING',
 game_username TEXT,
 created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS order_items(
 id SERIAL PRIMARY KEY,
 order_id INTEGER REFERENCES orders(id),
 product_id INTEGER REFERENCES products(id),
 qty INTEGER,
 unit_price INTEGER
);


CREATE TABLE IF NOT EXISTS topups(
 id SERIAL PRIMARY KEY,
 user_id INTEGER REFERENCES users(id),
 method TEXT,
 amount INTEGER,
 status TEXT DEFAULT 'PENDING',
 provider_ref TEXT,
 credited_amount INTEGER,
 created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS sessions(
 token TEXT PRIMARY KEY,
 user_id INTEGER REFERENCES users(id),
 created_at TIMESTAMP DEFAULT NOW()
);

`);

console.log("Database ready");

}



/* =========================
   CREATE ADMIN
========================= */

async function createAdmin(){

const check =
await pool.query(
"SELECT * FROM users WHERE username=$1",
[ADMIN_USERNAME]
);


const hash =
bcrypt.hashSync(
ADMIN_PASSWORD,
12
);


if(check.rows.length===0){

await pool.query(`

INSERT INTO users
(username,contact,password_hash,role)

VALUES($1,$2,$3,'admin')

`,
[
ADMIN_USERNAME,
"admin@black-gag2.local",
hash
]);

console.log("Created admin");

}else{


await pool.query(`

UPDATE users

SET password_hash=$1,
role='admin'

WHERE username=$2

`,
[
hash,
ADMIN_USERNAME
]);

}


}



/* =========================
   TOKEN
========================= */

function createToken(){

return crypto
.randomBytes(32)
.toString("hex");

}



/* =========================
   GET USER
========================= */

async function getUser(req){

const auth =
req.headers.authorization || "";


if(!auth.startsWith("Bearer "))
return null;


const token =
auth.slice(7);


const result =
await pool.query(`

SELECT users.*

FROM sessions

JOIN users

ON users.id=sessions.user_id

WHERE sessions.token=$1

`,
[token]);


return result.rows[0] || null;

}



/* =========================
   AUTH
========================= */

async function requireUser(req,res,next){

const user =
await getUser(req);


if(!user){

return res.status(401).json({
error:"Cần đăng nhập"
});

}


req.user=user;

next();

}


async function requireAdmin(req,res,next){

const user =
await getUser(req);


if(!user || user.role!=="admin"){

return res.status(403).json({
error:"Không có quyền"
});

}


req.user=user;

next();

}/* =========================
   PRODUCTS
========================= */

app.get("/api/products", async(req,res)=>{

const data =
await pool.query(`
SELECT *
FROM products
WHERE active=1
ORDER BY id
`);

res.json(data.rows);

});



/* =========================
   REGISTER
========================= */

app.post("/api/register",async(req,res)=>{

const {
username,
contact,
password
}=req.body;


if(
!username ||
!contact ||
!password ||
password.length<6
){

return res.status(400).json({
error:"Thông tin không hợp lệ"
});

}


const exist =
await pool.query(
"SELECT id FROM users WHERE username=$1",
[username]
);


if(exist.rows.length){

return res.status(400).json({
error:"Tên đã tồn tại"
});

}



const hash =
bcrypt.hashSync(password,12);



const user =
await pool.query(`

INSERT INTO users
(username,contact,password_hash)

VALUES($1,$2,$3)

RETURNING id

`,
[
username,
contact,
hash
]);



const token =
createToken();


await pool.query(`

INSERT INTO sessions
(token,user_id)

VALUES($1,$2)

`,
[
token,
user.rows[0].id
]);



res.json({
token
});


});



/* =========================
   LOGIN
========================= */

app.post("/api/login",async(req,res)=>{


const {
login,
password
}=req.body;



const data =
await pool.query(`

SELECT *

FROM users

WHERE username=$1
OR contact=$1

`,
[login]);



const user =
data.rows[0];



if(
!user ||
!bcrypt.compareSync(
password,
user.password_hash
)
){

return res.status(401).json({
error:"Sai tài khoản hoặc mật khẩu"
});

}



const token =
createToken();


await pool.query(`

INSERT INTO sessions
(token,user_id)

VALUES($1,$2)

`,
[
token,
user.id
]);



res.json({

token,

username:user.username,

role:user.role,

balance:user.balance

});


});



/* =========================
   ME
========================= */

app.get(
"/api/me",
requireUser,
(req,res)=>{


res.json({

username:req.user.username,

contact:req.user.contact,

balance:req.user.balance,

role:req.user.role

});


});



/* =========================
   LOGOUT
========================= */

app.post(
"/api/logout",
requireUser,
async(req,res)=>{


const token =
req.headers.authorization
.replace("Bearer ","");



await pool.query(
"DELETE FROM sessions WHERE token=$1",
[token]
);



res.json({
ok:true
});


});



/* =========================
   ORDERS
========================= */

app.post(
"/api/orders",
requireUser,
async(req,res)=>{


const {
items,
gameUsername
}=req.body;



if(!items?.length){

return res.status(400).json({
error:"Giỏ hàng trống"
});

}



let total=0;

let checked=[];



for(const item of items){


const p =
await pool.query(
"SELECT * FROM products WHERE id=$1 AND active=1",
[item.productId]
);



const product =
p.rows[0];


if(!product){

return res.status(400).json({
error:"Không có sản phẩm"
});

}



const qty =
Math.max(
1,
Number(item.qty)||1
);



total +=
product.price*qty;



checked.push({
product,
qty
});


}



if(req.user.balance < total){

return res.status(400).json({
error:"Không đủ tiền"
});

}



const client =
await pool.connect();



try{


await client.query("BEGIN");



await client.query(`

UPDATE users

SET balance=balance-$1

WHERE id=$2

`,
[
total,
req.user.id
]);



const order =
await client.query(`

INSERT INTO orders

(user_id,total,game_username)

VALUES($1,$2,$3)

RETURNING id

`,
[
req.user.id,
total,
gameUsername
]);



for(const x of checked){


await client.query(`

INSERT INTO order_items

(order_id,product_id,qty,unit_price)

VALUES($1,$2,$3,$4)

`,
[
order.rows[0].id,
x.product.id,
x.qty,
x.product.price
]);


}



await client.query("COMMIT");



res.json({
orderId:order.rows[0].id
});



}catch(e){

await client.query("ROLLBACK");

res.status(500).json({
error:"Lỗi đặt hàng"
});


}finally{

client.release();

}


});



/* =========================
   HISTORY ORDERS
========================= */

app.get(
"/api/orders",
requireUser,
async(req,res)=>{


const data =
await pool.query(`

SELECT *

FROM orders

WHERE user_id=$1

ORDER BY id DESC

`,
[
req.user.id
]);



res.json(data.rows);


});/* =========================
   BANK INFO + QR
========================= */

app.get(
"/api/bank-info",
requireUser,
(req,res)=>{

res.json({

minAmount:10000,

qrs:{
10000:process.env.QR_10000 || "",
20000:process.env.QR_20000 || "",
50000:process.env.QR_50000 || "",
100000:process.env.QR_100000 || ""
},

account:
process.env.BANK_ACCOUNT || "",

name:
process.env.BANK_ACCOUNT_NAME || ""

});

});



/* =========================
   TOPUP BANK
========================= */

app.post(
"/api/topups/bank",
requireUser,
async(req,res)=>{


const amount =
Number(req.body.amount);



if(
![
10000,
20000,
50000,
100000
].includes(amount)
){

return res.status(400).json({
error:"Chọn đúng mệnh giá"
});

}



await pool.query(`

INSERT INTO topups

(user_id,method,amount)

VALUES($1,'BANK',$2)

`,
[
req.user.id,
amount
]);



res.json({
ok:true
});


});



/* =========================
   TOPUP CARD
========================= */

app.post(
"/api/topups/card",
requireUser,
async(req,res)=>{


const {
provider,
value,
serial,
code
}=req.body;



await pool.query(`

INSERT INTO topups

(user_id,method,amount,provider_ref)

VALUES($1,'CARD',$2,$3)

`,
[
req.user.id,
value,
JSON.stringify({
provider,
serial,
code
})
]);



res.json({
ok:true
});


});



/* =========================
   ADMIN OVERVIEW
========================= */

app.get(
"/api/admin/overview",
requireAdmin,
async(req,res)=>{


const users =
(await pool.query(
"SELECT id,username,contact,balance,role FROM users ORDER BY id DESC"
)).rows;



const products =
(await pool.query(
"SELECT * FROM products ORDER BY id"
)).rows;



const topups =
(await pool.query(`
SELECT 
topups.*,
users.username

FROM topups

JOIN users

ON users.id=topups.user_id

ORDER BY topups.id DESC
`)).rows;



const orders =
(await pool.query(`
SELECT
orders.*,
users.username

FROM orders

JOIN users

ON users.id=orders.user_id

ORDER BY orders.id DESC
`)).rows;



res.json({
users,
products,
topups,
orders
});


});



/* =========================
   ADMIN ADD PRODUCT
========================= */

app.post(
"/api/admin/products",
requireAdmin,
async(req,res)=>{


const {
name,
price,
stock,
image
}=req.body;



await pool.query(`

INSERT INTO products

(name,price,stock,image)

VALUES($1,$2,$3,$4)

`,
[
name,
price,
stock||0,
image||null
]);



res.json({
ok:true
});


});



/* =========================
   ADMIN EDIT PRODUCT
========================= */

app.patch(
"/api/admin/products/:id",
requireAdmin,
async(req,res)=>{


const {
name,
price,
stock,
image
}=req.body;



await pool.query(`

UPDATE products

SET

name=$1,
price=$2,
stock=$3,
image=$4

WHERE id=$5

`,
[
name,
price,
stock,
image,
req.params.id
]);



res.json({
ok:true
});


});



/* =========================
   ADMIN APPROVE TOPUP
========================= */

app.post(
"/api/admin/topups/:id/approve",
requireAdmin,
async(req,res)=>{


const topup =
(await pool.query(
"SELECT * FROM topups WHERE id=$1",
[req.params.id]
)).rows[0];



if(!topup){

return res.status(404).json({
error:"Không tìm thấy"
});

}



let money =
topup.amount;



// THẺ CÀO TRỪ 16%

if(topup.method==="CARD"){

money =
Math.floor(
topup.amount*0.84
);

}



await pool.query(`

UPDATE topups

SET

status='SUCCESS',
credited_amount=$1

WHERE id=$2

`,
[
money,
topup.id
]);



await pool.query(`

UPDATE users

SET balance=balance+$1

WHERE id=$2

`,
[
money,
topup.user_id
]);



res.json({
ok:true,
money
});


});



/* =========================
   ADMIN REJECT CARD
========================= */

app.post(
"/api/admin/topups/:id/reject",
requireAdmin,
async(req,res)=>{


await pool.query(`

UPDATE topups

SET status='FAILED'

WHERE id=$1

`,
[
req.params.id
]);



res.json({
ok:true
});


});



/* =========================
   ADMIN ADD MONEY USER
========================= */

app.post(
"/api/admin/add-money",
requireAdmin,
async(req,res)=>{


const {
username,
amount
}=req.body;



const user =
(await pool.query(
"SELECT id FROM users WHERE username=$1",
[username]
)).rows[0];



if(!user){

return res.status(404).json({
error:"Không có user"
});

}



await pool.query(`

UPDATE users

SET balance=balance+$1

WHERE id=$2

`,
[
amount,
user.id
]);



res.json({
ok:true
});


});



/* =========================
   START
========================= */

app.get("*",(req,res)=>{

res.sendFile(
path.join(
__dirname,
"public",
"index.html"
)
);

});



async function start(){

await initDB();

await createAdmin();


app.listen(PORT,()=>{

console.log(
"BLACK GAG2 SHOP RUNNING "+PORT
);

});


}


start();
