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

      // ===== 创建公告（仅 super） =====
      case 'create-announcement': {
        if (!user || user.role !== 'super') return forbidden();
        const { title, content, startTime, endTime, displayDuration } = data || body;
        if (!title || !title.trim() || !content || !content.trim()) {
          return jsonResponse({ success: false, error: '标题和内容不能为空' });
        }
        if (!startTime || !endTime) {
          return jsonResponse({ success: false, error: '请设置展示起止时间' });
        }

        const { data: ann, error } = await supabase
          .from('announcements')
          .insert({
            title: title.trim(),
            content: content.trim(),
            start_time: startTime,
            end_time: endTime,
            display_duration: displayDuration || 10,
            is_active: true,
            created_by: user.username,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: ann });
      }

      // ===== 获取所有公告（仅 super，含管理） =====
      case 'get-announcements': {
        if (!user || user.role !== 'super') return forbidden();

        const { data: list, error } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: list });
      }

      // ===== 删除公告（仅 super） =====
      case 'delete-announcement': {
        if (!user || user.role !== 'super') return forbidden();
        const { id } = data || body;
        if (!id) return jsonResponse({ success: false, error: '缺少公告ID' });

        const { error } = await supabase.from('announcements').delete().eq('id', parseInt(id));
        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: { id } });
      }

      // ===== 获取当前有效的公告（公开） =====
      case 'get-active-announcement': {
        const now = new Date().toISOString();
        const { data: list, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('is_active', true)
          .lte('start_time', now)
          .gte('end_time', now)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: list && list.length > 0 ? list[0] : null });
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

      // ===== 获取分类列表（公开） =====
      case 'get-categories': {
        const { data: categories, error } = await supabase
          .from('categories')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: categories });
      }

      // ===== 获取文件列表（访客只看已审核） =====
      case 'get-files': {
        const { categoryId } = data || {};
        const isAdmin = user && (user.role === 'super' || user.role === 'admin');

        let query = supabase
          .from('files')
          .select('*, categories!inner(name)')
          .order('uploaded_at', { ascending: false });

        if (!isAdmin) {
          query = query.eq('status', 'approved');
        }

        if (categoryId) {
          query = query.eq('category_id', parseInt(categoryId));
        }

        const { data: files, error } = await query;
        if (error) return jsonResponse({ success: false, error: error.message });

        return jsonResponse({
          success: true,
          data: (files || []).map((f: any) => ({
            ...f,
            category_name: f.categories?.name || '',
          })),
        });
      }

      // ===== 获取音乐列表 =====
      case 'get-music': {
        const { data: music, error } = await supabase
          .from('files')
          .select('*')
          .eq('file_type', 'music')
          .eq('status', 'approved')
          .order('uploaded_at', { ascending: false });

        if (error) return jsonResponse({ success: false, error: error.message });

        // 为每条音乐生成公开 URL
        const result = (music || []).map((m: any) => {
          let url = '';
          if (m.storage_path) {
            if (m.storage_path.startsWith('https://')) {
              url = m.storage_path;
            } else {
              const { data: urlData } = supabase.storage
                .from('blog-music')
                .getPublicUrl(m.storage_path);
              url = urlData?.publicUrl || '';
            }
          }
          return {
            id: m.id,
            name: m.original_name,
            url: url,
          };
        });

        return jsonResponse({ success: true, data: result });
      }

      // ===== 获取动态列表（含评论数） =====
      case 'get-activities': {
        const { data: activities, error } = await supabase
          .from('activities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) return jsonResponse({ success: false, error: error.message });

        const activitiesWithCounts = await Promise.all(
          (activities || []).map(async (a: any) => {
            const { count } = await supabase
              .from('comments')
              .select('*', { count: 'exact', head: true })
              .eq('activity_id', a.id);
            return { ...a, commentCount: count || 0 };
          })
        );

        return jsonResponse({ success: true, data: activitiesWithCounts });
      }

      // ===== 创建动态（无需登录） =====
      case 'create-activity': {
        const { content, author } = data || {};
        if (!content || !content.trim()) {
          return jsonResponse({ success: false, error: '内容不能为空' });
        }
        const finalAuthor = (author && author.trim()) ? author.trim() : '匿名访客';

        const { data: created, error } = await supabase
          .from('activities')
          .insert({
            type: 'comment',
            content: content.trim(),
            author: finalAuthor,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: { id: created.id } });
      }

      // ===== 获取评论 =====
      case 'get-comments': {
        const { activityId } = data || {};
        if (!activityId) return jsonResponse({ success: false, error: '缺少活动ID' });

        const { data: comments, error } = await supabase
          .from('comments')
          .select('*')
          .eq('activity_id', parseInt(activityId))
          .order('created_at', { ascending: true });

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: comments });
      }

      // ===== 创建评论（无需登录） =====
      case 'create-comment': {
        const { activityId, content, author } = data || {};
        if (!activityId || !content || !content.trim()) {
          return jsonResponse({ success: false, error: '参数不完整' });
        }

        const { data: activity } = await supabase
          .from('activities')
          .select('id')
          .eq('id', parseInt(activityId))
          .maybeSingle();

        if (!activity) return jsonResponse({ success: false, error: '动态不存在' });

        const commentAuthor = (author && author.trim()) ? author.trim() : '匿名访客';

        const { data: created, error } = await supabase
          .from('comments')
          .insert({
            activity_id: parseInt(activityId),
            content: content.trim(),
            author: commentAuthor,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: { id: created.id } });
      }

      // ===== 文件预览 =====
      case 'preview-file': {
        const { fileId } = data || {};
        if (!fileId) return jsonResponse({ success: false, error: '缺少文件ID' });

        const { data: file } = await supabase
          .from('files')
          .select('*, categories!inner(name)')
          .eq('id', parseInt(fileId))
          .neq('status', 'pending')
          .maybeSingle();

        if (!file) return jsonResponse({ success: false, error: '文件不存在' }, 404);

        const ext = (file.file_type || file.filename?.split('.').pop() || '').toLowerCase();
        const textExtensions = ['md', 'txt', 'log', 'csv', 'xml', 'json', 'html', 'htm', 'css', 'js', 'ts',
          'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sql', 'sh',
          'bat', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'gitignore'];

        const isTextFile = textExtensions.includes(ext);
        let content: string | null = null;

        // 尝试读取文件内容
        if (isTextFile && file.storage_path) {
          try {
            if (file.storage_path.startsWith('https://')) {
              const resp = await fetch(file.storage_path);
              if (resp.ok) content = await resp.text();
            } else {
              const { data: blob } = await supabase.storage
                .from(file.file_type === 'music' ? 'blog-music' : 'blog-files')
                .download(file.storage_path);
              if (blob) content = await blob.text();
            }
          } catch (e) {}
        }

        // 生成预览/下载 URL
        let previewUrl = '';
        if (file.storage_path) {
          if (file.storage_path.startsWith('https://')) {
            previewUrl = file.storage_path;
          } else {
            const bucket = file.file_type === 'music' ? 'blog-music' : 'blog-files';
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(file.storage_path);
            previewUrl = urlData?.publicUrl || '';
          }
        }

        return jsonResponse({
          success: true,
          data: {
            id: file.id,
            filename: file.original_name,
            type: ext,
            content: content,
            previewUrl: previewUrl,
          },
        });
      }

      // ===== 获取贡献者申请列表 =====
      case 'get-contributors': {
        if (!user || user.role !== 'super') return forbidden();
        const { type, status } = data || {};

        let query = supabase.from('contributors').select('*');
        if (type) query = query.eq('type', type);
        if (status) query = query.eq('status', status);

        const { data: list, error } = await query.order('created_at', { ascending: false });
        if (error) return jsonResponse({ success: false, error: error.message });
        return jsonResponse({ success: true, data: list });
      }

      // ===== 审批贡献者 =====
      case 'approve-contributor': {
        if (!user || user.role !== 'super') return forbidden();
        const { id } = data || {};
        if (!id) return jsonResponse({ success: false, error: '缺少申请ID' });

        const { data: application } = await supabase
          .from('contributors')
          .select('*')
          .eq('id', parseInt(id))
          .maybeSingle();

        if (!application) return jsonResponse({ success: false, error: '申请不存在' }, 404);

        await supabase.from('contributors').update({ status: 'approved' }).eq('id', parseInt(id));
        return jsonResponse({ success: true, data: { message: '已通过' } });
      }

      // ===== Git 状态 =====
      case 'git-status': {
        if (!user || user.role !== 'super') return forbidden();
        if (!GITHUB_TOKEN) {
          return jsonResponse({ success: true, data: { configured: false, message: '未配置 GITHUB_TOKEN' } });
        }

        try {
          // 获取 GitHub 远程文件列表
          const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/storage/approved`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ducksblog' },
          });

          const githubNames = new Set<string>();
          if (ghResp.ok) {
            const items = await ghResp.json() as any[];
            items.filter((i: any) => i.type === 'file').forEach((i: any) => githubNames.add(i.name));
          }

          // 获取本地已审批文件
          const { data: localApproved } = await supabase
            .from('files')
            .select('id, filename, original_name, creator, approved_at')
            .eq('status', 'approved');

          const localByName: Record<string, any> = {};
          const localNames = new Set<string>();
          (localApproved || []).forEach((f: any) => { localByName[f.filename] = f; localNames.add(f.filename); });

          const toPush: any[] = [];
          localNames.forEach((name) => {
            if (!githubNames.has(name)) {
              const lf = localByName[name];
              toPush.push({ name, creator: lf.creator, approved_at: lf.approved_at });
            }
          });

          const inSync: any[] = [];
          localNames.forEach((name) => {
            if (githubNames.has(name)) inSync.push({ name, creator: localByName[name].creator });
          });

          const count = { toPush: toPush.length, inSync: inSync.length };

          return jsonResponse({
            success: true,
            data: { configured: true, branch: 'main', toPush, inSync, stats: count },
          });
        } catch (e: any) {
          return jsonResponse({ success: false, error: '获取 Git 状态失败: ' + e.message });
        }
      }

      // ===== Git 推送 =====
      case 'git-push': {
        if (!user || user.role !== 'super') return forbidden();
        if (!GITHUB_TOKEN) return jsonResponse({ success: false, error: '未配置 GITHUB_TOKEN' });

        try {
          // 获取远程文件列表
          const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/storage/approved`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ducksblog' },
          });

          const githubNames = new Set<string>();
          if (ghResp.ok) {
            const items = await ghResp.json() as any[];
            items.filter((i: any) => i.type === 'file').forEach((i: any) => githubNames.add(i.name));
          }

          // 本地已审批文件
          const { data: localApproved } = await supabase
            .from('files')
            .select('id, filename, original_name, storage_path, file_type')
            .eq('status', 'approved');

          let pushed = 0;
          let skipped = 0;

          for (const f of localApproved || []) {
            if (githubNames.has(f.filename)) { skipped++; continue; }
            if (!f.storage_path) { skipped++; continue; }

            // 下载文件内容
            let fileBuffer: ArrayBuffer | null = null;

            if (f.storage_path.startsWith('https://')) {
              const resp = await fetch(f.storage_path);
              if (resp.ok) fileBuffer = await resp.arrayBuffer();
            } else {
              const bucket = f.file_type === 'music' ? 'blog-music' : 'blog-files';
              const { data: blob } = await supabase.storage.from(bucket).download(f.storage_path);
              if (blob) fileBuffer = await blob.arrayBuffer();
            }

            if (!fileBuffer) { skipped++; continue; }

            const uint8 = new Uint8Array(fileBuffer);
            const binary = Array.from(uint8).map(b => String.fromCharCode(b)).join('');
            const base64 = btoa(binary);

            const ghPushResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/storage/approved/${f.filename}`, {
              method: 'PUT',
              headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'ducksblog' },
              body: JSON.stringify({ message: `approve: ${f.original_name}`, content: base64, branch: 'main' }),
            });

            if (ghPushResp.ok) pushed++;
            else skipped++;
          }

          return jsonResponse({
            success: true,
            data: { pushed, skipped, message: `推送完成: 推送 ${pushed} 个, 跳过 ${skipped} 个` },
          });
        } catch (e: any) {
          return jsonResponse({ success: false, error: '推送失败: ' + e.message });
        }
      }

      // ===== Git 拉取 =====
      case 'git-pull': {
        if (!user || user.role !== 'super') return forbidden();
        const { categoryId } = data || {};
        if (!categoryId) return jsonResponse({ success: false, error: '请选择目标分类' });

        const { data: category } = await supabase
          .from('categories')
          .select('id')
          .eq('id', parseInt(categoryId))
          .maybeSingle();

        if (!category) return jsonResponse({ success: false, error: '分类不存在' }, 404);

        try {
          const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/storage/approved`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ducksblog' },
          });

          const githubFiles: any[] = ghResp.ok ? (await ghResp.json()).filter((i: any) => i.type === 'file') : [];

          const { data: localFiles } = await supabase.from('files').select('filename').eq('status', 'approved');
          const localFilenames = new Set((localFiles || []).map((f: any) => f.filename));

          let imported = 0;
          let skipped = 0;

          for (const gf of githubFiles) {
            if (localFilenames.has(gf.name)) { skipped++; continue; }

            // 下载文件到 Supabase Storage
            const fileResp = await fetch(gf.download_url);
            if (!fileResp.ok) continue;
            const fileBlob = await fileResp.blob();

            const storagePath = gf.name;
            const { error: uploadErr } = await supabase.storage
              .from('blog-files')
              .upload(storagePath, fileBlob, { upsert: true });

            if (uploadErr) continue;

            const { error: dbErr } = await supabase.from('files').insert({
              category_id: parseInt(categoryId),
              filename: gf.name,
              original_name: gf.name,
              creator: 'github',
              status: 'approved',
              uploaded_at: new Date().toISOString(),
              approved_at: new Date().toISOString(),
              storage_path: storagePath,
              size: gf.size || 0,
              file_type: gf.name.split('.').pop() || '',
            });

            if (!dbErr) {
              await supabase.from('activities').insert({
                type: 'approve',
                content: `从 GitHub 拉取了文件「${gf.name}」到分类「${categoryId}」`,
                author: user.username,
                created_at: new Date().toISOString(),
              });
              imported++;
            }
          }

          return jsonResponse({
            success: true,
            data: { imported, skipped, message: `拉取完成: 导入 ${imported} 个, 跳过 ${skipped} 个` },
          });
        } catch (e: any) {
          return jsonResponse({ success: false, error: '拉取失败: ' + e.message });
        }
      }

      // ===== Git 提交日志 =====
      case 'git-log': {
        if (!user || user.role !== 'super') return forbidden();

        try {
          const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&per_page=15`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ducksblog' },
          });

          if (!ghResp.ok) return jsonResponse({ success: true, data: [] });

          const commits = (await ghResp.json() as any[]).map((c: any) => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message,
            author: c.commit.author.name,
            date: c.commit.author.date,
          }));

          return jsonResponse({ success: true, data: commits });
        } catch (e: any) {
          return jsonResponse({ success: false, error: '获取提交日志失败: ' + e.message });
        }
      }

      // ===== 文件代理下载（解决浏览器 CORS / 跨域问题） =====
      case 'proxy-file': {
        const fileId = data?.fileId || (body as any)?.fileId;
        if (!fileId) return jsonResponse({ success: false, error: '缺少文件ID' }, 400);

        const { data: fileRecord, error: dbError } = await supabase
          .from('files')
          .select('*')
          .eq('id', parseInt(fileId))
          .eq('status', 'approved')
          .single();

        if (dbError || !fileRecord) return jsonResponse({ success: false, error: '文件不存在' }, 404);

        let fileContent: Uint8Array | null = null;
        const sp = fileRecord.storage_path || '';

        // 尝试1：Supabase Storage 下载
        if (!sp.startsWith('https://')) {
          try {
            const { data, error } = await supabase.storage
              .from(fileRecord.file_type === 'music' ? 'blog-music' : 'blog-files')
              .download(sp);
            if (!error && data) fileContent = new Uint8Array(await data.arrayBuffer());
          } catch(e) {}
        }

        // 尝试2：GitHub URL 下载
        if (!fileContent && sp.startsWith('https://')) {
          try {
            let downloadUrl = sp;

            const blobMatch = sp.match(/github\.com\/[^/]+\/[^/]+\/blob\/([^/]+)\/(.+)/);
            if (blobMatch) {
              const repo = sp.match(/github\.com\/([^/]+\/[^/]+)/)?.[1];
              downloadUrl = `https://raw.githubusercontent.com/${repo}/${blobMatch[1]}/${blobMatch[2]}`;
            }

            const resp = await fetch(downloadUrl);
            if (resp.ok) fileContent = new Uint8Array(await resp.arrayBuffer());
          } catch(e) {}
        }

        if (!fileContent) {
          return jsonResponse({ success: false, error: '文件不可用，可能尚未同步完成' }, 503);
        }

        const ext = fileRecord.file_type || sp.split('.').pop() || '';
        const contentTypes: Record<string, string> = {
          md: 'text/markdown; charset=utf-8',
          txt: 'text/plain; charset=utf-8',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ppt: 'application/vnd.ms-powerpoint',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          music: 'audio/mpeg',
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
        };
        const contentType = contentTypes[ext] || 'application/octet-stream';

        return new Response(fileContent, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=300',
          },
        });
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
