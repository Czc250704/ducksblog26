require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ducksblog_secret_key_2026';

// Supabase 客户端（Node.js 20 需要手动提供 WebSocket 实现）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  }
);

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 允许访客访问已审核文件
app.use('/storage/approved', express.static(path.join(__dirname, 'storage', 'approved')));

// 确保目录存在
const STORAGE_DIR = path.join(__dirname, 'storage');
const PENDING_DIR = path.join(STORAGE_DIR, 'pending');
const APPROVED_DIR = path.join(STORAGE_DIR, 'approved');
const MUSIC_DIR = path.join(APPROVED_DIR, 'music');
const MANIFEST_PATH = path.join(STORAGE_DIR, 'manifest.json');

[STORAGE_DIR, PENDING_DIR, APPROVED_DIR, MUSIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 初始化 manifest.json
if (!fs.existsSync(MANIFEST_PATH)) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ files: [], lastUpdated: new Date().toISOString() }, null, 2));
}

// 初始化管理员账号
async function seedUsers() {
  const seedData = [
    { username: 'duck', password: '250901', role: 'super' },
    { username: 'admin1', password: '123123', role: 'admin' },
    { username: 'admin2', password: '123123', role: 'admin' },
    { username: 'admin3', password: '123123', role: 'admin' },
    { username: 'admin4', password: '123123', role: 'admin' }
  ];

  for (const u of seedData) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', u.username)
      .maybeSingle();

    if (!existing) {
      const hashed = bcrypt.hashSync(u.password, 10);
      await supabase.from('users').insert({
        username: u.username,
        password: hashed,
        role: u.role
      });
    }
  }
  console.log('管理员账号初始化完成');
}

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

// 修复 Windows 下中文文件名乱码
function fixFileNameEncoding(name) {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (decoded !== name && /[^\x00-\x7f]/.test(decoded)) {
      return decoded;
    }
  } catch (e) { /* 忽略解码失败 */ }
  return name;
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

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.originalname = fixFileNameEncoding(file.originalname);
    const allowed = [
      '.md', '.txt', '.pdf',
      '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma',
      '.mp4', '.webm', '.avi', '.mov', '.mkv',
      '.js', '.py', '.html', '.css', '.json', '.xml', '.csv',
      '.log', '.yaml', '.yml'
    ];
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
async function syncToGit(filePath, filename) {
  const repoUrl = process.env.REPO_URL;
  const token = process.env.GITHUB_TOKEN;
  if (!repoUrl || !token) {
    console.log('Git 同步跳过：未配置 REPO_URL 或 GITHUB_TOKEN');
    return null;
  }

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
  if (!match) {
    console.log('Git 同步跳过：无法解析 REPO_URL');
    return null;
  }
  const owner = match[1];
  const repo = match[2];
  const remotePath = 'storage/approved/' + filename;
  const rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + remotePath;

  const fileContent = fs.readFileSync(filePath);
  const base64Content = fileContent.toString('base64');

  console.log('正在推送文件到 GitHub: ' + filename + ' ...');

  return new Promise((resolve) => {
    const apiPath = '/repos/' + owner + '/' + repo + '/contents/' + remotePath;
    const postData = JSON.stringify({
      message: 'approve: ' + filename,
      content: base64Content
    });

    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'ducksblog',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const https = require('https');
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('GitHub 推送成功: ' + filename);
          resolve(rawUrl);
        } else {
          console.error('GitHub API 错误: HTTP ' + res.statusCode + ' - ' + data.substring(0, 200));
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('GitHub 推送失败: ' + e.message);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// ========== API 路由 ==========

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error || !user) {
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
app.get('/api/me', authMiddleware, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, role')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error || !user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  res.json({ success: true, data: user });
});

// 获取分类列表
app.get('/api/categories', async (req, res) => {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, data: categories });
});

// 创建分类
app.post('/api/categories', authMiddleware, adminAuthMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: '分类名称不能为空' });
  }

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('name', name.trim())
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ success: false, error: '分类已存在' });
  }

  const { data: created, error } = await supabase
    .from('categories')
    .insert({
      name: name.trim(),
      creator: req.user.username,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  // 记录动态
  await supabase.from('activities').insert({
    type: 'upload',
    content: '创建了分类「' + name.trim() + '」',
    author: req.user.username,
    created_at: new Date().toISOString()
  });

  res.status(201).json({ success: true, data: { id: created.id, name: name.trim() } });
});

// 删除分类（仅 super）
app.delete('/api/categories/:id', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!category) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }

  // 删除磁盘上的文件
  const { data: files } = await supabase
    .from('files')
    .select('*')
    .eq('category_id', id);

  if (files) {
    files.forEach((file) => {
      const filePath = file.status === 'approved'
        ? path.join(APPROVED_DIR, file.filename)
        : path.join(PENDING_DIR, file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  }

  await supabase.from('files').delete().eq('category_id', id);
  await supabase.from('categories').delete().eq('id', id);

  res.json({ success: true, data: { message: '分类已删除' } });
});

// 获取文件列表
app.get('/api/files', async (req, res) => {
  const { categoryId } = req.query;
  let authUser = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      authUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (e) { /* ignore */ }
  }

  let query = supabase
    .from('files')
    .select('*, categories!inner(name)')
    .order('uploaded_at', { ascending: false });

  // 非管理员只看已审核文件
  if (!authUser || (authUser.role !== 'super' && authUser.role !== 'admin')) {
    query = query.eq('status', 'approved');
  }

  if (categoryId) {
    query = query.eq('category_id', parseInt(categoryId));
  }

  const { data: files, error } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  // 展平 categories 嵌套
  const result = (files || []).map((f) => ({
    ...f,
    category_name: f.categories ? f.categories.name : ''
  }));

  res.json({ success: true, data: result });
});

// 上传文件
app.post('/api/upload', authMiddleware, adminAuthMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请选择文件' });
  }
  const { categoryId } = req.body;
  if (!categoryId) {
    return res.status(400).json({ success: false, error: '请选择分类' });
  }

  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('id', parseInt(categoryId))
    .maybeSingle();

  if (!category) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }

  const { data: created, error } = await supabase
    .from('files')
    .insert({
      category_id: parseInt(categoryId),
      filename: req.file.filename,
      original_name: req.file.originalname,
      creator: req.user.username,
      status: 'pending',
      uploaded_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  await supabase.from('activities').insert({
    type: 'upload',
    content: '上传了文件「' + req.file.originalname + '」到分类「' + category.name + '」，等待审核',
    author: req.user.username,
    related_id: created.id,
    created_at: new Date().toISOString()
  });

  res.status(201).json({ success: true, data: { id: created.id, filename: req.file.filename } });
});

// 上传音乐
app.post('/api/upload-music', authMiddleware, adminAuthMiddleware, musicUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请选择音乐文件' });
  }
  res.status(201).json({ success: true, data: { filename: req.file.filename } });
});

// 获取待审批列表（仅 super）
app.get('/api/admin/pending', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { data: files, error } = await supabase
    .from('files')
    .select('*, categories!inner(name)')
    .eq('status', 'pending')
    .order('uploaded_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const result = (files || []).map((f) => ({
    ...f,
    category_name: f.categories ? f.categories.name : ''
  }));

  res.json({ success: true, data: result });
});

// 审批通过（仅 super）
app.post('/api/admin/approve/:id', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  const { data: file } = await supabase
    .from('files')
    .select('*, categories!inner(name)')
    .eq('id', parseInt(id))
    .eq('status', 'pending')
    .maybeSingle();

  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在或已处理' });
  }

  const pendingPath = path.join(PENDING_DIR, file.filename);
  const approvedPath = path.join(APPROVED_DIR, file.filename);

  if (!fs.existsSync(pendingPath)) {
    return res.status(404).json({ success: false, error: '文件在磁盘上不存在' });
  }

  fs.renameSync(pendingPath, approvedPath);

  const now = new Date().toISOString();

  await supabase
    .from('files')
    .update({ status: 'approved', approved_at: now })
    .eq('id', parseInt(id));

  const stats = fs.statSync(approvedPath);
  updateManifest(file.filename, {
    id: file.id,
    categoryName: file.categories ? file.categories.name : '',
    creator: file.creator,
    uploaded_at: file.uploaded_at,
    size: stats.size
  });

  await supabase.from('activities').insert({
    type: 'approve',
    content: '文件「' + file.original_name + '」已通过审核',
    author: req.user.username,
    related_id: file.id,
    created_at: now
  });

  syncToGit(approvedPath, file.filename);

  res.json({ success: true, data: { id: file.id, filename: file.filename } });
});

// 拒绝审批（仅 super）
app.delete('/api/admin/reject/:id', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  const { data: file } = await supabase
    .from('files')
    .select('*')
    .eq('id', parseInt(id))
    .eq('status', 'pending')
    .maybeSingle();

  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在或已处理' });
  }

  const pendingPath = path.join(PENDING_DIR, file.filename);
  if (fs.existsSync(pendingPath)) {
    fs.unlinkSync(pendingPath);
  }

  await supabase
    .from('files')
    .update({ status: 'rejected' })
    .eq('id', parseInt(id));

  res.json({ success: true, data: { message: '文件已拒绝' } });
});

// 获取当前登录用户的上传记录
app.get('/api/my-uploads', authMiddleware, adminAuthMiddleware, async (req, res) => {
  const { data: files, error } = await supabase
    .from('files')
    .select('*, categories!inner(name)')
    .eq('creator', req.user.username)
    .order('uploaded_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const result = (files || []).map((f) => ({
    ...f,
    category_name: f.categories ? f.categories.name : ''
  }));

  res.json({ success: true, data: result });
});

// 获取动态列表
app.get('/api/activities', async (req, res) => {
  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  // 为每条动态附带评论数
  const activitiesWithComments = await Promise.all(
    (activities || []).map(async (a) => {
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', a.id);
      return { ...a, commentCount: count || 0 };
    })
  );

  res.json({ success: true, data: activitiesWithComments });
});

// 发布新动态（任何人可发布，无需登录）
app.post('/api/activities', async (req, res) => {
  const { content, author } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: '内容不能为空' });
  }
  const finalAuthor = (author && author.trim()) ? author.trim() : '匿名访客';

  const { data: created, error } = await supabase
    .from('activities')
    .insert({
      type: 'comment',
      content: content.trim(),
      author: finalAuthor,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(201).json({ success: true, data: { id: created.id } });
});

// 发表评论
app.post('/api/comments', async (req, res) => {
  const { activityId, content, author } = req.body;
  if (!activityId || !content || !content.trim()) {
    return res.status(400).json({ success: false, error: '参数不完整' });
  }

  const { data: activity } = await supabase
    .from('activities')
    .select('id')
    .eq('id', parseInt(activityId))
    .maybeSingle();

  if (!activity) {
    return res.status(404).json({ success: false, error: '动态不存在' });
  }

  const commentAuthor = (author && author.trim()) ? author.trim() : '匿名访客';

  const { data: created, error } = await supabase
    .from('comments')
    .insert({
      activity_id: parseInt(activityId),
      content: content.trim(),
      author: commentAuthor,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(201).json({ success: true, data: { id: created.id } });
});

// 获取某条动态的评论
app.get('/api/comments/:activityId', async (req, res) => {
  const { activityId } = req.params;

  const { data: comments, error } = await supabase
    .from('comments')
    .select('*')
    .eq('activity_id', parseInt(activityId))
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

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
app.get('/api/preview/:fileId', async (req, res) => {
  const { fileId } = req.params;

  const { data: file } = await supabase
    .from('files')
    .select('*, categories!inner(name)')
    .eq('id', parseInt(fileId))
    .neq('status', 'pending')
    .maybeSingle();

  if (!file) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  const filePath = path.join(APPROVED_DIR, file.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件在磁盘上不存在' });
  }

  const ext = path.extname(file.filename).toLowerCase();
  
  // 文本类文件（可读文本内容）
  const textExtensions = ['.md', '.txt', '.log', '.csv', '.xml', '.json',
                          '.html', '.htm', '.css', '.js', '.ts', '.jsx',
                          '.tsx', '.vue', '.py', '.java', '.c', '.cpp',
                          '.h', '.hpp', '.go', '.rs', '.rb', '.php', '.sql',
                          '.sh', '.bat', '.yaml', '.yml', '.toml', '.ini',
                          '.conf', '.env', '.gitignore'];
  const isTextFile = textExtensions.includes(ext);
  
  // 二进制类文件（提供下载 URL）
  const binaryExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
                            '.svg', '.bmp', '.mp3', '.wav', '.ogg', '.m4a',
                            '.flac', '.aac', '.wma', '.mp4', '.webm', '.avi',
                            '.mov', '.mkv', '.doc', '.docx', '.ppt', '.pptx',
                            '.xls', '.xlsx'];
  const isBinaryFile = binaryExtensions.includes(ext);

  let content = null;
  if (isTextFile) {
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      content = '';
    }
  }

  // 所有已审核文件都可通过 static 路径访问
  const previewUrl = '/storage/approved/' + encodeURIComponent(file.filename);

  res.json({
    success: true,
    data: {
      id: file.id,
      filename: file.original_name,
      type: ext.replace('.', ''),
      content: content,
      previewUrl: previewUrl,
      rawPath: '/storage/approved/' + file.filename
    }
  });
});

// 获取管理员列表（仅 super）
app.get('/api/admin/users', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, role')
    .order('id');

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data: users });
});

// 删除管理员（仅 super）
app.delete('/api/admin/users/:id', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', parseInt(id))
    .maybeSingle();

  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  if (user.username === 'duck') {
    return res.status(400).json({ success: false, error: '不能删除最高管理员' });
  }

  await supabase.from('users').delete().eq('id', parseInt(id));
  res.json({ success: true, data: { message: '管理员已删除' } });
});

// 提交贡献者申请（无需登录）
app.post('/api/contributors', async (req, res) => {
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

  const { data: created, error } = await supabase
    .from('contributors')
    .insert({
      type,
      name: (name || '').trim(),
      real_name: (realName || '').trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      field: (field || '').trim(),
      reason: (reason || '').trim(),
      bio: (bio || '').trim(),
      frequency: frequency || 'casual',
      status: 'pending',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.status(201).json({ success: true, data: { id: created.id } });
});

// 获取贡献者申请列表（仅 super）
app.get('/api/contributors', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { type, status } = req.query;

  let query = supabase.from('contributors').select('*');

  if (type) {
    query = query.eq('type', type);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data: list, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data: list });
});

// 审批贡献者（仅 super）
app.post('/api/contributors/:id/approve', authMiddleware, superAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  const { data: application } = await supabase
    .from('contributors')
    .select('*')
    .eq('id', parseInt(id))
    .maybeSingle();

  if (!application) {
    return res.status(404).json({ success: false, error: '申请不存在' });
  }

  await supabase
    .from('contributors')
    .update({ status: 'approved' })
    .eq('id', parseInt(id));

  res.json({ success: true, data: { message: '已通过' } });
});

// 全局错误处理
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件大小超出限制（最大10MB）' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, error: '表单字段名称不匹配，请使用正确的文件字段名' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.message === '不支持的文件类型') {
    return res.status(400).json({ success: false, error: '不支持的文件类型，请上传文档/图片/音频/视频/代码类文件' });
  }
  if (err.message === '不支持的音频格式') {
    return res.status(400).json({ success: false, error: '不支持的音频格式，仅允许：.mp3 / .wav / .ogg / .m4a / .flac' });
  }
  console.error('服务器错误:', err.message);
  res.status(500).json({ success: false, error: '服务器内部错误：' + err.message });
});

// 启动服务
seedUsers().then(() => {
  console.log('Supabase 数据库已连接');
  app.listen(PORT, () => {
    console.log("Duck's Blog 服务已启动: http://localhost:" + PORT);
  });
}).catch((err) => {
  console.error('初始化失败:', err);
  process.exit(1);
});
