-- 开放 Storage Bucket 的上传权限（anon 可以上传文件）
-- 因为前端使用 anon key 直接上传到 Storage，然后由 Edge Function 创建 DB 记录

-- 允许任何人向 blog-files 插入（上传）
INSERT INTO storage.policies (name, bucket_id, allowed_operations, definition)
SELECT
  'blog-files-public-insert',
  (SELECT id FROM storage.buckets WHERE name = 'blog-files'),
  '["INSERT"]',
  'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'blog-files-public-insert'
);

-- 允许任何人读取 blog-files
INSERT INTO storage.policies (name, bucket_id, allowed_operations, definition)
SELECT
  'blog-files-public-read',
  (SELECT id FROM storage.buckets WHERE name = 'blog-files'),
  '["SELECT"]',
  'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'blog-files-public-read'
);

-- 允许任何人向 blog-music 插入（上传）
INSERT INTO storage.policies (name, bucket_id, allowed_operations, definition)
SELECT
  'blog-music-public-insert',
  (SELECT id FROM storage.buckets WHERE name = 'blog-music'),
  '["INSERT"]',
  'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'blog-music-public-insert'
);

-- 允许任何人读取 blog-music
INSERT INTO storage.policies (name, bucket_id, allowed_operations, definition)
SELECT
  'blog-music-public-read',
  (SELECT id FROM storage.buckets WHERE name = 'blog-music'),
  '["SELECT"]',
  'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'blog-music-public-read'
);
