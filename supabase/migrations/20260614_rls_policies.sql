-- Duck's Blog RLS 策略 + 列迁移
-- 前端使用 anon key 直接访问 Supabase，RLS 控制权限

-- ===== 列迁移（为 Supabase Storage 模式新增） =====
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'unknown';

-- ===== Storage Buckets =====
-- 需要在 Supabase Dashboard > Storage 中手动创建：
-- 1. blog-files (Public bucket: 公开可读)
-- 2. blog-music (Public bucket: 公开可读)
-- 注意：上传通过 Edge Function 使用 service_role 完成，不在 Storage 层面开放匿名上传

-- ===== users 表 =====
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 禁止 anon 用户读取 users 表（密码哈希保护）
DROP POLICY IF EXISTS "users_deny_all" ON users;
CREATE POLICY "users_deny_all" ON users
  FOR ALL
  TO anon
  USING (false);

-- ===== categories 表 =====
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 任何人可读取分类
DROP POLICY IF EXISTS "categories_read_all" ON categories;
CREATE POLICY "categories_read_all" ON categories
  FOR SELECT
  TO anon
  USING (true);

-- 禁止 anon 用户直接 Insert（通过 Edge Function）
DROP POLICY IF EXISTS "categories_insert_deny" ON categories;
CREATE POLICY "categories_insert_deny" ON categories
  FOR INSERT
  TO anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "categories_delete_deny" ON categories;
CREATE POLICY "categories_delete_deny" ON categories
  FOR DELETE
  TO anon
  USING (false);

-- ===== files 表 =====
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- 任何人可以读取已审核通过的文件
DROP POLICY IF EXISTS "files_read_approved" ON files;
CREATE POLICY "files_read_approved" ON files
  FOR SELECT
  TO anon
  USING (status = 'approved');

-- 禁止 anon 用户直接修改
DROP POLICY IF EXISTS "files_insert_deny" ON files;
CREATE POLICY "files_insert_deny" ON files
  FOR INSERT
  TO anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "files_update_deny" ON files;
CREATE POLICY "files_update_deny" ON files
  FOR UPDATE
  TO anon
  USING (false);

DROP POLICY IF EXISTS "files_delete_deny" ON files;
CREATE POLICY "files_delete_deny" ON files
  FOR DELETE
  TO anon
  USING (false);

-- ===== activities 表 =====
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- 任何人可读取动态
DROP POLICY IF EXISTS "activities_read_all" ON activities;
CREATE POLICY "activities_read_all" ON activities
  FOR SELECT
  TO anon
  USING (true);

-- 任何人可发布动态
DROP POLICY IF EXISTS "activities_insert_all" ON activities;
CREATE POLICY "activities_insert_all" ON activities
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ===== comments 表 =====
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 任何人可读取评论
DROP POLICY IF EXISTS "comments_read_all" ON comments;
CREATE POLICY "comments_read_all" ON comments
  FOR SELECT
  TO anon
  USING (true);

-- 任何人可发表评论
DROP POLICY IF EXISTS "comments_insert_all" ON comments;
CREATE POLICY "comments_insert_all" ON comments
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ===== contributors 表 =====
ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;

-- 任何人可提交申请
DROP POLICY IF EXISTS "contributors_insert_all" ON contributors;
CREATE POLICY "contributors_insert_all" ON contributors
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 禁止读取他人申请
DROP POLICY IF EXISTS "contributors_read_deny" ON contributors;
CREATE POLICY "contributors_read_deny" ON contributors
  FOR SELECT
  TO anon
  USING (false);

-- ===== file_passwords 表 =====
ALTER TABLE file_passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_passwords_deny_all" ON file_passwords;
CREATE POLICY "file_passwords_deny_all" ON file_passwords
  FOR ALL
  TO anon
  USING (false);

-- ===== Storage 策略 =====
-- 任何人都可以读取 blog-files 存储桶
-- （在 Supabase Dashboard Storage 设置中配置：Public bucket）
-- 任何人都可以读取 blog-music 存储桶

-- 注意：文件上传通过 Edge Function 使用 service_role 完成
-- 不在 Storage 层面开放匿名上传，保障安全
