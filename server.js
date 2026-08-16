const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();

const PORT = process.env.PORT || 3000;


// =====================
// MIDDLEWARE
// =====================

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



// =====================
// DATABASE
// =====================

const db = new Database(
    "black_gag2.db"
);


db.exec(`

CREATE TABLE IF NOT EXISTS users(

 id INTEGER PRIMARY KEY AUTOINCREMENT,

 username TEXT UNIQUE NOT NULL,

 contact TEXT,

 password TEXT NOT NULL,

 balance INTEGER DEFAULT 0,

 role TEXT DEFAULT 'user'

);



CREATE TABLE IF NOT EXISTS products(

 id INTEGER PRIMARY KEY AUTOINCREMENT,

 name TEXT NOT NULL,

 price INTEGER DEFAULT 0,

 image TEXT,

 stock INTEGER DEFAULT 0

);



CREATE TABLE IF NOT EXISTS orders(

 id INTEGER PRIMARY KEY AUTOINCREMENT,

 user_id INTEGER,

 product_id INTEGER,

 qty INTEGER,

 total INTEGER,

 status TEXT DEFAULT 'SUCCESS',

 created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);



CREATE TABLE IF NOT EXISTS topups(

 id INTEGER PRIMARY KEY AUTOINCREMENT,

 user_id INTEGER,

 method TEXT,

 amount INTEGER,

 status TEXT DEFAULT 'PENDING',

 credited INTEGER DEFAULT 0,

 created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);



CREATE TABLE IF NOT EXISTS sessions(

 id INTEGER PRIMARY KEY AUTOINCREMENT,

 user_id INTEGER,

 token TEXT

);


`);




// =====================
// ADMIN TẠO SẴN
// =====================


const admin =
db.prepare(
"SELECT * FROM users WHERE username=?"
)
.get("admin");


if(!admin){

db.prepare(`

INSERT INTO users

(username,contact,password,role)

VALUES(?,?,?,?)

`).run(

"admin",

"admin@gmail.com",

"admin123",

"admin"

);

}




// =====================
// THÊM SẢN PHẨM MẶC ĐỊNH
// =====================


const totalProduct =
db.prepare(
"SELECT COUNT(*) AS c FROM products"
)
.get().c;



if(totalProduct===0){


const list=[


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


const add =
db.prepare(`

INSERT INTO products

(name,price,image)

VALUES(?,?,?)

`);


for(const p of list){

add.run(
p[0],
p[1],
p[2]
);

}


}




// =====================
// TOKEN
// =====================


function newToken(){

return crypto
.randomBytes(32)
.toString("hex");

}




function getUser(req){


const token =
req.headers.authorization;



if(!token)
return null;



const session =
db.prepare(`

SELECT *

FROM sessions

WHERE token=?

`).get(token);



if(!session)
return null;



return db.prepare(`

SELECT *

FROM users

WHERE id=?

`).get(
session.user_id
);


}




function auth(req,res,next){


const user =
getUser(req);



if(!user){

return res.status(401).json({

error:"Chưa đăng nhập"

});

}



req.user=user;


next();


}



function adminAuth(req,res,next){


if(req.user.role!=="admin"){

return res.status(403).json({

error:"Không có quyền"

});

}


next();


}// =====================
// REGISTER
// =====================

app.post("/api/register",(req,res)=>{


const {
username,
contact,
password
}=req.body;



if(!username || !password){

return res.json({
error:"Thiếu thông tin"
});

}



if(password.length < 6){

return res.json({
error:"Mật khẩu phải từ 6 ký tự"
});

}



try{


db.prepare(`

INSERT INTO users

(username,contact,password)

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





// =====================
// LOGIN
// =====================


app.post("/api/login",(req,res)=>{


const {
username,
password
}=req.body;



const user = db.prepare(`

SELECT *

FROM users

WHERE username=?

AND password=?

`).get(

username,

password

);



if(!user){

return res.json({

error:"Sai tài khoản hoặc mật khẩu"

});

}



const token =
newToken();



db.prepare(`

INSERT INTO sessions

(user_id,token)

VALUES(?,?)

`).run(

user.id,

token

);



res.json({

success:true,

token,

user:{

username:user.username,

balance:user.balance,

role:user.role

}

});


});






// =====================
// LOGOUT
// =====================


app.post("/api/logout",auth,(req,res)=>{


const token =
req.headers.authorization;



db.prepare(`

DELETE FROM sessions

WHERE token=?

`).run(token);



res.json({

success:true

});


});






// =====================
// LẤY HỒ SƠ
// =====================


app.get("/api/me",auth,(req,res)=>{


res.json({

username:req.user.username,

contact:req.user.contact,

balance:req.user.balance,

role:req.user.role

});


});







// =====================
// PRODUCTS
// =====================


app.get("/api/products",(req,res)=>{


const data =
db.prepare(`

SELECT *

FROM products

ORDER BY id DESC

`).all();



res.json(data);


});







// =====================
// MUA HÀNG
// =====================


app.post("/api/orders",auth,(req,res)=>{


const {

productId,

qty,

gameUsername

}=req.body;



const product =
db.prepare(`

SELECT *

FROM products

WHERE id=?

`).get(productId);



if(!product){

return res.json({

error:"Không có sản phẩm"

});

}




const quantity =
Number(qty)||1;



const total =
product.price * quantity;



if(req.user.balance < total){

return res.json({

error:"Không đủ tiền"

});

}




db.prepare(`

UPDATE users

SET balance=balance-?

WHERE id=?

`).run(

total,

req.user.id

);




db.prepare(`

INSERT INTO orders

(user_id,product_id,qty,total,status)

VALUES(?,?,?,?,?)

`).run(

req.user.id,

product.id,

quantity,

total,

"SUCCESS"

);



res.json({

success:true

});


});







// =====================
// LỊCH SỬ MUA
// =====================


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
// =====================
// BANK INFO + QR
// =====================


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







// =====================
// NẠP BANK
// =====================


app.post("/api/topups/bank",auth,(req,res)=>{


const amount =
Number(req.body.amount);



const allow = [

10000,

20000,

50000,

100000

];



if(!allow.includes(amount)){


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








// =====================
// NẠP THẺ CÀO
// =====================


app.post("/api/topups/card",auth,(req,res)=>{


const {

provider,

value,

serial,

code

}=req.body;




if(!provider || !value || !serial || !code){


return res.json({

error:"Thiếu thông tin thẻ"

});


}




db.prepare(`

INSERT INTO topups

(user_id,method,amount,status)

VALUES(?,?,?,?)

`).run(


req.user.id,


"CARD",


Number(value),


"PENDING"


);




res.json({

success:true

});


});







// =====================
// LỊCH SỬ NẠP
// =====================


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



});






// =====================
// ADMIN OVERVIEW
// =====================


app.get(

"/api/admin/overview",

auth,

adminAuth,

(req,res)=>{



res.json({



users:

db.prepare(`

SELECT id,username,balance,role

FROM users

ORDER BY id DESC

`).all(),




products:

db.prepare(`

SELECT *

FROM products

ORDER BY id DESC

`).all(),




topups:

db.prepare(`

SELECT

topups.*,

users.username

FROM topups

JOIN users

ON users.id=topups.user_id

ORDER BY topups.id DESC

`).all(),




orders:

db.prepare(`

SELECT

orders.*,

users.username

FROM orders

JOIN users

ON users.id=orders.user_id

ORDER BY orders.id DESC

`).all()



});


});

// =====================
// ADMIN SỬA SẢN PHẨM
// =====================


app.patch(
"/api/admin/products/:id",
auth,
adminAuth,
(req,res)=>{


const {
name,
price,
image,
stock
}=req.body;



db.prepare(`

UPDATE products

SET

name=?,

price=?,

image=?,

stock=?

WHERE id=?

`).run(


name,

Number(price),

image,

Number(stock)||0,

req.params.id


);



res.json({

success:true

});


});







// =====================
// ADMIN DUYỆT NẠP
// =====================


app.post(

"/api/admin/topups/:id/approve",

auth,

adminAuth,

(req,res)=>{


const topup =

db.prepare(`

SELECT *

FROM topups

WHERE id=?

`).get(

req.params.id

);



if(!topup){

return res.json({

error:"Không tìm thấy"

});

}




let money =
topup.amount;



// thẻ cào chiết khấu 16%

if(topup.method==="CARD"){

money =
Math.floor(
topup.amount * 0.84
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

SET

status='SUCCESS',

credited=?

WHERE id=?

`).run(


money,

topup.id


);



res.json({

success:true,

credited:money

});


});







// =====================
// ADMIN TỪ CHỐI NẠP
// =====================


app.post(

"/api/admin/topups/:id/reject",

auth,

adminAuth,

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







// =====================
// ADMIN CỘNG TIỀN USER
// =====================


app.post(

"/api/admin/add-money",

auth,

adminAuth,

(req,res)=>{


const {

username,

amount

}=req.body;




const user =

db.prepare(`

SELECT *

FROM users

WHERE username=?

`).get(

username

);



if(!user){

return res.json({

error:"Không có user"

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

success:true

});


});







// =====================
// TRANG INDEX
// =====================
// Express 5 không dùng app.get("*")


app.use((req,res)=>{


res.sendFile(

path.join(

__dirname,

"public",

"index.html"

)

);


});







// =====================
// START SERVER
// =====================


app.listen(PORT,()=>{


console.log(

"BLACK GAG2 SHOP RUNNING PORT "

+PORT

);


});
