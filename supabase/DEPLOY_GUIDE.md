# Duck's Blog · 手动部署完整教程

本教程将引导你一步步完成 Supabase 后端 + GitHub Pages 前端的部署。

---

## 前置条件

- 一个 [Supabase](https://supabase.com) 账号（已注册）
- 一个 GitHub 账号
- 本项目的 GitHub 仓库已创建

---

## 第一步：创建 Supabase Storage Buckets

### 1.1 打开 Supabase 控制台

访问 https://supabase.com/dashboard 并登录。

### 1.2 选择项目

点击项目 **bwsgplhiiwldhrxztkld**（Duck's Blog 项目）。

### 1.3 进入 Storage 页面

左侧菜单栏 → 点击 **Storage**。

### 1.4 创建 blog-files Bucket

1. 点击页面右上角的 **「New bucket」** 按钮
2. 在弹出的窗口中填写：
   - **Name of bucket**: `blog-files`
   - **Public bucket**: **勾选（开启）**  这一步很重要
3. 点击 **「Create bucket」** 按钮

### 1.5 创建 blog-music Bucket

1. 再次点击 **「New bucket」** 按钮
2. 填写：
   - **Name of bucket**: `blog-music`
   - **Public bucket**:  勾选（开启）
3. 点击 **「Create bucket」** 按钮

完成后你应该看到两个 bucket：`blog-files` 和 `blog-music`。

---

## 第二步：执行数据库 SQL（RLS 策略 + 列迁移）

### 2.1 打开 SQL Editor

左侧菜单栏 → 点击 **SQL Editor**。

### 2.2 点击 New query

点击右上角 **「New query」** 按钮，创建一个新的查询窗口。

### 2.3 粘贴 SQL

打开本项目的 `supabase/migrations/20260614_rls_policies.sql` 文件，**完整复制**全部内容，粘贴到 SQL Editor 的查询窗口中。

### 2.4 执行

点击右下角的 **「Run」** 按钮（或按 `Ctrl + Enter`）。

### 2.5 确认执行成功

如果看到绿色的 "Success. No rows returned" 提示，说明 SQL 执行成功。如果出现红色错误，请截图发给开发者排查。

### 2.6 检查数据库表是否存在

在左侧菜单栏点击 **Table Editor**，确认能看到以下表：

- `users`
- `categories`
- `files`
- `activities`
- `comments`
- `contributors`
- `file_passwords`

如果某些表不存在，说明之前 server.js 没有初始化成功，需要手动创建。你可能需要重新运行一次 `node server.js`（它会自动建表），然后再检查。

---

## 第三步：安装 Supabase CLI 并部署 Edge Function

### 3.1 安装 Supabase CLI

打开 **PowerShell**（以管理员身份运行），执行：

```powershell
npm install -g supabase
```

安装完成后验证：

```powershell
supabase --version
```

应该显示版本号（如 `1.x.x`）。

### 3.2 登录 Supabase

```powershell
supabase login
```

执行后会弹出一个浏览器窗口，要求你授权 Supabase CLI 访问你的账号。点击 **「Authorize」** 即可。授权成功后命令行会显示 "Logged in successfully"。

### 3.3 链接到你的 Supabase 项目

```powershell
cd c:\Users\xsh33\Desktop\ducksblog26
supabase link --project-ref bwsgplhiiwldhrxztkld
```

执行后会提示输入数据库密码。数据库密码在 Supabase Dashboard → Settings → Database → Database password 中可以查看和重置。

如果忘记密码，去 Dashboard 的 Settings → Database 页面点击 **Reset database password** 重新设置一个。

### 3.4 获取 service_role 密钥

1. 在 Supabase Dashboard → 左侧菜单 **Settings** → **API**
2. 找到 **Project API keys** 区域
3. 你会看到：
   - `anon` / `public` — 这个是前端用的，已经在代码里了
   - `service_role` — 这个需要**保密**，用于 Edge Function
4. 点击 `service_role` 旁边的 **复制** 按钮，复制这个密钥（以 `eyJ...` 开头的一长串字符）

### 3.5 设置 Edge Function 的环境变量

```powershell
supabase secrets set SUPABASE_URL=https://bwsgplhiiwldhrxztkld.supabase.co
```

```powershell
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=粘贴你刚才复制的service_role密钥
```

注意：`SUPABASE_SERVICE_ROLE_KEY=` 后面直接粘贴密钥，不要加引号。

```powershell
supabase secrets set JWT_SECRET=ducksblog_secret_key_2026
```

### 3.6 部署 Edge Function

```powershell
supabase functions deploy api
```

等待部署完成。成功后你应该看到类似这样的输出：

```
Deployed Functions on project bwsgplhiiwldhrxztkld: api
You can inspect your deployment in the Dashboard: https://supabase.com/dashboard/project/bwsgplhiiwldhrxztkld/functions
```

Edge Function 的访问地址是：
```
https://bwsgplhiiwldhrxztkld.supabase.co/functions/v1/api
```

### 3.7 验证 Edge Function 是否正常

在浏览器中打开：
```
https://bwsgplhiiwldhrxztkld.supabase.co/functions/v1/api/health
```

如果看到 `{"success":true}` 说明部署成功。

---

## 第四步：GitHub Pages 部署

### 4.1 确保所有代码已推送到 GitHub

```powershell
cd c:\Users\xsh33\Desktop\ducksblog26
git add .
git commit -m "migrate to GitHub Pages + Supabase architecture"
git push origin main
```

### 4.2 设置 GitHub Pages Source

1. 打开你的 GitHub 仓库页面（浏览器）
2. 点击顶部 **Settings** 标签
3. 左侧菜单点击 **Pages**（在 "Code and automation" 分组下）
4. 在 **Build and deployment** 区域：
   - **Source**: 选择 **"GitHub Actions"**（下拉菜单中选择）

### 4.3 触发部署

每次推送到 `main` 分支都会自动触发部署。如果还没有自动触发，可以在 GitHub 仓库页面：
1. 点击 **Actions** 标签
2. 左侧找到 **"Deploy to GitHub Pages"** 工作流
3. 点击 **"Run workflow"** → **"Run workflow"** 手动触发

### 4.4 查看部署状态

在 Actions 页面可以看到部署进度。部署成功后：
1. 回到 Settings → Pages
2. 页面顶部会显示你的 GitHub Pages 地址，类似：
   ```
   Your site is live at https://你的用户名.github.io/ducksblog26/
   ```

### 4.5 自定义域名（可选）

如果你有域名 `duckpublic.qd.je`：

1. 在 Settings → Pages → **Custom domain** 中填写 `duckpublic.qd.je`
2. 在你的域名 DNS 提供商处添加一条 CNAME 记录：
   - **类型**: CNAME
   - **名称**: duckpublic（或 @，取决于你的域名配置）
   - **值**: `你的用户名.github.io`
3. 勾选 **"Enforce HTTPS"**（生效需要一些时间）

---

## 第五步：最终验证

### 5.1 打开网站

访问你的 GitHub Pages 地址，你应该能看到 Duck's Blog 首页。

### 5.2 测试访客功能

- [ ] 能看到左侧文件列表和右侧边栏
- [ ] 能看到动态、评论
- [ ] 点击文件可以预览（MD/TXT 类型）

### 5.3 测试管理员登录

1. 点击首页的 **「管理员入口」**
2. 输入账号 `duck` 密码 `250901`
3. 应该登录成功，进入管理界面

### 5.4 测试文件上传

1. 在管理界面中创建一个分类
2. 上传一个 .md 或 .txt 文件
3. 切换到最高管理员（duck）审批该文件
4. 回到首页确认文件可见

### 5.5 测试调试限制

- [ ] 普通访客按 F12 应该无效
- [ ] 右键菜单应该无效
- [ ] 用 duck 登录后，F12 和右键恢复正常

---

## 常见问题排查

### Q1: Edge Function 部署后访问返回 404

可能是 function 名称不匹配。确认部署时使用的名称是 `api`：
```powershell
supabase functions list   # 查看已部署的 functions
```

### Q2: 前端页面加载但看不到任何数据

打开浏览器 F12 Console（需先用 duck 登录解除限制），检查：
- 是否有红色报错信息
- Supabase URL 和 anon key 是否正确（在 `api.js` 文件开头已硬编码）

### Q3: 文件上传失败

检查：
1. Storage bucket 是否设为 **Public**
2. bucket 名称是否完全为 `blog-files` 和 `blog-music`
3. Edge Function 的 service_role 密钥是否正确

### Q4: GitHub Pages 部署后页面 404

检查 Settings → Pages 是否选择了 GitHub Actions 作为 Source，以及 Actions 工作流是否成功运行。

---

## 部署所需信息汇总

| 项目 | 值 |
|------|-----|
| Supabase 项目 ID | `bwsgplhiiwldhrxztkld` |
| Supabase URL | `https://bwsgplhiiwldhrxztkld.supabase.co` |
| Supabase Anon Key | 已在 `api.js` 中配置 |
| Edge Function URL | `https://bwsgplhiiwldhrxztkld.supabase.co/functions/v1/api` |
| JWT Secret | `ducksblog_secret_key_2026` |
| Storage Buckets | `blog-files`（Public）, `blog-music`（Public） |
| 管理员账号 | duck / 250901（super），admin1~4 / 123123（admin） |
