// Duck's Blog - Supabase Edge Function
// 处理所有需要服务端权限的操作：登录、文件上传、审批、管理
import { createClient } from 'npm:@supabase/supabase-js@2';
import jwt from 'npm:jsonwebtoken@9';
import bcrypt from 'npm:bcryptjs@2';

const SUPABASE_URL = Deno.env.get('DB_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET') || 'ducksblog_secret_key_2026';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || '';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || 'czc250704/ducksblog26';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 验证 JWT 并返回用户信息
function verifyToken(token: string): { username: string; role: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { username: string; role: string };
    return payload;
  } catch {
    return null;
  }
}

// 初始化 service_role 客户端（拥有全部权限）
function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

Deno.serve(async (req: Request) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 只接受 POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: '仅支持 POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: '请求体格式错误' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { action, data } = body;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : null;
  const user = token ? verifyToken(token) : null;

  const supabase = getAdminClient();

  try {
    switch (action) {

      // ===== 登录 =====
      case 'login': {
        const { username, password } = data || body;
        if (!username || !password) {
          return jsonResponse({ success: false, error: '请输入用户名和密码' });
        }

        const { data: dbUser, error } = await supabase
          .from('users')
          .select('id, username, password, role')
          .eq('username', username)
          .maybeSingle();

        if (error || !dbUser) {
          return jsonResponse({ success: false, error: '用户名或密码错误' });
        }

        // bcrypt 验证
        const valid = bcrypt.compareSync(password, dbUser.password);
        if (!valid) {
          return jsonResponse({ success: false, error: '用户名或密码错误' });
        }

        // 签发 JWT（24小时有效）
        const token = jwt.sign(
          { username: dbUser.username, role: dbUser.role },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        return jsonResponse({
          success: true,
          data: { token, username: dbUser.username, role: dbUser.role },
        });
      }

      // ===== 创建分类 =====
      case 'create-category': {
        if (!user) return unauthorized();
        const { name } = data || body;
        if (!name || !name.trim()) {
          return jsonResponse({ success: false, error: '请输入分类名称' });
        }

        // 检查是否已存在
        const { data: existing } = await supabase
          .from('categories')
          .select('id')
          .eq('name', name.trim())
          .maybeSingle();

        if (existing) {
          return jsonResponse({ success: false, error: '分类已存在' });
        }

        const { data: cat, error } = await supabase
          .from('categories')
          .insert({
            name: name.trim(),
            creator: user.username,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });

        // 记录动态
        await supabase.from('activities').insert({
          type: 'upload',
          content: `创建了分类「${name.trim()}」`,
          author: user.username,
          created_at: new Date().toISOString(),
        });

        return jsonResponse({ success: true, data: cat });
      }

      // ===== 删除分类 =====
      case 'delete-category': {
        if (!user) return unauthorized();
        const { id } = data || body;
        if (!id) return jsonResponse({ success: false, error: '缺少分类 ID' });

        // 删除分类下所有文件
        await supabase.from('files').delete().eq('category_id', id);

        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: { id } });
      }

      // ===== 创建文件记录（Storage 上传完成后调用） =====
      case 'create-file-record': {
        if (!user) return unauthorized();
        const { filename, originalName, categoryId, storagePath, size, fileType } = data || body;
        if (!filename || !categoryId || !storagePath) {
          return jsonResponse({ success: false, error: '缺少必要参数' });
        }

        const { data: file, error } = await supabase
          .from('files')
          .insert({
            category_id: parseInt(categoryId),
            filename: filename,
            original_name: originalName || filename,
            creator: user.username,
            status: 'pending',
            uploaded_at: new Date().toISOString(),
            storage_path: storagePath,
            size: size || 0,
            file_type: fileType || 'unknown',
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });

        // 记录动态
        await supabase.from('activities').insert({
          type: 'upload',
          content: `上传了文件「${originalName || filename}」`,
          author: user.username,
          related_id: file.id,
          created_at: new Date().toISOString(),
        });

        return jsonResponse({ success: true, data: file });
      }

      // ===== 创建音乐记录（Storage 上传完成后调用） =====
      case 'create-music-record': {
        if (!user) return unauthorized();
        const { name, storagePath, size } = data || body;
        if (!name || !storagePath) {
          return jsonResponse({ success: false, error: '缺少必要参数' });
        }

        // 确保存在「音乐」分类，没有则自动创建
        let { data: musicCat } = await supabase
          .from('categories')
          .select('id')
          .eq('name', '音乐')
          .maybeSingle();
        
        if (!musicCat) {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ name: '音乐', creator: user.username, created_at: new Date().toISOString() })
            .select('id')
            .single();
          musicCat = newCat;
        }

        const { data: music, error } = await supabase
          .from('files')
          .insert({
            category_id: musicCat.id,
            filename: name,
            original_name: name,
            creator: user.username,
            status: 'approved',
            uploaded_at: new Date().toISOString(),
            approved_at: new Date().toISOString(),
            storage_path: storagePath,
            size: size || 0,
            file_type: 'music',
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: music });
      }

      // ===== 获取待审批文件 =====
      case 'get-pending': {
        if (!user || user.role !== 'super') return forbidden();

        const { data: files, error } = await supabase
          .from('files')
          .select('*, categories(name)')
          .eq('status', 'pending')
          .order('uploaded_at', { ascending: false });

        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({
          success: true,
          data: files.map((f: any) => ({
            ...f,
            category_name: f.categories?.name || '',
          })),
        });
      }

      // ===== 审批通过（同步文件到 GitHub，释放 Storage 空间） =====
      case 'approve-file': {
        if (!user || user.role !== 'super') return forbidden();
        const { id } = data || body;
        if (!id) return jsonResponse({ success: false, error: '缺少文件 ID' });

        // 获取文件完整信息
        const { data: fileRecord } = await supabase
          .from('files')
          .select('*')
          .eq('id', parseInt(id))
          .single();

        if (!fileRecord) return jsonResponse({ success: false, error: '文件不存在' });

        let githubUrl = '';
        let syncNote = '';

        // 如果配置了 GitHub Token，尝试上传到 GitHub
        if (GITHUB_TOKEN && fileRecord.storage_path) {
          try {
            // 从 Supabase Storage 下载文件
            const { data: fileBlob, error: downloadErr } = await supabase.storage
              .from('blog-files')
              .download(fileRecord.storage_path);

            if (!downloadErr && fileBlob) {
              const buffer = await fileBlob.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

              // 推送到 GitHub：storage/approved/ 目录
              const dateStr = new Date().toISOString().slice(0, 10);
              const githubPath = `storage/approved/${dateStr}_${fileRecord.original_name}`;

              const ghRes = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}`,
                {
                  method: 'PUT',
                  headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.github.v3+json',
                  },
                  body: JSON.stringify({
                    message: `approve: ${fileRecord.original_name}`,
                    content: base64,
                    branch: 'main',
                  }),
                }
              );

              if (ghRes.ok) {
                const ghData = await ghRes.json();
                githubUrl = ghData.content?.download_url || '';
                syncNote = '已同步到 GitHub';

                // 从 Supabase Storage 删除，释放空间
                await supabase.storage
                  .from('blog-files')
                  .remove([fileRecord.storage_path]);
              }
            }
          } catch (gitErr) {
            console.error('GitHub 同步失败，文件保留在 Supabase:', gitErr);
            syncNote = 'GitHub 同步暂未成功，待网络畅通时自动重试';
          }
        }

        // 更新数据库记录
        const updateData: any = {
          status: 'approved',
          approved_at: new Date().toISOString(),
        };
        if (githubUrl) {
          updateData.storage_path = githubUrl; // 改为 GitHub URL
        }

        const { error: updateErr } = await supabase
          .from('files')
          .update(updateData)
          .eq('id', parseInt(id));

        if (updateErr) return jsonResponse({ success: false, error: updateErr.message });

        // 记录动态
        await supabase.from('activities').insert({
          type: 'approve',
          content: `审批通过了「${fileRecord.original_name}」${syncNote ? '（' + syncNote + '）' : ''}`,
          author: user.username,
          related_id: parseInt(id),
          created_at: new Date().toISOString(),
        });

        return jsonResponse({ success: true, data: { id, status: 'approved', syncNote } });
      }

      // ===== 拒绝文件 =====
      case 'reject-file': {
        if (!user || user.role !== 'super') return forbidden();
        const { id } = data || body;
        if (!id) return jsonResponse({ success: false, error: '缺少文件 ID' });

        // 删除 Storage 中的文件
        const { data: f } = await supabase.from('files').select('storage_path').eq('id', parseInt(id)).single();
        if (f?.storage_path) {
          await supabase.storage.from('blog-files').remove([f.storage_path]);
        }

        const { error } = await supabase.from('files').delete().eq('id', parseInt(id));
        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: { id, status: 'rejected' } });
      }

      // ===== 我的上传 =====
      case 'get-my-uploads': {
        if (!user) return unauthorized();

        const { data: files, error } = await supabase
          .from('files')
          .select('*, categories(name)')
          .eq('creator', user.username)
          .order('uploaded_at', { ascending: false });

        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({
          success: true,
          data: files.map((f: any) => ({
            ...f,
            category_name: f.categories?.name || '',
          })),
        });
      }

      // ===== 获取管理员列表 =====
      case 'get-users': {
        if (!user || user.role !== 'super') return forbidden();

        const { data: users, error } = await supabase
          .from('users')
          .select('id, username, role, created_at')
          .order('id');

        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: users });
      }

      // ===== 删除管理员 =====
      case 'delete-user': {
        if (!user || user.role !== 'super') return forbidden();
        const { id } = data || body;
        if (!id) return jsonResponse({ success: false, error: '缺少用户 ID' });

        // 不允许删除 duck
        const { data: target } = await supabase.from('users').select('username').eq('id', parseInt(id)).single();
        if (target?.username === 'duck') {
          return jsonResponse({ success: false, error: '不能删除最高管理员 duck' });
        }

        const { error } = await supabase.from('users').delete().eq('id', parseInt(id));
        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: { id } });
      }

      // ===== 提交贡献者申请 =====
      case 'submit-contributor': {
        const contributorData = data || body;

        const { data: record, error } = await supabase
          .from('contributors')
          .insert({
            ...contributorData,
            status: 'pending',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({ success: true, data: record });
      }

      default:
        return jsonResponse({ success: false, error: `未知操作：${action}` }, 400);
    }
  } catch (err: any) {
    console.error('Edge Function 错误:', err);
    return jsonResponse({ success: false, error: '服务器内部错误：' + err.message }, 500);
  }
});

// JSON 响应辅助函数
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return jsonResponse({ success: false, error: 'unauthorized', code: 401 }, 401);
}

function forbidden() {
  return jsonResponse({ success: false, error: '权限不足', code: 403 }, 403);
}
