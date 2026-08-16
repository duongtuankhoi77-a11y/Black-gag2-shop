const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;


// =====================
// MIDDLEWARE
// =====================

app.use(express.json());
app.use(express.urlencoded({
    extended:true
}));

app.use(express.static(
    path.join(__dirname,"public")
));


// =====================
// DATABASE SQLITE
// =====================

const Database = require("better-sqlite3");

const db = new Database(
    "black_gag2.db"
);


// =====================
// TẠO BẢNG
// =====================

db.exec(`

CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE,
 contact TEXT,
 password TEXT,
 balance INTEGER DEFAULT 0,
 role TEXT DEFAULT 'user'
);


CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 price INTEGER,
 image TEXT,
 stock INTEGER DEFAULT 0
);


CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 total INTEGER,
 status TEXT
);


CREATE TABLE IF NOT EXISTS topups(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 method TEXT,
 amount INTEGER,
 status TEXT DEFAULT 'PENDING'
);


CREATE TABLE IF NOT EXISTS sessions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 token TEXT
);

`);

`);// TẠO SẢN PHẨM MẶC ĐỊNH
const countProduct = db.prepare(
    "SELECT COUNT(*) AS c FROM products"
).get().c;

if(countProduct === 0){

const products = [
 ["Dragon Breath Seed",4000,"/images/dragon.png"],
 ["Star Fruit",8000,"/images/starfruit.png"],
 ["Sun Bloom",3000,"/images/sunbloom.png"],
 ["Super Watering",1000,"/images/watering.png"],
 ["Super Sprinkler",1000,"/images/sprinkler.png"],
 ["Hypno Bloom",2000,"/images/hypno.png"],
 ["Moon Bloom",2000,"/images/moon.png"],
 ["Mega Seed",1000,"/images/mega.png"],
 ["Rainbow Seed",1000,"/images/rainbow.png"]
];

const add = db.prepare(
 "INSERT INTO products(name,price,image) VALUES(?,?,?)"
);

for(const p of products){
 add.run(...p);
}

}


// LẤY USER TỪ TOKEN
function auth(req,res,next){

 const token = req.headers.authorization;

 if(!token){
    return res.status(401).json({
      error:"Chưa đăng nhập"
    });
 }

 const session = db.prepare(
 "SELECT * FROM sessions WHERE token=?"
 ).get(token);


 if(!session){
    return res.status(401).json({
      error:"Token lỗi"
    });
 }


 req.user = db.prepare(
 "SELECT * FROM users WHERE id=?"
 ).get(session.user_id);


 next();

}


// ĐĂNG KÝ
app.post("/api/register",(req,res)=>{

 let {
 username,
 contact,
 password
 } = req.body;


 if(!username || !password){
    return res.json({
      error:"Thiếu thông tin"
    });
 }


 if(password.length < 6){
    return res.json({
      error:"Mật khẩu tối thiểu 6 ký tự"
    });
 }


 try{

 db.prepare(`

INSERT INTO users(username,contact,password)

VALUES(?,?,?)

`).run(
username,
contact || "",
password
);


 res.json({
   success:true
 });


 }catch(e){

 res.json({
   error:"Tên tài khoản đã tồn tại"
 });

 }

});



// ĐĂNG NHẬP
app.post("/api/login",(req,res)=>{

const {
 username,
 password
}=req.body;


const user = db.prepare(
"SELECT * FROM users WHERE username=? AND password=?"
).get(username,password);



if(!user){
 return res.json({
   error:"Sai tài khoản hoặc mật khẩu"
 });
}


const token = crypto
.randomBytes(32)
.toString("hex");


db.prepare(
"INSERT INTO sessions(user_id,token) VALUES(?,?)"
).run(
user.id,
token
);


res.json({
 success:true,
 token:token,
 user:{
  username:user.username,
  balance:user.balance,
  role:user.role
 }
});


});



// ĐĂNG XUẤT
app.post("/api/logout",auth,(req,res)=>{

const token=req.headers.authorization;


db.prepare(
"DELETE FROM sessions WHERE token=?"
).run(token);


res.json({
 success:true
});


});



// LẤY USER HIỆN TẠI
app.get("/api/me",auth,(req,res)=>{

res.json({
 user:req.user
});


});// =========================
// PRODUCTS
// =========================

app.get("/api/products",(req,res)=>{

const data = db.prepare(
"SELECT * FROM products ORDER BY id DESC"
).all();


res.json(data);

});



// =========================
// MUA HÀNG
// =========================

app.post("/api/orders",auth,(req,res)=>{


const {
productId,
qty,
gameUsername
}=req.body;



const product = db.prepare(
"SELECT * FROM products WHERE id=?"
).get(productId);



if(!product){

return res.json({
 error:"Không có sản phẩm"
});

}



let amount =
product.price * Number(qty || 1);



if(req.user.balance < amount){

return res.json({
 error:"Không đủ tiền"
});

}




db.prepare(`
UPDATE users
SET balance=balance-?
WHERE id=?
`).run(
amount,
req.user.id
);



db.prepare(`
INSERT INTO orders(user_id,total,status)
VALUES(?,?,?)
`).run(
req.user.id,
amount,
"SUCCESS"
);



res.json({

success:true

});


});




// =========================
// LỊCH SỬ MUA
// =========================


app.get("/api/orders",auth,(req,res)=>{


const data =
db.prepare(`

SELECT *

FROM orders

WHERE user_id=?

ORDER BY id DESC

`).all(
req.user.id
);


res.json(data);


});





// =========================
// NẠP BANK
// =========================


app.get("/api/bank-info",(req,res)=>{


res.json({

bank:"MB BANK",

account:"0123456789",

name:"BLACK GAG2 SHOP",


qrs:{

10000:"/qr-10k.png",

20000:"/qr-20k.png",

50000:"/qr-50k.png",

100000:"/qr-100k.png"

}


});


});




// gửi yêu cầu nạp bank

app.post("/api/topups/bank",auth,(req,res)=>{


const amount =
Number(req.body.amount);



if(
![10000,20000,50000,100000]
.includes(amount)
){

return res.json({
 error:"Sai mệnh giá"
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

success:true

});


});





// =========================
// NẠP THẺ
// =========================


app.post("/api/topups/card",auth,(req,res)=>{


const {

provider,
value,
serial,
code

}=req.body;



db.prepare(`

INSERT INTO topups
(user_id,method,amount,status)

VALUES(?,?,?,?)

`).run(

req.user.id,
"CARD",
value,
"PENDING"

);



res.json({

success:true

});


});





// lịch sử nạp

app.get("/api/topups",auth,(req,res)=>{


const data =
db.prepare(`

SELECT *

FROM topups

WHERE user_id=?

ORDER BY id DESC

`).all(
req.user.id
);



res.json(data);


});// =========================
// TẠO ADMIN MẶC ĐỊNH
// =========================

const admin =
db.prepare(
"SELECT * FROM users WHERE username=?"
).get("admin");


if(!admin){

db.prepare(`

INSERT INTO users
(username,contact,password,balance,role)

VALUES(?,?,?,?,?)

`).run(
"admin",
"admin@gmail.com",
"admin123",
0,
"admin"
);

}



// =========================
// CHECK ADMIN
// =========================

function adminOnly(req,res,next){

if(req.user.role!=="admin"){

return res.status(403).json({
 error:"Không có quyền"
});

}


next();

}





// =========================
// ADMIN OVERVIEW
// =========================

app.get(
"/api/admin/overview",
auth,
adminOnly,
(req,res)=>{


res.json({

users:
db.prepare(
"SELECT id,username,balance,role FROM users"
).all(),


products:
db.prepare(
"SELECT * FROM products"
).all(),


topups:
db.prepare(`

SELECT topups.*,users.username

FROM topups

JOIN users

ON users.id=topups.user_id

ORDER BY topups.id DESC

`).all(),


orders:
db.prepare(`

SELECT orders.*,users.username

FROM orders

JOIN users

ON users.id=orders.user_id

ORDER BY orders.id DESC

`).all()


});


});




// =========================
// ADMIN SỬA SẢN PHẨM
// =========================


app.patch(
"/api/admin/products/:id",
auth,
adminOnly,
(req,res)=>{


const {
name,
price,
image,
stock
}=req.body;



db.prepare(`

UPDATE products

SET name=?,
price=?,
image=?,
stock=?

WHERE id=?

`).run(
name,
price,
image,
stock,
req.params.id
);



res.json({
success:true
});


});






// =========================
// ADMIN DUYỆT NẠP
// =========================


// thành công

app.post(
"/api/admin/topups/:id/approve",
auth,
adminOnly,
(req,res)=>{


const topup =
db.prepare(
"SELECT * FROM topups WHERE id=?"
)
.get(req.params.id);



if(!topup){

return res.json({
error:"Không có"
});

}




let money =
topup.amount;



// thẻ cào chiết khấu 16%

if(topup.method==="CARD"){

money =
Math.floor(
money*0.84
);

}




db.prepare(`

UPDATE users

SET balance=balance+?

WHERE id=?

`).run(
money,
topup.user_id
);



db.prepare(`

UPDATE topups

SET status='SUCCESS'

WHERE id=?

`).run(
topup.id
);



res.json({
success:true
});


});





// từ chối

app.post(
"/api/admin/topups/:id/reject",
auth,
adminOnly,
(req,res)=>{


db.prepare(`

UPDATE topups

SET status='FAILED'

WHERE id=?

`).run(
req.params.id
);



res.json({
success:true
});


});






// =========================
// ADMIN CỘNG TIỀN USER
// =========================


app.post(
"/api/admin/add-money",
auth,
adminOnly,
(req,res)=>{


const {
username,
amount
}=req.body;



const user =
db.prepare(
"SELECT * FROM users WHERE username=?"
)
.get(username);



if(!user){

return res.json({
error:"Không tìm thấy user"
});

}



db.prepare(`

UPDATE users

SET balance=balance+?

WHERE id=?

`).run(
amount,
user.id
);



res.json({
success:true
});


});






// =========================
// TRANG WEB
// (sửa lỗi Express 5)
// =========================


app.use((req,res)=>{

res.sendFile(
path.join(
__dirname,
"public",
"index.html"
)
);


});






// =========================
// START
// =========================


app.listen(PORT,()=>{

console.log(
"BLACK GAG2 SHOP running port "
+PORT
);


});
