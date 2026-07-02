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

// 直接调用本地服务器 REST API（不通过 Edge Function）
async function serverRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    throw new Error(result.error || '请求失败');
  }

  return result;
}

// ===== 认证 =====
const AuthAPI = {
  login(username, password) {
    return serverRequest('/api/login', {
      method: 'POST',
      body: { username, password }
    });
  },
};

// ===== 分类 =====
const CategoryAPI = {
  async getAll() {
    return serverRequest('/api/categories');
  },

  create(name) {
    return serverRequest('/api/categories', {
      method: 'POST',
      body: { name }
    });
  },

  delete(id) {
    return serverRequest('/api/categories/' + id, {
      method: 'DELETE'
    });
  },
};

// ===== 文件 =====
const FileAPI = {
  async getAll(categoryId) {
    let url = '/api/files';
    if (categoryId) url += '?categoryId=' + categoryId;
    const result = await serverRequest(url);
    // 转换数据格式保持兼容
    result.data = (result.data || []).map(f => ({
      ...f,
      category_name: f.category_name || '',
    }));
    return result;
  },

  // 上传文件：通过 FormData 直接上传到本地服务器
  async upload(file, categoryId) {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('categoryId', categoryId);

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });

    if (!response.ok) {
      let errData;
      try { errData = await response.json(); } catch(e) {}
      throw new Error(errData?.error || '上传失败 (HTTP ' + response.status + ')');
    }
    return await response.json();
  },

  // 上传音乐
  async uploadMusic(file) {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload-music', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });

    if (!response.ok) {
      let errData;
      try { errData = await response.json(); } catch(e) {}
      throw new Error(errData?.error || '上传失败 (HTTP ' + response.status + ')');
    }
    return await response.json();
  },

  getPending() {
    return serverRequest('/api/admin/pending');
  },

  approve(id) {
    return serverRequest('/api/admin/approve/' + id, { method: 'POST' });
  },

  reject(id) {
    return serverRequest('/api/admin/reject/' + id, { method: 'DELETE' });
  },

  getMyUploads() {
    return serverRequest('/api/my-uploads');
  },

  // 获取文件预览内容（走本地 API）
  async preview(fileId) {
    const result = await serverRequest('/api/preview/' + fileId);
    const file = result.data;

    // 根据类型处理预览
    const fileType = file.type;
    const textTypes = ['md', 'txt', 'log', 'csv', 'xml', 'json', 'html', 'htm',
                       'css', 'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c',
                       'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sql', 'sh',
                       'bat', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env'];

    if (textTypes.includes(fileType)) {
      return { success: true, data: { ...file, type: fileType } };
    }

    // 其他类型：返回预览 URL
    return { success: true, data: { ...file, type: fileType } };
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
    const result = await serverRequest('/api/music');
    return result;
  },
};

// ===== 贡献者申请 =====
const ContributorAPI = {
  submit(data) {
    return serverRequest('/api/contributors', {
      method: 'POST',
      body: data
    });
  },
};

// ===== 公告弹窗 =====
const AnnouncementAPI = {
  getAll() {
    return serverRequest('/api/admin/announcements');
  },

  getActive() {
    return serverRequest('/api/admin/announcements/active');
  },

  create(data) {
    return serverRequest('/api/admin/announcements', {
      method: 'POST',
      body: data
    });
  },

  delete(id) {
    return serverRequest('/api/admin/announcements/' + id, { method: 'DELETE' });
  },
};

// ===== 管理员管理 =====
const AdminAPI = {
  getUsers() {
    return serverRequest('/api/admin/users');
  },

  deleteUser(id) {
    return serverRequest('/api/admin/users/' + id, { method: 'DELETE' });
  },

  // ===== Git 管理 API =====
  getGitStatus() {
    return serverRequest('/api/admin/git/status');
  },

  gitPush() {
    return serverRequest('/api/admin/git/push', { method: 'POST' });
  },

  gitPull(categoryId) {
    return serverRequest('/api/admin/git/pull', {
      method: 'POST',
      body: { categoryId: categoryId }
    });
  },

  getGitLog() {
    return serverRequest('/api/admin/git/log');
  }
};
