// =========================
// USER TOPUP HISTORY
// =========================

app.get("/api/topups/history", auth, (req,res)=>{

const data = db.prepare(`
SELECT *
FROM topups
WHERE user_id=?
ORDER BY id DESC
`).all(req.user.id);


res.json(data);


});// =========================
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


});// =========================
// ADMIN UPDATE ORDER
// =========================

app.post(
"/api/admin/orders/:id/status",
adminAuth,
(req,res)=>{


const id=Number(req.params.id);

const status=req.body.status;



db.prepare(`
UPDATE orders
SET status=?
WHERE id=?
`).run(
status,
id
);



res.json({

success:true,

message:"Đã cập nhật"

});


});app.post(
"/api/admin/topups/:id/approve",
adminAuth,
(req,res)=>{


const id=Number(req.params.id);



const topup=db.prepare(`
SELECT *
FROM topups
WHERE id=?
`).get(id);



if(!topup){

return res.status(404).json({

success:false,

message:"Không tồn tại"

});

}



if(topup.status==="approved"){

return res.json({

success:false,

message:"Đã duyệt trước đó"

});

}



const tx=db.transaction(()=>{


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



});



tx();



res.json({

success:true,

message:"Đã cộng tiền",

creditedAmount:topup.amount

});


});app.post(
"/api/admin/products/:id/hide",
adminAuth,
(req,res)=>{

db.prepare(`
UPDATE products
SET stock=0
WHERE id=?
`).run(Number(req.params.id));


res.json({success:true});

});



app.post(
"/api/admin/products/:id/show",
adminAuth,
(req,res)=>{


res.json({success:true});


});
