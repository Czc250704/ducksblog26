require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ducksblog_secret_key_2026';

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 允许访客访问已审核文件
app.use('/storage/approved', express.static(path.join(__dirname, 'storage', 'approved')));

// 确保目录存在
const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_DIR = path.join(__dirname, 'storage');
const PENDING_DIR = path.join(STORAGE_DIR, 'pending');
const APPROVED_DIR = path.join(STORAGE_DIR, 'approved');
const MUSIC_DIR = path.join(APPROVED_DIR, 'music');
const MANIFEST_PATH = path.join(STORAGE_DIR, 'manifest.json');
const DB_PATH = path.join(DATA_DIR, 'ducksblog.db');

[DATA_DIR, STORAGE_DIR, PENDING_DIR, APPROVED_DIR, MUSIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 初始化 manifest.json
if (!fs.existsSync(MANIFEST_PATH)) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ files: [], lastUpdated: new Date().toISOString() }, null, 2));
}

// 数据库初始化
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super', 'admin'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    creator TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    creator TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    uploaded_at TEXT NOT NULL,
    approved_at TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('upload', 'approve', 'comment')),
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    related_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('normal', 'signed')),
    name TEXT,
    real_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    field TEXT,
    reason TEXT,
    bio TEXT,
    frequency TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL
  );
`);

// 初始化管理员账号（如果不存在）
const seedUsers = [
  { username: 'duck', password: '250901', role: 'super' },
  { username: 'admin1', password: '123123', role: 'admin' },
  { username: 'admin2', password: '123123', role: 'admin' },
  { username: 'admin3', password: '123123', role: 'admin' },
  { username: 'admin4', password: '123123', role: 'admin' }
];

const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)');
seedUsers.forEach((u) => {
  const hashed = bcrypt.hashSync(u.password, 10);
  insertUser.run(u.username, hashed, u.role);
});

// JWT 鉴权中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'unauthorized', code: 401 });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'unauthorized', code: 401 });
  }
}

// 超级管理员鉴权
function superAuthMiddleware(req, res, next) {
  if (req.user.role !== 'super') {
    return res.status(403).json({ success: false, error: '权限不足', code: 403 });
  }
  next();
}

// 管理员鉴权（super 或 admin）
function adminAuthMiddleware(req, res, next) {
  if (req.user.role !== 'super' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '权限不足', code: 403 });
  }
  next();
}

// Multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PENDING_DIR);
  },
  filename: (req, file, cb) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const fixedName = fixFileNameEncoding(file.originalname);
    cb(null, dateStr + '_' + fixedName);
  }
});

// 修复 Windows 下中文文件名乱码
// busboy 将 multipart 中 UTF-8 编码的中文按 Latin-1 解码，需要反转回来
function fixFileNameEncoding(name) {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    // 还原后不同且包含非 ASCII 字符，说明确实是编码问题
    if (decoded !== name && /[^\x00-\x7f]/.test(decoded)) {
      return decoded;
    }
  } catch (e) { /* 忽略解码失败 */ }
  return name;
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 修复文件名编码
    file.originalname = fixFileNameEncoding(file.originalname);
    const allowed = ['.md', '.txt', '.ppt', '.pptx', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 音乐文件上传配置
const musicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MUSIC_DIR);
  },
  filename: (req, file, cb) => {
    const fixedName = fixFileNameEncoding(file.originalname);
    cb(null, fixedName);
  }
});

const musicUpload = multer({
  storage: musicStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 修复文件名编码
    file.originalname = fixFileNameEncoding(file.originalname);
    const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式'));
    }
  }
});

// 更新 manifest.json
function updateManifest(filename, fileInfo) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  manifest.files.push({
    id: fileInfo.id,
    name: filename,
    category: fileInfo.categoryName || '',
    creator: fileInfo.creator,
    uploadDate: fileInfo.uploaded_at ? fileInfo.uploaded_at.slice(0, 10) : '',
    size: fileInfo.size || 0,
    type: path.extname(filename).replace('.', '')
  });
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// Git 同步
function syncToGit(filePath, filename) {
  try {
    const repoUrl = process.env.REPO_URL;
    const token = process.env.GITHUB_TOKEN;
    if (!repoUrl || !token) {
      console.log('Git 同步跳过：未配置 REPO_URL 或 GITHUB_TOKEN');
      return;
    }
    const cwd = STORAGE_DIR;

    // 检查是否为 git 仓库
    if (!fs.existsSync(path.join(STORAGE_DIR, '.git'))) {
      execSync('git init', { cwd, stdio: 'pipe' });
      const authUrl = repoUrl.replace('https://', 'https://' + token + '@');
      execSync('git remote add origin ' + authUrl, { cwd, stdio: 'pipe' });
    }

    execSync('git config user.name "ducksblog"', { cwd, stdio: 'pipe' });
    execSync('git config user.email "ducksblog@local"', { cwd, stdio: 'pipe' });

    execSync('git add .', { cwd, stdio: 'pipe' });
    execSync('git commit -m "approve: ' + filename + '"', { cwd, stdio: 'pipe' });
    execSync('git push origin main', { cwd, stdio: 'pipe' });

    console.log('Git 同步成功: ' + filename);
  } catch (e) {
    console.error('Git 同步失败: ' + e.message);
  }
}

// ========== API 路由 ==========

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ success: true, data: { token, username: user.username, role: user.role } });
});

// 获取当前用户信息
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  res.json({ success: true, data: user });
});

// 获取分类列表
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY created_at DESC').all();
  res.json({ success: true, data: categories });
});

// 创建分类
app.post('/api/categories', authMiddleware, adminAuthMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: '分类名称不能为空' });
  }
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim());
  if (existing) {
    return res.status(400).json({ success: false, error: '分类已存在' });
  }
  const result = db.prepare('INSERT INTO categories (name, creator, created_at) VALUES (?, ?, ?)').run(
    name.trim(),
    req.user.username,
    new Date().toISOString()
  );
  // 记录动态
  db.prepare('INSERT INTO activities (type, content, author, related_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'upload',
    '创建了分类「' + name.trim() + '」',
    req.user.username,
    null,
    new Date().toISOString()
  );
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name: name.trim() } });
});

// 删除分类（仅 super）
app.delete('/api/categories/:id', authMiddleware, superAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }
  // 删除分类下的文件
  const files = db.prepare('SELECT * FROM files WHERE category_id = ?').all(id);
  files.forEach((file) => {
    const filePath = file.status === 'approved'
      ? path.join(APPROVED_DIR, file.filename)
      : path.join(PENDING_DIR, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare('DELETE FROM files WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ success: true, data: { message: '分类已删除' } });
});

// 获取文件列表（访客仅看已审核，管理员看全部）
app.get('/api/files', (req, res) => {
  const { categoryId } = req.query;

  // 检查是否登录用户
  let authUser = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      authUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (e) { /* ignore */ }
  }

  let query = 'SELECT files.*, categories.name AS category_name FROM files JOIN categories ON files.category_id = categories.id';
  const params = [];

  if (!authUser || (authUser.role !== 'super' && authUser.role !== 'admin')) {
    // 访客只能看已审核
    query += ' WHERE files.status = \'approved\'';
  }

  if (categoryId) {
    query += (query.includes('WHERE') ? ' AND' : ' WHERE') + ' files.category_id = ?';
    params.push(categoryId);
  }

  query += ' ORDER BY files.uploaded_at DESC';

  const files = db.prepare(query).all(...params);
  res.json({ success: true, data: files });
});

// 上传文件
app.post('/api/upload', authMiddleware, adminAuthMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请选择文件' });
  }
  const { categoryId } = req.body;
  if (!categoryId) {
    return res.status(400).json({ success: false, error: '请选择分类' });
  }

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }

  const result = db.prepare(
    'INSERT INTO files (category_id, filename, original_name, creator, status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    categoryId,
    req.file.filename,
    req.file.originalname,
    req.user.username,
    'pending',
    new Date().toISOString()
  );

  // 记录动态
  db.prepare('INSERT INTO activities (type, content, author, related_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'upload',
    '上传了文件「' + req.file.originalname + '」到分类「' + category.name + '」，等待审核',
    req.user.username,
    result.lastInsertRowid,
    new Date().toISOString()
  );

  res.status(201).json({ success: true, data: { id: result.lastInsertRowid, filename: req.file.filename } });
});

// 上传音乐
app.post('/api/upload-music', authMiddleware, adminAuthMiddleware, musicUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请选择音乐文件' });
  }
  res.status(201).json({ success: true, data: { filename: req.file.filename } });
});

// 获取待审批列表（仅 super）
app.get('/api/admin/pending', authMiddleware, superAuthMiddleware, (req, res) => {
  const files = db.prepare(
    'SELECT files.*, categories.name AS category_name FROM files JOIN categories ON files.category_id = categories.id WHERE files.status = \'pending\' ORDER BY files.uploaded_at DESC'
  ).all();
  res.json({ success: true, data: files });
});

// 审批通过（仅 super）
app.post('/api/admin/approve/:id', authMiddleware, superAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const file = db.prepare('SELECT files.*, categories.name AS category_name FROM files JOIN categories ON files.category_id = categories.id WHERE files.id = ? AND files.status = \'pending\'').get(id);
  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在或已处理' });
  }

  const pendingPath = path.join(PENDING_DIR, file.filename);
  const approvedPath = path.join(APPROVED_DIR, file.filename);

  if (!fs.existsSync(pendingPath)) {
    return res.status(404).json({ success: false, error: '文件在磁盘上不存在' });
  }

  // 移动文件到 approved 目录
  fs.renameSync(pendingPath, approvedPath);

  // 更新数据库
  const now = new Date().toISOString();
  db.prepare('UPDATE files SET status = \'approved\', approved_at = ? WHERE id = ?').run(now, id);

  // 更新 manifest
  const stats = fs.statSync(approvedPath);
  updateManifest(file.filename, {
    id: file.id,
    categoryName: file.category_name,
    creator: file.creator,
    uploaded_at: file.uploaded_at,
    size: stats.size
  });

  // 记录动态
  db.prepare('INSERT INTO activities (type, content, author, related_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'approve',
    '文件「' + file.original_name + '」已通过审核',
    req.user.username,
    file.id,
    now
  );

  // Git 同步
  syncToGit(approvedPath, file.filename);

  res.json({ success: true, data: { id: file.id, filename: file.filename } });
});

// 拒绝审批（仅 super）
app.delete('/api/admin/reject/:id', authMiddleware, superAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND status = \'pending\'').get(id);
  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在或已处理' });
  }

  const pendingPath = path.join(PENDING_DIR, file.filename);
  if (fs.existsSync(pendingPath)) {
    fs.unlinkSync(pendingPath);
  }

  db.prepare('UPDATE files SET status = \'rejected\' WHERE id = ?').run(id);

  res.json({ success: true, data: { message: '文件已拒绝' } });
});

// 获取当前登录用户的上传记录
app.get('/api/my-uploads', authMiddleware, adminAuthMiddleware, (req, res) => {
  const files = db.prepare(
    'SELECT files.*, categories.name AS category_name FROM files JOIN categories ON files.category_id = categories.id WHERE files.creator = ? ORDER BY files.uploaded_at DESC'
  ).all(req.user.username);
  res.json({ success: true, data: files });
});

// 获取动态列表
app.get('/api/activities', (req, res) => {
  const activities = db.prepare(
    'SELECT * FROM activities ORDER BY created_at DESC LIMIT 50'
  ).all();

  // 为每条动态获取评论数
  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM comments WHERE activity_id = ?');
  const activitiesWithComments = activities.map((a) => {
    const { count } = countStmt.get(a.id);
    return { ...a, commentCount: count };
  });

  res.json({ success: true, data: activitiesWithComments });
});

// 发表评论
app.post('/api/comments', (req, res) => {
  const { activityId, content, author } = req.body;
  if (!activityId || !content || !content.trim()) {
    return res.status(400).json({ success: false, error: '参数不完整' });
  }
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) {
    return res.status(404).json({ success: false, error: '动态不存在' });
  }

  const commentAuthor = (author && author.trim()) ? author.trim() : '匿名访客';

  const result = db.prepare(
    'INSERT INTO comments (activity_id, content, author, created_at) VALUES (?, ?, ?, ?)'
  ).run(activityId, content.trim(), commentAuthor, new Date().toISOString());

  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

// 获取某条动态的评论
app.get('/api/comments/:activityId', (req, res) => {
  const { activityId } = req.params;
  const comments = db.prepare(
    'SELECT * FROM comments WHERE activity_id = ? ORDER BY created_at ASC'
  ).all(activityId);
  res.json({ success: true, data: comments });
});

// 获取音乐列表
app.get('/api/music', (req, res) => {
  if (!fs.existsSync(MUSIC_DIR)) {
    return res.json({ success: true, data: [] });
  }
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext);
  }).map((f) => ({
    name: f,
    url: '/storage/approved/music/' + encodeURIComponent(f)
  }));
  res.json({ success: true, data: files });
});

// 文件预览
app.get('/api/preview/:fileId', (req, res) => {
  const { fileId } = req.params;
  const file = db.prepare(
    'SELECT files.*, categories.name AS category_name FROM files JOIN categories ON files.category_id = categories.id WHERE files.id = ? AND files.status = \'approved\''
  ).get(fileId);
  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  const filePath = path.join(APPROVED_DIR, file.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件在磁盘上不存在' });
  }

  const ext = path.extname(file.filename).toLowerCase();
  const isTextFile = ['.md', '.txt'].includes(ext);
  const isOfficeFile = ['.ppt', '.pptx', '.doc', '.docx'].includes(ext);

  // 只有文本文件才读取内容，二进制文件直接给预览链接
  const content = isTextFile ? fs.readFileSync(filePath, 'utf-8') : null;

  res.json({
    success: true,
    data: {
      id: file.id,
      filename: file.original_name,
      type: ext.replace('.', ''),
      content: content,
      previewUrl: isOfficeFile
        ? '/storage/approved/' + encodeURIComponent(file.filename)
        : null,
      // 直接文件访问链接（供 Office Online 使用，避免前端二次编码）
      rawPath: isOfficeFile
        ? '/storage/approved/' + file.filename
        : null
    }
  });
});

// 获取管理员列表（仅 super）
app.get('/api/admin/users', authMiddleware, superAuthMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, role FROM users ORDER BY id').all();
  res.json({ success: true, data: users });
});

// 删除管理员（仅 super）
app.delete('/api/admin/users/:id', authMiddleware, superAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  if (user.username === 'duck') {
    return res.status(400).json({ success: false, error: '不能删除最高管理员' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, data: { message: '管理员已删除' } });
});

// 提交贡献者申请（无需登录）
app.post('/api/contributors', (req, res) => {
  const { type, name, realName, email, phone, field, reason, bio, frequency } = req.body;

  if (!type || !['normal', 'signed'].includes(type)) {
    return res.status(400).json({ success: false, error: '请选择有效的贡献者类型' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: '电子邮箱为必填项' });
  }

  if (type === 'signed') {
    if (!realName || !realName.trim()) {
      return res.status(400).json({ success: false, error: '签约贡献者需填写真实姓名' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: '签约贡献者需填写手机号' });
    }
  }

  const result = db.prepare(
    'INSERT INTO contributors (type, name, real_name, email, phone, field, reason, bio, frequency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    type,
    (name || '').trim(),
    (realName || '').trim(),
    email.trim(),
    (phone || '').trim(),
    (field || '').trim(),
    (reason || '').trim(),
    (bio || '').trim(),
    (frequency || 'casual'),
    new Date().toISOString()
  );

  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

// 获取贡献者申请列表（仅 super）
app.get('/api/contributors', authMiddleware, superAuthMiddleware, (req, res) => {
  const { type, status } = req.query;
  let query = 'SELECT * FROM contributors WHERE 1=1';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const list = db.prepare(query).all(...params);
  res.json({ success: true, data: list });
});

// 审批贡献者（仅 super）
app.post('/api/contributors/:id/approve', authMiddleware, superAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const app = db.prepare('SELECT * FROM contributors WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ success: false, error: '申请不存在' });
  db.prepare('UPDATE contributors SET status = \'approved\' WHERE id = ?').run(id);
  res.json({ success: true, data: { message: '已通过' } });
});

// 全局错误处理
app.use((err, req, res, next) => {
  // Multer 文件大小 / 字段数量限制等内置错误
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件大小超出限制（最大10MB）' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, error: '表单字段名称不匹配，请使用正确的文件字段名' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }

  // Multer fileFilter 抛出的自定义错误（不是 MulterError 实例）
  if (err.message === '不支持的文件类型') {
    return res.status(400).json({ success: false, error: '不支持的文件类型，仅允许：.md / .txt / .ppt / .pptx / .doc / .docx' });
  }
  if (err.message === '不支持的音频格式') {
    return res.status(400).json({ success: false, error: '不支持的音频格式，仅允许：.mp3 / .wav / .ogg / .m4a / .flac' });
  }

  console.error('服务器错误:', err.message);
  res.status(500).json({ success: false, error: '服务器内部错误：' + err.message });
});

// 启动服务
app.listen(PORT, () => {
  console.log('Duck\'s Blog 服务已启动: http://localhost:' + PORT);
});
