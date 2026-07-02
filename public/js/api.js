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

  // 获取文件预览内容（全部走 Edge Function 代理，零 CORS 零编码问题）
  async preview(fileId) {
    const { data: file } = await sb
      .from('files')
      .select('*')
      .eq('id', fileId)
      .neq('status', 'pending')
      .single();

    if (!file) throw new Error('文件不存在');

    // Edge Function 代理下载：服务端从 Storage/GitHub 获取内容返回
    const proxyUrl = EDGE_BASE + '/api';
    const proxyResp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'proxy-file', data: { fileId } }),
    });

    if (!proxyResp.ok) {
      let errBody;
      try { errBody = await proxyResp.json(); } catch(e) {}
      throw new Error(errBody?.error || '代理请求失败 (HTTP ' + proxyResp.status + ')');
    }

    // 检查是否返回了 JSON 错误（如 503）
    const contentType = proxyResp.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const jsonResult = await proxyResp.json();
      if (!jsonResult.success) {
        throw new Error(jsonResult.error || '文件不可用');
      }
    }

    const fileType = file.file_type;

    // 文本/标记类：读取文本内容
    if (['md', 'txt', 'log', 'csv', 'xml', 'json', 'html', 'htm', 'css', 'js', 'ts',
         'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
         'rb', 'php', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini', 'conf',
         'env', 'gitignore', 'dockerfile', 'makefile'].includes(fileType)) {
      const text = await proxyResp.text();
      return { success: true, data: { ...file, content: text, type: fileType } };
    }

    // PDF：生成 Blob URL 用于 iframe 预览
    if (['pdf'].includes(fileType)) {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    }

    // 图片类：生成 Blob URL
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif'].includes(fileType)) {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    }

    // Office 类：生成可访问的 URL
    if (['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(fileType)) {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    }

    // 音频类：生成音频 URL
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'].includes(fileType)) {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    }

    // 视频类：生成视频 URL
    if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'm4v'].includes(fileType)) {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    }

    // 其他二进制文件：返回下载链接
    try {
      const blob = await proxyResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { success: true, data: { ...file, previewUrl: blobUrl, type: fileType, _blobUrl: blobUrl } };
    } catch (e) {
      return { success: true, data: { ...file, type: fileType } };
    }
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

// ===== 公告弹窗 =====
const AnnouncementAPI = {
  getAll() {
    return edgeRequest('get-announcements');
  },

  getActive() {
    return edgeRequest('get-active-announcement');
  },

  create(data) {
    return edgeRequest('create-announcement', data);
  },

  delete(id) {
    return edgeRequest('delete-announcement', { id });
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
