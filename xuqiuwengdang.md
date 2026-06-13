# Duck's Blog · Public Studio  
## 项目需求文档 （免费后端 + 自动 GitHub 同步）

**项目名称**：ducksblog26H2  
**网站名称**：Duck's Blog · Public Studio  
**域名**：`duckpublic.qd.je`（免费 CloudNS）  
**技术栈**：前端 HTML/CSS/JS + Tailwind CSS + 后端 Node.js(Express)  
**服务器**：**Render / Cyclic / Koyeb**（免费、无需信用卡）  
**存储**：GitHub 仓库作为文件存储 + 本地缓存  
**目标**：完整前后端博客系统，审批后自动 Git Push 到 GitHub 存储文件夹

---

## 一、界面与交互要求（不变）

### 1.1 进入动画
- 首先显示 **Public Studio**（淡入/缩放动画）
- 然后显示 **Duck's Blog**（完整界面）
- 最终展示博客主界面

### 1.2 布局
- 博客主界面**统一左侧**
- 右侧宽度占屏幕 **25%（1/4）**
- 配色**橘色主题**（Tailwind：orange-500/600/700）
- 所有圆角适中（rounded-lg）

### 1.3 右侧边栏内容
```
┌─────────────────────┐
│   最新上传          │
│   - 文件1 (日期)    │
│   - 文件2 (日期)    │
├─────────────────────┤
│   动态流            │
│   - 上传待审批      │
│   - 审核通过        │
│   - 新评论          │
│   [支持跟帖评论]    │
├─────────────────────┤
│   音乐播放器        │
│   [播放/暂停][下一首]│
│   当前：歌曲名      │
└─────────────────────┘
```

### 1.4 禁用调试
- 全局禁用 F12、右键菜单
- 检测开发者工具（console 清空/循环 debug）
- **最高管理员登录后自动解除限制**

---

## 二、后端架构（重点）

### 2.1 免费服务器方案
推荐 **Render.com**（免费 750 小时/月，无需信用卡）
```
https://ducksblog.onrender.com
```

备用：**Cyclic** / **Koyeb** / **Fly.io**

### 2.2 后端技术栈
```javascript
Node.js + Express + better-sqlite3 + 简单的文件系统
```

### 2.3 GitHub 存储结构
仓库：`ducksblog26H2-storage`
```
storage/
├── approved/          # 审核通过的文件
│   ├── 2024-01-15_文章1.md
│   ├── 2024-01-16_演示.pptx
│   └── music/         # 音乐文件
│       └── 歌曲.mp3
├── pending/           # 待审核文件（临时）
└── manifest.json      # 文件索引（自动更新）
```

### 2.4 审核 + Git 同步流程
```javascript
// 后端伪代码
app.post('/api/admin/approve/:id', async (req, res) => {
  // 1. 从 pending 移动文件到 approved
  fs.renameSync(pendingPath, approvedPath)
  
  // 2. 更新数据库 status='approved'
  db.prepare('UPDATE files SET status=?, approved_at=? WHERE id=?')
    .run('approved', new Date().toISOString(), id)
  
  // 3. 更新 manifest.json
  updateManifest(approvedPath)
  
  // 4. Git 提交并推送
  execSync('git add .')
  execSync(`git commit -m "approve file ${filename}"`)
  execSync('git push origin main')
  
  // 5. 记录动态
  addActivity('approve', `文件 ${filename} 已通过审核`, adminName)
  
  res.json({ success: true })
})
```

### 2.5 免费部署方案（无需信用卡）
| 平台 | 免费额度 | 是否需信用卡 | 自定义域名 |
|------|---------|-------------|-----------|
| Cyclic | 请求数限制 | ❌ 否 | ✅ 支持 |
| Koyeb | 轻度使用 | ❌ 否 | ✅ 支持 |
| Fly.io | 3个共享VM | ❌ 否 | ✅ 支持 |


---

## 三、数据存储（SQLite）

### 3.1 数据库文件 `data.db`

**categories 表**
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  creator TEXT,
  created_at TEXT
)
```

**files 表**
```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  category_id INTEGER,
  filename TEXT,
  original_name TEXT,
  path TEXT,
  creator TEXT,
  status TEXT, -- pending/approved/rejected
  uploaded_at TEXT,
  approved_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
)
```

**activities 表**
```sql
CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  type TEXT, -- upload/approve/comment
  content TEXT,
  author TEXT,
  related_id INTEGER,
  created_at TEXT
)
```

**comments 表**
```sql
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER,
  content TEXT,
  author TEXT,
  created_at TEXT,
  FOREIGN KEY (activity_id) REFERENCES activities(id)
)
```

**users 表**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT, -- 简单哈希（bcrypt）
  role TEXT -- super/admin
)
```

### 3.2 默认管理员数据
```javascript
// 初始化时插入
users: [
  { username: 'duck', password: '250901', role: 'super' },
  { username: 'admin1', password: '123123', role: 'admin' },
  { username: 'admin2', password: '123123', role: 'admin' },
  { username: 'admin3', password: '123123', role: 'admin' },
  { username: 'admin4', password: '123123', role: 'admin' }
]
```

---

## 四、API 接口文档

### 4.1 基础 URL
```
开发：http://localhost:3000
生产：https://ducksblog.onrender.com
```

### 4.2 接口列表

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/login` | 登录 | 无 |
| POST | `/api/logout` | 登出 | 登录用户 |
| GET | `/api/categories` | 获取分类 | 访客 |
| POST | `/api/categories` | 创建分类 | admin/super |
| DELETE | `/api/categories/:id` | 删除分类 | 仅 super |
| GET | `/api/files` | 获取已审核文件 | 访客 |
| POST | `/api/upload` | 上传文件 | admin/super |
| GET | `/api/admin/pending` | 待审批列表 | 仅 super |
| POST | `/api/admin/approve/:id` | 审批通过 | 仅 super |
| DELETE | `/api/admin/reject/:id` | 拒绝 | 仅 super |
| GET | `/api/activities` | 动态流 | 访客 |
| POST | `/api/comments` | 发表评论 | 访客 |
| GET | `/api/comments/:activityId` | 获取评论 | 访客 |
| GET | `/api/music` | 音乐列表 | 访客 |
| GET | `/api/preview/:fileId` | 文件预览 | 访客 |

### 4.3 请求示例

**登录**
```json
POST /api/login
{
  "username": "duck",
  "password": "250901"
}
// 返回
{
  "success": true,
  "token": "jwt_token_here",
  "role": "super"
}
```

**上传文件**
```javascript
const formData = new FormData()
formData.append('file', file)
formData.append('categoryId', 1)

fetch('/api/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
})
```

---

## 五、前端实现细节

### 5.1 目录结构
```
ducksblog26H2/
├── public/
│   ├── index.html          # 入口
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js          # 主逻辑
│   │   ├── api.js          # API 调用
│   │   ├── auth.js         # 登录/权限
│   │   ├── admin.js        # 管理界面
│   │   └── preview.js      # 文件预览
│   └── assets/
├── server.js               # 后端入口
├── package.json
├── init-db.js              # 初始化数据库
└── README.md
```

### 5.2 预览功能
- **Markdown**：使用 `marked.js`
- **Word/PPT**：使用 `Office Online` 嵌入或 `pdf.js` 转换
- 只读模式，无法编辑

### 5.3 音乐播放器
```javascript
// 从 /api/music 获取音乐列表
// 使用 HTML5 Audio 实现播放器
class MusicPlayer {
  constructor() {
    this.playlist = []
    this.currentIndex = 0
    this.audio = new Audio()
  }
  // 播放、暂停、下一首、进度条
}
```

### 5.4 禁用调试（前端）
```javascript
// 禁用右键菜单
document.addEventListener('contextmenu', (e) => {
  if (!window.isSuperAdmin) e.preventDefault()
})

// 禁用 F12
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12' && !window.isSuperAdmin) {
    e.preventDefault()
    return false
  }
  // Ctrl+Shift+I
  if (e.ctrlKey && e.shiftKey && e.key === 'I' && !window.isSuperAdmin) {
    e.preventDefault()
    return false
  }
})

// 检测开发者工具（简单版）
setInterval(() => {
  if (!window.isSuperAdmin) {
    const before = new Date()
    debugger
    const after = new Date()
    if (after - before > 100) {
      document.body.innerHTML = '开发者工具已禁用'
    }
  }
}, 1000)
```

---

## 六、部署步骤

### 6.1 Render 部署（免费）
1. 将代码推送到 GitHub 仓库
2. 登录 [Render.com](https://render.com)
3. 点击 "New +" → "Web Service"
4. 连接 GitHub 仓库
5. 配置：
   - 环境：Node
   - 构建命令：`npm install`
   - 启动命令：`node server.js`
6. 点击 "Create Web Service"
7. 设置环境变量：
   - `GITHUB_TOKEN`（你的 GitHub Personal Access Token）
   - `REPO_URL`（存储仓库地址）

### 6.2 CloudNS 域名配置
1. 在 CloudNS 添加 `duckpublic.qd.je` 域名
2. 设置 CNAME 记录指向 `ducksblog.onrender.com`
3. 等待 DNS 生效

### 6.3 GitHub Token 设置
```bash
# 生成 token（需要 repo 权限）
# 在服务器上配置 Git
git config --global user.name "ducksblog"
git config --global user.email "ducksblog@local"
git remote set-url origin https://[TOKEN]@github.com/username/repo.git
```

---

## 七、安全与限制

### 7.1 免费服务器的限制
- 冷启动：Render 免费服务 15 分钟无访问会休眠
- 唤醒时间：约 5-10 秒（可接受）
- 磁盘：临时文件系统，重启会清空
- 解决方案：使用 GitHub 作为持久存储

### 7.2 文件大小限制
- 上传限制：10MB（Render 限制）
- 大文件需分片上传或使用外部存储

### 7.3 并发限制
- 免费实例有限，建议不超过 100 人同时在线

---

## 八、交付清单（给 CodeButty）

> 请基于 v3.0 需求文档，完整实现以下内容：

### 必须实现
1. ✅ 完整前端页面（Tailwind CSS，橘色主题）
2. ✅ 后端 API（Express + SQLite）
3. ✅ 5 个管理员账号（1 super + 4 admin）
4. ✅ 文件上传（pending 目录）
5. ✅ 审批界面（super 专属）
6. ✅ 审批后自动 Git Push 到 GitHub 存储文件夹
7. ✅ 动态流 + 跟帖评论
8. ✅ 音乐播放器（扫描 GitHub 仓库 music 文件夹）
9. ✅ MD/PPT/Word 只读预览
10. ✅ 禁用 F12/右键（super 登录解除）
11. ✅ 可部署到 Render（提供部署说明）

### 代码要求
- 注释完整、清晰
- 无 AI 风格文案
- 模块化组织
- 提供 `README.md`（含部署步骤）

---
