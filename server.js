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

const db = new Database(DB_PATH);


db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");



// =========================
// TABLES
// =========================


db.exec(`

CREATE TABLE IF NOT EXISTS users(

id INTEGER PRIMARY KEY AUTOINCREMENT,

username TEXT UNIQUE NOT NULL,

contact TEXT DEFAULT '',

password TEXT NOT NULL,

role TEXT DEFAULT 'user',

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

description TEXT DEFAULT '',

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);



CREATE TABLE IF NOT EXISTS sessions(

token TEXT PRIMARY KEY,

user_id INTEGER,

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);



CREATE TABLE IF NOT EXISTS topups(

id INTEGER PRIMARY KEY AUTOINCREMENT,

user_id INTEGER,

method TEXT,

amount INTEGER,

provider TEXT DEFAULT '',

serial TEXT DEFAULT '',

code TEXT DEFAULT '',

status TEXT DEFAULT 'pending',

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);



CREATE TABLE IF NOT EXISTS orders(

id INTEGER PRIMARY KEY AUTOINCREMENT,

user_id INTEGER,

total INTEGER,

status TEXT DEFAULT 'completed',

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);


`);



// =========================
// CREATE ADMIN
// =========================


function hashPassword(password){

return crypto
.createHash("sha256")
.update(password)
.digest("hex");

}



const checkAdmin=db.prepare(
"SELECT * FROM users WHERE username=?"
).get("blackadmin");



if(!checkAdmin){

db.prepare(`

INSERT INTO users

(username,contact,password,role,balance)

VALUES(?,?,?,?,?)

`).run(

"blackadmin",

"",

hashPassword("tuankhoi123"),

"admin",

0

);


console.log("CREATE ADMIN OK");

}
// =========================
// EXPRESS
// =========================

app.use(express.json({
    limit:"5mb"
}));

app.use(express.urlencoded({
    extended:true
}));


app.use(express.static(
    path.join(__dirname,"public")
));




// =========================
// TOKEN
// =========================


function createToken(){

    return crypto
    .randomBytes(32)
    .toString("hex");

}



function getUser(token){

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

    const token=req.headers.authorization
    ?.replace("Bearer ","");


    const user=getUser(token);


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

    const token=req.headers.authorization
    ?.replace("Bearer ","");


    const user=getUser(token);


    if(!user || user.role!=="admin"){

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
// REGISTER
// =========================


app.post("/api/register",(req,res)=>{


try{


const {
username,
contact,
password
}=req.body;



if(!username || !password){

return res.status(400).json({

success:false,

message:"Thiếu thông tin"

});

}



const old=db.prepare(
"SELECT id FROM users WHERE username=?"
).get(username);



if(old){

return res.status(400).json({

success:false,

message:"Tài khoản đã tồn tại"

});

}



const result=db.prepare(`

INSERT INTO users

(username,contact,password,role,balance)

VALUES(?,?,?,?,?)

`).run(

username,

contact||"",

hashPassword(password),

"user",

0

);



const token=createToken();



db.prepare(`

INSERT INTO sessions(token,user_id)

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

contact,

role:"user",

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

contact:user.contact,

role:user.role,

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

contact:req.user.contact,

role:req.user.role,

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
// DEFAULT PRODUCTS
// =========================


const count=db.prepare(
"SELECT COUNT(*) count FROM products"
).get().count;



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
// TOPUP CARD
// =========================


app.post("/api/topups/card",auth,(req,res)=>{


const {
provider,
value,
serial,
code
}=req.body;



if(!provider||!value||!serial||!code){

return res.status(400).json({

success:false,

message:"Thiếu thông tin thẻ"

});

}



db.prepare(`

INSERT INTO topups

(user_id,method,amount,provider,serial,code)

VALUES(?,?,?,?,?,?)

`).run(

req.user.id,

"CARD",

Number(value),

provider,

serial,

code

);



res.json({

success:true,

message:"Đã gửi thẻ chờ duyệt"

});


});





// =========================
// TOPUP BANK
// =========================


app.post("/api/topups/bank",auth,(req,res)=>{


const amount=Number(req.body.amount);



if(amount<10000){

return res.status(400).json({

success:false,

message:"Nạp tối thiểu 10.000đ"

});

}



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

success:true,

message:"Đã tạo yêu cầu nạp"

});


});





// =========================
// TOPUP HISTORY
// =========================


app.get("/api/topups/history",auth,(req,res)=>{


const data=db.prepare(`

SELECT *

FROM topups

WHERE user_id=?

ORDER BY id DESC

`).all(req.user.id);



res.json(data);


});





// =========================
// ORDER HISTORY
// =========================


app.get("/api/orders",auth,(req,res)=>{


const data=db.prepare(`

SELECT *

FROM orders

WHERE user_id=?

ORDER BY id DESC

`).all(req.user.id);



res.json(data);


});





// =========================
// CREATE ORDER
// =========================


app.post("/api/orders",auth,(req,res)=>{


try{


const {
product_id,
quantity
}=req.body;



const product=db.prepare(`

SELECT *

FROM products

WHERE id=?

`).get(product_id);



if(!product){

throw Error("Không có sản phẩm");

}



const total=product.price*Number(quantity);



const user=db.prepare(`

SELECT *

FROM users

WHERE id=?

`).get(req.user.id);



if(user.balance<total){

throw Error("Không đủ tiền");

}



db.prepare(`

INSERT INTO orders

(user_id,total)

VALUES(?,?)

`).run(

user.id,

total

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

message:"Mua thành công"

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
"SELECT COUNT(*) AS c FROM users"
).get().c;


const products=db.prepare(
"SELECT COUNT(*) AS c FROM products"
).get().c;


const orders=db.prepare(
"SELECT COUNT(*) AS c FROM orders"
).get().c;


const topups=db.prepare(`
SELECT COUNT(*) AS c
FROM topups
WHERE status='pending'
`).get().c;


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
// ADMIN CỘNG TIỀN
// =========================

app.post("/api/admin/users/add-balance",adminAuth,(req,res)=>{


const {
username,
amount
}=req.body;


const user=db.prepare(`
SELECT id FROM users WHERE username=?
`).get(username);



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
Number(amount),
user.id
);



res.json({
success:true,
added:Number(amount)
});


});



// =========================
// ADMIN PRODUCTS
// =========================

app.get("/api/admin/products",adminAuth,(req,res)=>{


const products=db.prepare(`
SELECT *
FROM products
ORDER BY id DESC
`).all();



res.json({
success:true,
products
});


});



// THÊM SẢN PHẨM

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



const r=db.prepare(`
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
id:r.lastInsertRowid
});


});



// SỬA SẢN PHẨM

app.patch("/api/admin/products/:id",adminAuth,(req,res)=>{


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
req.body.name,
Number(req.body.price),
Number(req.body.bank_price),
Number(req.body.stock),
req.body.image||"",
req.body.description||"",
Number(req.params.id)
);



res.json({
success:true,
message:"Đã sửa"
});


});// =========================
// ADMIN TOPUPS
// =========================

app.get("/api/admin/topups",adminAuth,(req,res)=>{


const topups=db.prepare(`
SELECT 
topups.*,
users.username
FROM topups
JOIN users
ON users.id=topups.user_id
ORDER BY topups.id DESC
`).all();



res.json({
success:true,
topups
});


});



// DUYỆT NẠP

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
message:"Không tìm thấy"
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




// TỪ CHỐI NẠP

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


});





// =========================
// ADMIN ORDERS
// =========================


app.get("/api/admin/orders",adminAuth,(req,res)=>{


const orders=db.prepare(`
SELECT 
orders.*,
users.username
FROM orders
JOIN users
ON users.id=orders.user_id
ORDER BY orders.id DESC
`).all();



res.json({
success:true,
orders
});


});




// =========================
// BANK INFO QR
// =========================


app.get("/api/bank-info",(req,res)=>{


res.json({

success:true,

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


console.log("======================");

console.log("BLACK GAG2 SHOP");

console.log("SERVER RUNNING:",PORT);

console.log("DATABASE:",DB_PATH);

console.log("======================");


});
