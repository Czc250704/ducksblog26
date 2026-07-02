// Duck's Blog - Supabase 客户端 & API
// 纯静态前端直接调用 Supabase + Edge Function

const SUPABASE_URL = 'https://bwsgplhiiwldhrxztkld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3c2dwbGhpaXdsZGhyeHp0a2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDcwNzksImV4cCI6MjA5Njk4MzA3OX0.Jtr5qLHaX7MK4GZPDMycJQwa6wztFPNTbMQ5y0qPq44';
const EDGE_BASE = SUPABASE_URL + '/functions/v1';

// 初始化 Supabase 客户端
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Edge Function 通用请求
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
    return edgeRequest('login', { username, password });
  },
};

// ===== 分类 =====
const CategoryAPI = {
  async getAll() {
    return edgeRequest('get-categories');
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
    const result = await edgeRequest('get-files', { categoryId: categoryId || undefined });
    result.data = (result.data || []).map(f => ({
      ...f,
      category_name: f.category_name || '',
    }));
    return result;
  },

  // 上传文件：先上传到 Supabase Storage，再通过 Edge Function 创建 DB 记录
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

  // 获取文件预览内容
  async preview(fileId) {
    const result = await edgeRequest('preview-file', { fileId });
    const file = result.data;

    const fileType = file.type;
    const textTypes = ['md', 'txt', 'log', 'csv', 'xml', 'json', 'html', 'htm',
                       'css', 'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c',
                       'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sql', 'sh',
                       'bat', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env'];

    if (textTypes.includes(fileType)) {
      return { success: true, data: { ...file, type: fileType } };
    }

    return { success: true, data: { ...file, type: fileType } };
  },
};

// ===== 动态 =====
const ActivityAPI = {
  getAll() {
    return edgeRequest('get-activities');
  },

  create(content, author) {
    return edgeRequest('create-activity', { content, author });
  },
};

// ===== 评论 =====
const CommentAPI = {
  getByActivity(activityId) {
    return edgeRequest('get-comments', { activityId });
  },

  create(activityId, content, author) {
    return edgeRequest('create-comment', { activityId, content, author });
  },
};

// ===== 音乐 =====
const MusicAPI = {
  getList() {
    return edgeRequest('get-music');
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

  // ===== Git 管理 API =====
  getGitStatus() {
    return edgeRequest('git-status');
  },

  gitPush() {
    return edgeRequest('git-push');
  },

  gitPull(categoryId) {
    return edgeRequest('git-pull', { categoryId });
  },

  getGitLog() {
    return edgeRequest('git-log');
  }
};
