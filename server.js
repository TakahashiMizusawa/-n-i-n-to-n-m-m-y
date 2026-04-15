const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// 1. Cấu hình lưu trữ file
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static('public/uploads'));

// 2. Kết nối MySQL - ĐÃ SỬA ĐỂ TRÁNH LỖI ACCESS DENIED
const connection = mysql.createConnection({
    host: 'nam-pharma-db-thuannam936-7c38.i.aivencloud.com',
    port:12666, 
    user: 'avnadmin',     
    password: 'AVNS_1dmnhkjJtV6SOOb8uEV',   
    database: 'defaultdb',
    ssl: {
        rejectUnauthorized: false 
    }
});

connection.connect(err => {
    if (err) {
        console.error('!!! Lỗi kết nối MySQL: ' + err.stack);
        console.log('--- Gợi ý: Kiểm tra User/Pass hoặc tạo user admin trong MySQL ---');
        return;
    }
    console.log('√ Kết nối MySQL thành công! Đã sẵn sàng phục vụ Nam Nguyễn Pharma.');
});

// --- API XÁC THỰC BẢO MẬT (Dành riêng cho trang edit-profile.html) ---
app.post('/api/verify-for-edit', (req, res) => {
    const { username, password, security_answer } = req.body;
    
    if (!username || !password || !security_answer) {
        return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin xác thực" });
    }

    const sql = "SELECT * FROM users WHERE username = ? AND password = ? AND security_answer = ?";
    connection.query(sql, [username.trim(), password.trim(), security_answer.trim()], (err, results) => {
        if (err) {
            console.error("!!! LỖI SQL VERIFY:", err.message);
            return res.status(500).json({ error: "Lỗi hệ thống khi xác thực" });
        }
        
        if (results.length > 0) {
            res.json({ success: true, message: "Xác thực thành công", user: results[0] });
        } else {
            res.status(401).json({ success: false, error: "Tài khoản hoặc thông tin bảo mật không chính xác!" });
        }
    });
});

// --- API SẢN PHẨM ---
app.get('/api/products', (req, res) => {
    connection.query('SELECT * FROM products', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/products/search', (req, res) => {
    const query = req.query.q;
    const sql = "SELECT * FROM products WHERE name LIKE ?";
    connection.query(sql, [`%${query}%`], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    connection.query("SELECT * FROM products WHERE id = ?", [productId], (err, results) => {
        if (err) return res.status(500).json({ error: "Lỗi server" });
        if (results.length === 0) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        res.json(results[0]);
    });
});

app.post('/api/products', upload.single('image_urls'), (req, res) => {
    const { name, price, description } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    if (!name || !price) {
        return res.status(400).json({ error: "Thiếu tên hoặc giá sản phẩm" });
    }

    const sql = "INSERT INTO products (name, price, description, image_urls) VALUES (?, ?, ?, ?)";
    connection.query(sql, [name, price, description, imageUrl], (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL THÊM THUỐC:", err.message);
            return res.status(500).json({ error: "Lỗi database khi thêm thuốc" });
        }
        res.json({ success: true, message: "Thêm thuốc thành công!", id: result.insertId });
    });
});

app.put('/api/products/:id', upload.single('image_urls'), (req, res) => {
    const productId = req.params.id;
    const { name, price, description } = req.body;
    let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let updateFields = ["name = ?", "price = ?", "description = ?"];
    let params = [name, price, description];

    if (imageUrl) {
        updateFields.push("image_urls = ?");
        params.push(imageUrl);
    }

    params.push(productId);
    const sql = `UPDATE products SET ${updateFields.join(", ")} WHERE id = ?`;

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL CẬP NHẬT:", err.message);
            return res.status(500).json({ error: "Lỗi database khi cập nhật thuốc" });
        }
        res.json({ success: true, message: "Cập nhật thuốc thành công!" });
    });
});

app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    const sql = "DELETE FROM products WHERE id = ?";

    connection.query(sql, [productId], (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL XÓA:", err.message);
            return res.status(500).json({ error: "Không thể xóa sản phẩm" });
        }
        res.json({ success: true, message: "Đã xóa thuốc khỏi kho!" });
    });
});

// --- API ĐẶT HÀNG ---
app.post('/api/orders', (req, res) => {
    const { userId, productId, quantity, address, note, totalPrice } = req.body;
    
    if (!userId || !productId || !quantity) {
        return res.status(400).json({ error: "Thiếu thông tin đơn hàng cần thiết" });
    }

    const sql = "INSERT INTO orders (user_id, product_id, quantity, address, note, total_price, order_date) VALUES (?, ?, ?, ?, ?, ?, NOW())";
    const values = [userId, productId, quantity, address, note, totalPrice];
    
    connection.query(sql, values, (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL ORDERS:", err.message);
            return res.status(500).json({ error: "Lỗi lưu đơn hàng", detail: err.message });
        }
        res.json({ success: true, message: "Đặt hàng thành công!", orderId: result.insertId });
    });
});

app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT o.id, o.quantity, o.total_price, o.address, o.order_date, o.note,
               p.name AS product_name, p.image_urls
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.user_id = ?
        ORDER BY o.order_date DESC`;

    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Lỗi lấy lịch sử đơn hàng:", err);
            return res.status(500).json({ error: "Lỗi hệ thống" });
        }
        res.json(results);
    });
});

// --- API ĐÁNH GIÁ ---
app.post('/api/reviews', (req, res) => {
    const { productId, userId, content } = req.body;
    
    if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Nội dung đánh giá không được để trống" });
    }

    const sql = "INSERT INTO reviews (product_id, user_id, content) VALUES (?, ?, ?)";
    connection.query(sql, [productId, userId, content], (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL REVIEWS:", err.message);
            return res.status(500).json({ error: "Lỗi lưu đánh giá", detail: err.message });
        }
        res.json({ success: true, message: "Đánh giá thành công!" });
    });
});

app.get('/api/reviews/:productId', (req, res) => {
    const sql = `
        SELECT r.content, r.created_at, u.fullname, u.avatar_url 
        FROM reviews r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.product_id = ? 
        ORDER BY r.created_at DESC`;
    
    connection.query(sql, [req.params.productId], (err, results) => {
        if (err) return res.status(500).json({ error: "Lỗi tải đánh giá" });
        res.json(results);
    });
});

// --- API USER, LOGIN & REGISTER ---
app.post('/api/register', upload.single('avatar'), (req, res) => {
    const { username, password, fullname, email, phone, address, security_question, security_answer } = req.body;
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : '/uploads/default-avatar.png';

    if (!username || !password || !fullname) {
        return res.status(400).json({ error: "Vui lòng điền các trường bắt buộc (User, Pass, Họ tên)" });
    }

    const sql = `INSERT INTO users (username, password, fullname, email, phone, address, avatar_url, security_question, security_answer) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [username, password, fullname, email, phone, address, avatarUrl, security_question, security_answer];

    connection.query(sql, values, (err, result) => {
        if (err) {
            console.error("!!! LỖI SQL ĐĂNG KÝ:", err.message);
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Tên đăng nhập hoặc Email đã tồn tại!" });
            return res.status(500).json({ error: "Lỗi đăng ký tài khoản" });
        }
        res.json({ success: true, message: "Đăng ký thành công!", userId: result.insertId });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Vui lòng nhập đủ user/pass" });

    connection.query("SELECT * FROM users WHERE username = ? AND password = ?", [username.trim(), password.trim()], (err, results) => {
        if (err) return res.status(500).json({ error: "Lỗi hệ thống" });
        if (results.length > 0) {
            res.json({ user: results[0] });
        } else {
            res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu!" });
        }
    });
});

app.put('/api/users/:id', upload.single('avatar'), (req, res) => {
    const userId = req.params.id;
    const { fullname, email, phone, password, security_question, security_answer } = req.body;
    let avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let updateFields = [];
    let params = [];

    if (fullname) { updateFields.push("fullname = ?"); params.push(fullname); }
    if (email) { updateFields.push("email = ?"); params.push(email); }
    if (phone) { updateFields.push("phone = ?"); params.push(phone); }
    if (password) { updateFields.push("password = ?"); params.push(password); }
    if (security_question) { updateFields.push("security_question = ?"); params.push(security_question); }
    if (security_answer) { updateFields.push("security_answer = ?"); params.push(security_answer); }
    if (avatarUrl) { updateFields.push("avatar_url = ?"); params.push(avatarUrl); }

    if (updateFields.length === 0) return res.status(400).json({ error: "Không có thông tin nào được thay đổi" });

    params.push(userId);
    const sql = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;

    connection.query(sql, params, (err) => {
        if (err) return res.status(500).json({ error: "Cập nhật thất bại" });
        connection.query("SELECT * FROM users WHERE id = ?", [userId], (err, results) => {
            res.json({ message: "Cập nhật thành công", user: results[0] });
        });
    });
});

// --- API XÓA TÀI KHOẢN (CHO TRANG PROFILE) ---
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { password, security_answer } = req.body;

    if (!password || !security_answer) {
        return res.status(400).json({ error: "Thiếu thông tin xác thực để xóa tài khoản" });
    }

    const checkSql = "SELECT * FROM users WHERE id = ? AND password = ? AND security_answer = ?";
    connection.query(checkSql, [userId, password.trim(), security_answer.trim()], (err, results) => {
        if (err) return res.status(500).json({ error: "Lỗi kiểm tra dữ liệu" });
        
        if (results.length === 0) {
            return res.status(401).json({ error: "Mật khẩu hoặc câu trả lời bí mật không chính xác!" });
        }

        const deleteSql = "DELETE FROM users WHERE id = ?";
        connection.query(deleteSql, [userId], (err, result) => {
            if (err) return res.status(500).json({ error: "Không thể xóa tài khoản lúc này" });
            res.json({ success: true, message: "Tài khoản đã được xóa vĩnh viễn" });
        });
    });
});

// 3. Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});