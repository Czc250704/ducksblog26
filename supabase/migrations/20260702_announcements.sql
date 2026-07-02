-- ===== 公告弹窗表 =====
-- 最高管理员可创建公告弹窗，在首页展示，支持设定展示时间
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  display_duration INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 允许匿名查询当前有效的公告
CREATE POLICY "announcements_select_public" ON announcements
  FOR SELECT USING (
    is_active = true
    AND start_time <= NOW()
    AND end_time >= NOW()
  );

-- 只允许 service_role 写入
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
