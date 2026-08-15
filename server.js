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

const DATA_DIR = path.join(__dirname,"data");

if(!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR,{recursive:true});
}


const DB_PATH = path.join(DATA_DIR,"black_gag2.db");

console.log("Database:",DB_PATH);


const db = new Database(DB_PATH);


db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");




// =========================
// CREATE TABLE
// =========================

db.exec(`

CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 contact TEXT NOT NULL,
 password TEXT NOT NULL,
 balance INTEGER DEFAULT 0,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 price INTEGER DEFAULT 0,
 bank_price INTEGER DEFAULT 0,
 stock INTEGER DEFAULT 0,
 image TEXT DEFAULT '',
 description TEXT DEFAULT ''
);


CREATE TABLE IF NOT EXISTS topups(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 method TEXT,
 amount INTEGER,
 provider TEXT DEFAULT '',
 serial TEXT DEFAULT '',
 code TEXT DEFAULT '',
 status TEXT DEFAULT 'pending'
);


CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 total INTEGER,
 status TEXT DEFAULT 'pending'
);


CREATE TABLE IF NOT EXISTS sessions(
 token TEXT PRIMARY KEY,
 user_id INTEGER
);


`);





// =========================
// PASSWORD
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





// =========================
// DEFAULT PRODUCTS
// =========================


const count = db
.prepare("SELECT COUNT(*) c FROM products")
.get().c;



if(count===0){

const add=db.prepare(`

INSERT INTO products
(name,price,bank_price,stock,image,description)

VALUES(?,?,?,?,?,?)

`);


[
["Dragon Breath Seed",4000,4000,0,"",""],
["Star Fruit",8000,8000,0,"",""],
["Sun Bloom",3000,3000,0,"",""],
["Super Watering",1000,1000,0,"",""],
["Super Sprinkler",1000,1000,0,"",""],
["Hypno Bloom",2000,2000,0,"",""],
["Moon Bloom",2000,2000,0,"",""],
["Mega Seed",1000,1000,0,"",""],
["Rainbow Seed",1000,1000,0,"",""]

].forEach(p=>add.run(...p));

}






// =========================
// DEFAULT ADMIN
// =========================


const admin = db.prepare(`

SELECT id FROM users WHERE username=?

`).get("blackadmin");



if(!admin){

db.prepare(`

INSERT INTO users
(username,contact,password,balance)

VALUES(?,?,?,?)

`).run(

"blackadmin",
"admin",
hashPassword("tuankhoi123"),
0

);


console.log("Created admin");

}






// =========================
// EXPRESS
// =========================


app.use(express.json());

app.use(express.urlencoded({
extended:true
}));


app.use(express.static(
path.join(__dirname,"public")
));// =========================
// AUTH FUNCTIONS
// =========================


function getUserFromToken(token){

    if(!token) return null;


    return db.prepare(`

    SELECT users.*

    FROM sessions

    JOIN users

    ON users.id=sessions.user_id

    WHERE sessions.token=?

    `).get(token);

}




function auth(req,res,next){

    const token=req.headers.authorization?.replace("Bearer ","");


    const user=getUserFromToken(token);


    if(!user){

        return res.status(401).json({

            success:false,
            message:"Chưa đăng nhập"

        });

    }


    req.user=user;
    req.token=token;

    next();

}




function adminAuth(req,res,next){

    const token=req.headers.authorization?.replace("Bearer ","");


    const user=getUserFromToken(token);



    if(!user || user.username!=="blackadmin"){

        return res.status(403).json({

            success:false,
            message:"Không có quyền admin"

        });

    }


    req.user=user;
    next();

}





// =========================
// HEALTH
// =========================


app.get("/api/health",(req,res)=>{


res.json({

success:true,
status:"online"

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



if(!username||!contact||!password){

return res.status(400).json({

success:false,
message:"Thiếu thông tin"

});

}



const old=db.prepare(`

SELECT id FROM users WHERE username=?

`).get(username);



if(old){

return res.status(400).json({

success:false,
message:"Tài khoản đã tồn tại"

});

}



const result=db.prepare(`

INSERT INTO users
(username,contact,password,balance)

VALUES(?,?,?,0)

`).run(

username,
contact,
hashPassword(password)

);



const token=createToken();



db.prepare(`

INSERT INTO sessions
(token,user_id)

VALUES(?,?)

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

VALUES(?,?)

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
balance:user.balance

}

});


});








// =========================
// GET USER
// =========================


app.get("/api/me",auth,(req,res)=>{


res.json({

success:true,

user:{

id:req.user.id,
username:req.user.username,
balance:req.user.balance

}

});


});





// =========================
// LOGOUT
// =========================


app.post("/api/logout",auth,(req,res)=>{


db.prepare(`

DELETE FROM sessions

WHERE token=?

`).run(req.token);



res.json({

success:true,
message:"Đã đăng xuất"

});


});// =========================
// PRODUCTS
// =========================

app.get("/api/products",(req,res)=>{


const products=db.prepare(`

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
// TOPUP CARD
// =========================


app.post("/api/topups/card",auth,(req,res)=>{


const {
provider,
value,
serial,
code
}=req.body;



if(!provider || !value || !serial || !code){

return res.status(400).json({

success:false,
message:"Thiếu thông tin thẻ"

});

}




const result=db.prepare(`

INSERT INTO topups

(user_id,method,amount,provider,serial,code,status)

VALUES(?,?,?,?,?,?,?)

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

id:result.lastInsertRowid

});


});








// =========================
// TOPUP BANK
// =========================


app.post("/api/topups/bank",auth,(req,res)=>{


const amount=Number(req.body.amount);



if(!amount || amount<10000){

return res.status(400).json({

success:false,
message:"Nạp tối thiểu 10.000đ"

});

}




const result=db.prepare(`

INSERT INTO topups

(user_id,method,amount,status)

VALUES(?,?,?,'pending')

`).run(

req.user.id,
"BANK",
amount

);



res.json({

success:true,

message:"Đã tạo yêu cầu",

id:result.lastInsertRowid

});


});








// =========================
// ORDERS
// =========================


app.get("/api/orders",auth,(req,res)=>{


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





app.post("/api/orders",auth,(req,res)=>{


try{


const items=req.body.items;


if(!Array.isArray(items)||items.length===0){

return res.status(400).json({

success:false,
message:"Giỏ hàng trống"

});

}



let total=0;



for(const item of items){


const product=db.prepare(`

SELECT *

FROM products

WHERE id=?

`).get(item.product_id);



if(!product){

throw Error("Không có sản phẩm");

}



total += product.price * Number(item.quantity);


}





const user=db.prepare(`

SELECT *

FROM users

WHERE id=?

`).get(req.user.id);





if(user.balance < total){

throw Error("Không đủ tiền");

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





db.prepare(`

UPDATE users

SET balance=balance-?

WHERE id=?

`).run(

total,
user.id

);



res.json({

success:true,

message:"Mua thành công",

order_id:order.lastInsertRowid

});



}catch(e){


res.status(400).json({

success:false,

message:e.message

});


}


});// =========================
// ADMIN OVERVIEW
// =========================

app.get("/api/admin/overview",adminAuth,(req,res)=>{


const users=db.prepare(
"SELECT COUNT(*) c FROM users"
).get().c;


const products=db.prepare(
"SELECT COUNT(*) c FROM products"
).get().c;


const orders=db.prepare(
"SELECT COUNT(*) c FROM orders"
).get().c;


const topups=db.prepare(
"SELECT COUNT(*) c FROM topups WHERE status='pending'"
).get().c;



res.json({

success:true,

overview:{
users,
products,
orders,
topups
}

});


});






// =========================
// ADMIN PRODUCTS
// =========================


app.get("/api/admin/products",adminAuth,(req,res)=>{


const products=db.prepare(`

SELECT *

FROM products

ORDER BY id ASC

`).all();



res.json({

success:true,

products

});


});






// ADD PRODUCT

app.post("/api/admin/products",adminAuth,(req,res)=>{


const {

name,
price,
bank_price,
stock,
image,
description

}=req.body;



if(!name){

return res.status(400).json({

success:false,
message:"Thiếu tên"

});

}



const result=db.prepare(`

INSERT INTO products

(name,price,bank_price,stock,image,description)

VALUES(?,?,?,?,?,?)

`).run(

name,
Number(price)||0,
Number(bank_price)||Number(price)||0,
Number(stock)||0,
image||"",
description||""

);



res.json({

success:true,

id:result.lastInsertRowid

});


});







// EDIT PRODUCT

app.patch("/api/admin/products/:id",adminAuth,(req,res)=>{


const id=Number(req.params.id);



const old=db.prepare(`

SELECT *

FROM products

WHERE id=?

`).get(id);



if(!old){

return res.status(404).json({

success:false,

message:"Không tìm thấy"

});

}





db.prepare(`

UPDATE products SET

name=?,

price=?,

bank_price=?,

stock=?,

image=?,

description=?

WHERE id=?

`).run(

req.body.name ?? old.name,

Number(req.body.price ?? old.price),

Number(req.body.bank_price ?? old.bank_price),

Number(req.body.stock ?? old.stock),

req.body.image ?? old.image,

req.body.description ?? old.description,

id

);



res.json({

success:true,

message:"Đã sửa"

});


});







// DELETE PRODUCT

app.delete("/api/admin/products/:id",adminAuth,(req,res)=>{


db.prepare(`

DELETE FROM products

WHERE id=?

`).run(

Number(req.params.id)

);



res.json({

success:true,

message:"Đã xóa"

});


});








// =========================
// ADMIN TOPUPS
// =========================


app.get("/api/admin/topups",adminAuth,(req,res)=>{


const topups=db.prepare(`

SELECT *

FROM topups

ORDER BY id DESC

`).all();



res.json({

success:true,

topups

});


});






// APPROVE TOPUP

app.post("/api/admin/topups/:id/approve",adminAuth,(req,res)=>{


const id=Number(req.params.id);



const topup=db.prepare(`

SELECT *

FROM topups

WHERE id=?

`).get(id);



if(!topup){

return res.status(404).json({

success:false,

message:"Không có yêu cầu"

});

}





db.prepare(`

UPDATE topups

SET status='approved'

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

success:true,

message:"Đã duyệt"

});


});







// REJECT TOPUP

app.post("/api/admin/topups/:id/reject",adminAuth,(req,res)=>{


db.prepare(`

UPDATE topups

SET status='rejected'

WHERE id=?

`).run(

Number(req.params.id)

);



res.json({

success:true,

message:"Đã từ chối"

});


});// =========================
// ADMIN USERS
// =========================

app.get("/api/admin/users",adminAuth,(req,res)=>{


const users=db.prepare(`

SELECT id,username,contact,balance,created_at

FROM users

ORDER BY id DESC

`).all();



res.json({

success:true,

users

});


});







// =========================
// CỘNG TIỀN USER
// =========================


app.patch("/api/admin/users/:id/balance",adminAuth,(req,res)=>{


const id=Number(req.params.id);

const amount=Number(req.body.amount);



if(!Number.isFinite(amount)){

return res.status(400).json({

success:false,

message:"Số tiền không hợp lệ"

});

}



const user=db.prepare(`

SELECT *

FROM users

WHERE id=?

`).get(id);



if(!user){

return res.status(404).json({

success:false,

message:"Không tìm thấy user"

});

}





db.prepare(`

UPDATE users

SET balance=balance+?

WHERE id=?

`).run(

amount,

id

);



res.json({

success:true,

message:"Đã cộng tiền"

});


});







// =========================
// FALLBACK
// =========================


app.get("*",(req,res)=>{


const index=path.join(

__dirname,

"public",

"index.html"

);



if(fs.existsSync(index)){

return res.sendFile(index);

}



res.send(
"BLACK GAG2 SHOP SERVER ONLINE"
);


});







// =========================
// START SERVER
// =========================


app.listen(PORT,"0.0.0.0",()=>{


console.log("==============================");

console.log(" BLACK GAG2 SHOP");

console.log(" SERVER RUNNING:",PORT);

console.log(" DATABASE:",DB_PATH);

console.log("==============================");


});
