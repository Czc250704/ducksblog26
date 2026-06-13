// API 基地址
const API_BASE = window.location.origin;

// 通用请求封装
async function apiRequest(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {};

  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  // 不设置 Content-Type 让浏览器自动处理（尤其是 FormData）
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(API_BASE + url, {
      ...options,
      headers: headers
    });
  } catch (e) {
    throw new Error('网络连接失败，请检查服务是否启动');
  }

  // 检查响应类型，防止非 JSON 响应导致解析失败
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error('服务器返回异常（HTTP ' + response.status + '）：' + (text.slice(0, 200) || '无响应内容'));
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error('响应解析失败（HTTP ' + response.status + '）');
  }

  if (!data.success) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

// ===== 认证 =====
const AuthAPI = {
  login(username, password) {
    return apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  getMe() {
    return apiRequest('/api/me');
  }
};

// ===== 分类 =====
const CategoryAPI = {
  getAll() {
    return apiRequest('/api/categories');
  },

  create(name) {
    return apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  delete(id) {
    return apiRequest('/api/categories/' + id, {
      method: 'DELETE'
    });
  }
};

// ===== 文件 =====
const FileAPI = {
  getAll(categoryId) {
    let url = '/api/files';
    if (categoryId) url += '?categoryId=' + categoryId;
    return apiRequest(url);
  },

  upload(file, categoryId) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('categoryId', categoryId);
    return apiRequest('/api/upload', {
      method: 'POST',
      body: formData
    });
  },

  uploadMusic(file) {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('/api/upload-music', {
      method: 'POST',
      body: formData
    });
  },

  getPending() {
    return apiRequest('/api/admin/pending');
  },

  approve(id) {
    return apiRequest('/api/admin/approve/' + id, {
      method: 'POST'
    });
  },

  reject(id) {
    return apiRequest('/api/admin/reject/' + id, {
      method: 'DELETE'
    });
  },

  getMyUploads() {
    return apiRequest('/api/my-uploads');
  },

  preview(fileId) {
    return apiRequest('/api/preview/' + fileId);
  }
};

// ===== 动态 =====
const ActivityAPI = {
  getAll() {
    return apiRequest('/api/activities');
  }
};

// ===== 评论 =====
const CommentAPI = {
  create(activityId, content, author) {
    return apiRequest('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ activityId, content, author })
    });
  },

  getByActivity(activityId) {
    return apiRequest('/api/comments/' + activityId);
  }
};

// ===== 音乐 =====
const MusicAPI = {
  getList() {
    return apiRequest('/api/music');
  }
};

// ===== 贡献者申请 =====
const ContributorAPI = {
  submit(data) {
    return apiRequest('/api/contributors', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
};

// ===== 管理员管理 =====
const AdminAPI = {
  getUsers() {
    return apiRequest('/api/admin/users');
  },

  deleteUser(id) {
    return apiRequest('/api/admin/users/' + id, {
      method: 'DELETE'
    });
  }
};
