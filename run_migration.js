// 通过 Supabase 管理 API 执行数据库迁移
const sql = `
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

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select_public" ON announcements
  FOR SELECT USING (
    is_active = true
    AND start_time <= NOW()
    AND end_time >= NOW()
  );
`;

const PROJECT_REF = 'bwsgplhiiwldhrxztkld';
const TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJteWZFenA3ODNLaV9KQ3g4Vm5jM1hfaXg2alpyYjZDZjVPTWtHWk1QSTNzIn0.eyJleHAiOjE4MTQ0OTg1NDQsImlhdCI6MTc4Mjk2NzQwOSwiYXV0aF90aW1lIjoxNzgyOTYyNTQyLCJqdGkiOiJiMWY4NDY4MS1kNThmLTQ0ZWItODEzNy03MTRkN2I1ZDE3ZGQiLCJpc3MiOiJodHRwczovL3d3dy5jb2RlYnVkZHkuY24vYXV0aC9yZWFsbXMvY29waWxvdCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiI3NGNiNjlhZS0zN2NlLTQ1OWMtYmVkNC1jMDlkODYyZGE3ZDMiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJjb25zb2xlIiwic2lkIjoiYWI1ODAxODAtMWQ0OC00ODc4LWJhMjQtOWQyNzZlNzQxZTc3IiwiYWNyIjoiMCIsImFsbG93ZWQtb3JpZ2lucyI6WyIqIl0sInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJkZWZhdWx0LXJvbGVzIiwib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgb2ZmbGluZV9hY2Nlc3MgZW1haWwiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5pY2tuYW1lIjoiRHVja3ZpZGVvZ3JhcGh5IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMTM4MTkzMjMyODcifQ.sxmervuRqFj80cYEHmcgeoS_O_CH1L4lFR3-vamUHl5XgcoZ7bkVkKrdXTssIlg_w2nV8edn7xLKld6aZ90_BR_NtNrmwIGcpkVs-fZGacaHeEYKKLw_3pI5wuXb4HXpsMzSTnCVjNHbs0oI3D2Q_JKGwLUI1hS3u9lRqtU7BJdVmgU-yhJBmKNZVrojZZwcBluQPM5J1FDbuQcqp7zgeOQaxULjXxLFXacQARQ6ZDdu2upF0EBaAuimWc7M3H-vuYvUJGCVMZQO6PgReDPG1zsQwg3TRECX7oLx8y1fpiAk_GnE1maJkObbF4ciKFKCneJqeThevRhrtdZAd2dJpg';

async function main() {
  try {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const result = await resp.json();
    if (resp.ok) {
      console.log('迁移执行成功!');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('迁移失败:', resp.status, result);
    }
  } catch (err) {
    console.error('请求失败:', err.message);
  }
}

main();
