// Duck's Blog - Supabase 客户端 & API
// 纯静态前端直接调用 Supabase + Edge Function

const SUPABASE_URL = 'https://bwsgplhiiwldhrxztkld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3c2dwbGhpaXdsZGhyeHp0a2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDcwNzksImV4cCI6MjA5Njk4MzA3OX0.Jtr5qLHaX7MK4GZPDMycJQwa6wztFPNTbMQ5y0qPq44';
const EDGE_BASE = SUPABASE_URL + '/functions/v1';

// 初始化 Supabase 客户端（CDN 的 UMD 构建挂载在 window.supabase）
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Edge Function 通用请求（所有需要服务端权限的操作）
async function edgeRequest(action, data = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  let response;
  try {
    response = await fetch(EDGE_BASE + '/api', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ action: action, data: data }),
    });
  } catch (e) {
    throw new Error('网络连接失败，请检查网络');
  }

  let result;
  try {
    result = await response.json();
  } catch (e) {
    throw new Error('响应解析失败（HTTP ' + response.status + '）');
  }

  if (!result.success) {
    if (result.code === 401) {
      // token 过期，清除登录状态
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    throw new Error(result.error || '请求失败');
  }

  return result;
}

// Supabase 查询（公共读取，使用 anon key + RLS 过滤）
async function supabaseQuery(table, queryFn) {
  let query = sb.from(table).select(queryFn.select || '*');

  if (queryFn.eq) {
    Object.entries(queryFn.eq).forEach(([k, v]) => { query = query.eq(k, v); });
  }
  if (queryFn.order) {
    query = query.order(queryFn.order.column, { ascending: queryFn.order.ascending !== false });
  }
  if (queryFn.limit) {
    query = query.limit(queryFn.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { success: true, data: data || [] };
}

// ===== 认证 =====
const AuthAPI = {
  login(username, password) {
    return edgeRequest('login', { username, password });
  },
};

// ===== 分类 =====
const CategoryAPI = {
  async getAll() {
    return supabaseQuery('categories', {
      order: { column: 'created_at', ascending: false }
    });
  },

  create(name) {
    return edgeRequest('create-category', { name });
  },

  delete(id) {
    return edgeRequest('delete-category', { id });
  },
};

// ===== 文件 =====
const FileAPI = {
  async getAll(categoryId) {
    const q = {
      select: '*, categories(name)',
      order: { column: 'approved_at', ascending: false }
    };
    if (categoryId) {
      q.eq = { category_id: categoryId };
    }
    const result = await supabaseQuery('files', q);
    // 转换数据格式保持兼容
    result.data = result.data.map(f => ({
      ...f,
      category_name: f.categories?.name || '',
    }));
    return result;
  },

  // 上传文件：先上传到 Storage，再通过 Edge Function 创建 DB 记录
  async upload(file, categoryId) {
    const ext = file.name.split('.').pop().toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const storagePath = dateStr + '_' + Date.now() + '.' + ext;

    // Step 1: 上传到 Supabase Storage
    const { error: uploadError } = await sb.storage
      .from('blog-files')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new Error('文件上传失败：' + uploadError.message);

    // Step 2: 创建数据库记录
    return edgeRequest('create-file-record', {
      filename: storagePath,
      originalName: file.name,
      categoryId: parseInt(categoryId),
      storagePath: storagePath,
      size: file.size,
      fileType: ext,
    });
  },

  // 上传音乐
  async uploadMusic(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const storagePath = dateStr + '_music_' + Date.now() + '.' + ext;

    const { error: uploadError } = await sb.storage
      .from('blog-music')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new Error('音乐上传失败：' + uploadError.message);

    return edgeRequest('create-music-record', {
      name: file.name,
      storagePath: storagePath,
      size: file.size,
    });
  },

  getPending() {
    return edgeRequest('get-pending');
  },

  approve(id) {
    return edgeRequest('approve-file', { id });
  },

  reject(id) {
    return edgeRequest('reject-file', { id });
  },

  getMyUploads() {
    return edgeRequest('get-my-uploads');
  },

  // 获取文件预览内容（一次性彻底修复所有格式 + 所有 CORS 问题）
  async preview(fileId) {
    const { data: file } = await sb
      .from('files')
      .select('*')
      .eq('id', fileId)
      .neq('status', 'pending')
      .single();

    if (!file) throw new Error('文件不存在');

    const sp = file.storage_path || '';

    // 从各种 GitHub URL 格式中提取仓库内路径
    function extractRepoPath(url) {
      // 格式1：github.com/blob
      let m = url.match(/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/(.+)/);
      if (m) return decodeURIComponent(m[1]);
      // 格式2：raw.githubusercontent.com
      m = url.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/);
      if (m) return decodeURIComponent(m[1]);
      // 格式3：jsdelivr CDN
      m = url.match(/jsdelivr\.net\/gh\/[^@]+@[^/]+\/(.+)/);
      if (m) return decodeURIComponent(m[1]);
      return null;
    }

    // 判断是否为 GitHub 相关 URL（任何格式）
    const repoPath = extractRepoPath(sp);
    const isGitHubFile = !!repoPath;
    const isSupabasePath = !sp.startsWith('https://');

    // 同域绝对路径，零 CORS
    function sameOriginUrl(path) {
      return location.origin + '/' + path;
    }

    // ===== Office 文件 =====
    if (['ppt', 'pptx', 'doc', 'docx'].includes(file.file_type)) {
      let previewUrl;

      if (isGitHubFile) {
        previewUrl = sameOriginUrl(repoPath);
      } else if (isSupabasePath) {
        previewUrl = sb.storage.from('blog-files').getPublicUrl(sp).data.publicUrl;
      } else {
        previewUrl = sp;
      }
      return { success: true, data: { ...file, previewUrl, type: file.file_type } };
    }

    // ===== 文本文件 MD/TXT =====
    if (['md', 'txt'].includes(file.file_type)) {
      let text;

      if (isGitHubFile) {
        // 策略A：同域 fetch（最可靠，零 CORS）
        try {
          const r = await fetch('/' + repoPath);
          if (r.ok) { text = await r.text(); }
        } catch(e) {}

        // 策略B：如果同域失败（文件可能还没部署），用 GitHub API
        if (!text && sp.includes('github.com')) {
          try {
            const r = await fetch(sp.replace('github.com/', 'api.github.com/repos/').replace('/blob/', '/contents/'), {
              headers: { Accept: 'application/vnd.github.v3.raw' }
            });
            if (r.ok) text = await r.text();
          } catch(e) {}
        }
        if (!text) throw new Error('文件读取失败，请稍后重试（GitHub 部署中）');
      } else if (isSupabasePath) {
        const { data: content, error } = await sb.storage.from('blog-files').download(sp);
        if (error) throw new Error('Storage读取失败: ' + error.message);
        text = await content.text();
      } else {
        const r = await fetch(sp);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        text = await r.text();
      }
      return { success: true, data: { ...file, content: text, type: file.file_type } };
    }

    // ===== 音乐 =====
    if (file.file_type === 'music') {
      const musicUrl = isSupabasePath
        ? sb.storage.from('blog-music').getPublicUrl(sp).data.publicUrl
        : (isGitHubFile ? sameOriginUrl(repoPath) : sp);
      return { success: true, data: { ...file, previewUrl: musicUrl, type: file.file_type } };
    }

    return { success: true, data: { ...file, type: file.file_type } };
  },
};

// ===== 动态 =====
const ActivityAPI = {
  async getAll() {
    const { data, error } = await sb
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // 获取每个动态的评论数
    const activitiesWithCounts = await Promise.all(
      data.map(async (a) => {
        const { count, error: countErr } = await sb
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', a.id);

        return {
          ...a,
          commentCount: countErr ? 0 : (count || 0),
        };
      })
    );

    return { success: true, data: activitiesWithCounts };
  },

  create(content, author) {
    return sb
      .from('activities')
      .insert({
        type: 'comment',
        content: content,
        author: author || '匿名访客',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
  },
};

// ===== 评论 =====
const CommentAPI = {
  async getByActivity(activityId) {
    const { data, error } = await sb
      .from('comments')
      .select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  },

  async create(activityId, content, author) {
    const { error } = await sb
      .from('comments')
      .insert({
        activity_id: activityId,
        content: content,
        author: author || '匿名访客',
        created_at: new Date().toISOString(),
      });

    if (error) throw new Error(error.message);
    return { success: true, data: null };
  },
};

// ===== 音乐 =====
const MusicAPI = {
  async getList() {
    const { data, error } = await sb
      .from('files')
      .select('*')
      .eq('file_type', 'music')
      .eq('status', 'approved')
      .order('uploaded_at', { ascending: false });

    if (error) throw new Error(error.message);

    // 生成公开 URL
    return {
      success: true,
      data: (data || []).map((m) => {
        const { data: urlData } = sb.storage
          .from('blog-music')
          .getPublicUrl(m.storage_path);

        return {
          id: m.id,
          name: m.original_name,
          url: urlData.publicUrl,
        };
      }),
    };
  },
};

// ===== 贡献者申请 =====
const ContributorAPI = {
  submit(data) {
    return edgeRequest('submit-contributor', data);
  },
};

// ===== 管理员管理 =====
const AdminAPI = {
  getUsers() {
    return edgeRequest('get-users');
  },

  deleteUser(id) {
    return edgeRequest('delete-user', { id });
  },
};
