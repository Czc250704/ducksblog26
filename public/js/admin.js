// ===== 管理面板模块（Supabase Storage + Edge Function 版本） =====
const Admin = {
  panelOpen: false,

  init() {
    const toggleBtn = document.getElementById('admin-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePanel());
    }

    // 创建分类表单
    const categoryForm = document.getElementById('create-category-form');
    if (categoryForm) {
      categoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createCategory();
      });
    }

    // 上传文件表单
    const uploadForm = document.getElementById('upload-file-form');
    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.uploadFile();
      });
    }

    // 上传音乐表单
    const musicForm = document.getElementById('upload-music-form');
    if (musicForm) {
      musicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.uploadMusic();
      });
    }

    // 审批列表刷新
    const refreshApproval = document.getElementById('refresh-approval');
    if (refreshApproval) {
      refreshApproval.addEventListener('click', () => this.loadPendingFiles());
    }

    // 用户管理刷新
    const refreshUsers = document.getElementById('refresh-users');
    if (refreshUsers) {
      refreshUsers.addEventListener('click', () => this.loadUsers());
    }

    // Git 状态刷新按钮
    const gitRefreshBtn = document.getElementById('git-refresh-btn');
    if (gitRefreshBtn) {
      gitRefreshBtn.addEventListener('click', () => {
        this.refreshGitStatus();
        this.loadGitLog();
      });
    }
  },

  togglePanel() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) {
      modal.classList.remove('hidden');
      this.loadAll();
    } else {
      modal.classList.add('hidden');
    }
  },

  closePanel() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    this.panelOpen = false;
    modal.classList.add('hidden');
  },

  loadAll() {
    this.loadCategories();
    this.loadPendingFiles();
    this.loadMyUploads();
    if (Auth.isSuperAdmin()) {
      this.loadUsers();
      this.loadAnnouncements();
      document.getElementById('admin-github-section').classList.remove('hidden');
      this.refreshGitStatus();
      this.loadGitLog();
    }
  },

  // 加载分类列表（管理用）
  async loadCategories() {
    try {
      const result = await CategoryAPI.getAll();
      const select = document.getElementById('upload-category-select');
      if (select) {
        select.innerHTML = '<option value="">请选择分类</option>';
        result.data.forEach((cat) => {
          select.innerHTML += '<option value="' + cat.id + '">' + cat.name + '</option>';
        });
      }

      // 同步填充 Git 拉取的分类选择器
      const pullSelect = document.getElementById('git-pull-category');
      if (pullSelect) {
        pullSelect.innerHTML = '<option value="">选择拉取目标分类</option>';
        result.data.forEach((cat) => {
          pullSelect.innerHTML += '<option value="' + cat.id + '">' + cat.name + '</option>';
        });
      }

      // 超级管理员分类管理列表
      if (Auth.isSuperAdmin()) {
        this.renderAdminCategories(result.data);
      }
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  renderAdminCategories(categories) {
    const container = document.getElementById('admin-categories-list');
    if (!container) return;
    if (categories.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无分类</div>';
      return;
    }
    container.innerHTML = categories.map((cat) =>
      '<div class="pending-item">' +
      '<div class="info">' +
      '<div class="name">' + cat.name + '</div>' +
      '<div class="meta">创建者: ' + cat.creator + '</div>' +
      '</div>' +
      '<div class="actions">' +
      '<button class="btn-danger" onclick="Admin.deleteCategory(' + cat.id + ')">删除</button>' +
      '</div>' +
      '</div>'
    ).join('');
  },

  async createCategory() {
    const input = document.getElementById('create-category-input');
    const name = input.value.trim();
    if (!name) {
      alert('请输入分类名称');
      return;
    }
    try {
      await CategoryAPI.create(name);
      input.value = '';
      alert('分类创建成功');
      this.loadCategories();
      App.loadCategories();
    } catch (e) {
      alert('创建失败：' + e.message);
    }
  },

  async deleteCategory(id) {
    if (!confirm('确定删除此分类？分类下的所有文件也会被删除。')) return;
    try {
      await CategoryAPI.delete(id);
      this.loadCategories();
      App.loadCategories();
      App.loadFiles();
    } catch (e) {
      alert('删除失败：' + e.message);
    }
  },

  async uploadFile() {
    const fileInput = document.getElementById('upload-file-input');
    const select = document.getElementById('upload-category-select');
    const file = fileInput.files[0];
    const categoryId = select.value;

    if (!file) {
      alert('请选择文件');
      return;
    }
    if (!categoryId) {
      alert('请选择分类');
      return;
    }

    // 文件大小检查（10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小超出限制（最大10MB）');
      return;
    }

    try {
      await FileAPI.upload(file, categoryId);
      fileInput.value = '';
      alert('文件已提交审核');
      this.loadMyUploads();
      App.loadActivities();
      App.loadLatestUploads();
    } catch (e) {
      alert('上传失败：' + e.message);
    }
  },

  async uploadMusic() {
    const fileInput = document.getElementById('upload-music-input');
    const file = fileInput.files[0];
    if (!file) {
      alert('请选择音乐文件');
      return;
    }

    // 文件大小检查（15MB）
    if (file.size > 15 * 1024 * 1024) {
      alert('文件大小超出限制（最大15MB）');
      return;
    }

    try {
      await FileAPI.uploadMusic(file);
      fileInput.value = '';
      alert('音乐上传成功');
      App.loadMusic();
    } catch (e) {
      alert('上传失败：' + e.message);
    }
  },

  async loadPendingFiles() {
    const container = document.getElementById('pending-files-list');
    if (!container) return;
    try {
      const result = await FileAPI.getPending();
      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无待审批文件</div>';
        return;
      }
      container.innerHTML = result.data.map((f) =>
        '<div class="pending-item" id="pending-' + f.id + '">' +
        '<div class="info">' +
        '<div class="name">' + f.original_name + '</div>' +
        '<div class="meta">' + (f.category_name || f.categories?.name || '') + ' / ' + f.creator + ' / ' + (f.uploaded_at ? f.uploaded_at.slice(0, 10) : '') + '</div>' +
        '</div>' +
        '<div class="actions">' +
        '<button class="btn-approve" onclick="Admin.approveFile(' + f.id + ')">通过</button>' +
        '<button class="btn-danger" onclick="Admin.rejectFile(' + f.id + ')">拒绝</button>' +
        '</div>' +
        '</div>'
      ).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  async approveFile(id) {
    if (!confirm('确定通过此文件？')) return;
    try {
      await FileAPI.approve(id);
      this.loadPendingFiles();
      this.loadMyUploads();
      App.loadLibraryFiles();
      App.loadActivities();
    } catch (e) {
      alert('审批失败：' + e.message);
    }
  },

  async rejectFile(id) {
    if (!confirm('确定拒绝此文件？文件将被删除。')) return;
    try {
      await FileAPI.reject(id);
      this.loadPendingFiles();
      this.loadMyUploads();
    } catch (e) {
      alert('拒绝失败：' + e.message);
    }
  },

  async loadMyUploads() {
    const container = document.getElementById('my-uploads-list');
    if (!container) return;
    try {
      const result = await FileAPI.getMyUploads();
      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无上传记录</div>';
        return;
      }

      const statusMap = {
        pending: '<span class="text-yellow-600">待审核</span>',
        approved: '<span class="text-green-600">已通过</span>',
        rejected: '<span class="text-red-600">已拒绝</span>'
      };

      container.innerHTML = result.data.map((f) =>
        '<div class="pending-item">' +
        '<div class="info">' +
        '<div class="name">' + f.original_name + '</div>' +
        '<div class="meta">' + (f.category_name || f.categories?.name || '') + ' / ' + (f.uploaded_at ? f.uploaded_at.slice(0, 10) : '') + ' / ' + (statusMap[f.status] || f.status) + '</div>' +
        '</div>' +
        '</div>'
      ).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  async loadUsers() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;
    try {
      const result = await AdminAPI.getUsers();
      container.innerHTML = result.data.map((u) =>
        '<div class="pending-item">' +
        '<div class="info">' +
        '<div class="name">' + u.username + '</div>' +
        '<div class="meta">' + (u.role === 'super' ? '最高管理员' : '二级管理员') + '</div>' +
        '</div>' +
        '<div class="actions">' +
        (u.username !== 'duck'
          ? '<button class="btn-danger" onclick="Admin.deleteUser(' + u.id + ', \'' + u.username + '\')">删除</button>'
          : '') +
        '</div>' +
        '</div>'
      ).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  async deleteUser(id, username) {
    if (!confirm('确定删除管理员「' + username + '」？')) return;
    try {
      await AdminAPI.deleteUser(id);
      this.loadUsers();
    } catch (e) {
      alert('删除失败：' + e.message);
    }
  },

  // ===== 公告管理 =====

  async loadAnnouncements() {
    const container = document.getElementById('announcement-list');
    if (!container) return;
    try {
      const result = await AnnouncementAPI.getAll();
      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无公告</div>';
        return;
      }
      const now = new Date().toISOString();
      container.innerHTML = result.data.map((a) => {
        const start = a.start_time.slice(0, 16).replace('T', ' ');
        const end = a.end_time.slice(0, 16).replace('T', ' ');
        let statusHtml = '';
        if (!a.is_active) {
          statusHtml = '<span class="ann-status-badge ann-status-inactive">已暂停</span>';
        } else if (a.end_time < now) {
          statusHtml = '<span class="ann-status-badge ann-status-expired">已过期</span>';
        } else if (a.start_time > now) {
          statusHtml = '<span class="ann-status-badge ann-status-inactive">待生效</span>';
        } else {
          statusHtml = '<span class="ann-status-badge ann-status-active">展示中</span>';
        }
        return (
          '<div class="pending-item">' +
          '<div class="info">' +
          '<div class="name">' + a.title + ' ' + statusHtml + '</div>' +
          '<div class="meta">' + start + ' ~ ' + end + ' / ' + a.display_duration + '秒</div>' +
          '</div>' +
          '<div class="actions">' +
          '<button class="btn-danger" onclick="Admin.deleteAnnouncement(' + a.id + ')">删除</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  async createAnnouncement() {
    const title = document.getElementById('ann-title').value.trim();
    const content = document.getElementById('ann-content').value.trim();
    const startTime = document.getElementById('ann-start-time').value;
    const endTime = document.getElementById('ann-end-time').value;
    const duration = parseInt(document.getElementById('ann-duration').value) || 10;

    if (!title) { alert('请输入公告标题'); return; }
    if (!content) { alert('请输入公告内容'); return; }
    if (!startTime) { alert('请选择开始时间'); return; }
    if (!endTime) { alert('请选择结束时间'); return; }
    if (new Date(endTime) <= new Date(startTime)) {
      alert('结束时间必须晚于开始时间');
      return;
    }

    try {
      await AnnouncementAPI.create({
        title,
        content,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        displayDuration: duration,
      });
      document.getElementById('ann-title').value = '';
      document.getElementById('ann-content').value = '';
      document.getElementById('ann-start-time').value = '';
      document.getElementById('ann-end-time').value = '';
      document.getElementById('ann-duration').value = '10';
      alert('公告发布成功');
      this.loadAnnouncements();
    } catch (e) {
      alert('发布失败：' + e.message);
    }
  },

  async deleteAnnouncement(id) {
    if (!confirm('确定删除此公告？')) return;
    try {
      await AnnouncementAPI.delete(id);
      this.loadAnnouncements();
    } catch (e) {
      alert('删除失败：' + e.message);
    }
  },

  // ===== Git 管理 =====
  gitData: { toPush: [], toPull: [], inSync: [], stats: { toPush: 0, toPull: 0, inSync: 0 } },

  // 刷新 Git 状态
  async refreshGitStatus() {
    const statusBar = document.getElementById('git-status-bar');
    if (!statusBar) return;

    try {
      const result = await AdminAPI.getGitStatus();
      const d = result.data;

      if (!d.configured) {
        statusBar.innerHTML = '<span class="text-red-500 text-xs">未配置 REPO_URL 或 GITHUB_TOKEN</span>';
        return;
      }

      this.gitData = d;

      // 更新状态条
      document.getElementById('git-branch').textContent = d.branch || 'main';
      document.getElementById('git-push-count').textContent = d.stats.toPush;
      document.getElementById('git-pull-count').textContent = d.stats.toPull;
      document.getElementById('git-sync-count').textContent = d.stats.inSync;

      // 渲染待推送列表
      this.renderPushList(d.toPush);
      // 渲染待拉取列表
      this.renderPullList(d.toPull);
    } catch (e) {
      statusBar.innerHTML = '<span class="text-red-500 text-xs">获取状态失败: ' + e.message + '</span>';
    }
  },

  renderPushList(files) {
    const container = document.getElementById('git-push-list');
    const badge = document.getElementById('git-push-badge');
    if (!container) return;
    if (files.length === 0) {
      container.innerHTML = '<div class="empty-state text-xs">无待推送文件</div>';
      if (badge) badge.textContent = '0 个';
      return;
    }
    if (badge) badge.textContent = files.length + ' 个';
    container.innerHTML = files.map((f) =>
      '<div class="git-file-item">' +
      '<span class="gfi-name">' + f.name + '</span>' +
      '<span class="gfi-meta">' + (f.creator || '?') + '</span>' +
      '</div>'
    ).join('');
  },

  renderPullList(files) {
    const container = document.getElementById('git-pull-list');
    const badge = document.getElementById('git-pull-badge');
    if (!container) return;
    if (files.length === 0) {
      container.innerHTML = '<div class="empty-state text-xs">无待拉取文件</div>';
      if (badge) badge.textContent = '0 个';
      return;
    }
    if (badge) badge.textContent = files.length + ' 个';
    container.innerHTML = files.map((f) =>
      '<div class="git-file-item">' +
      '<span class="gfi-name">' + f.name + '</span>' +
      '<span class="gfi-meta">' + (f.size ? (f.size / 1024).toFixed(1) + ' KB' : '') + '</span>' +
      '</div>'
    ).join('');
  },

  // 推送到 GitHub
  async gitPush() {
    const btn = document.getElementById('git-push-btn');
    const resultEl = document.getElementById('git-action-result');
    if (!btn) return;

    if (this.gitData.stats.toPush === 0) {
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-yellow-600';
      resultEl.textContent = '没有待推送的文件';
      return;
    }

    if (!confirm('推送 ' + this.gitData.stats.toPush + ' 个文件到 GitHub 远程仓库？')) return;

    btn.disabled = true;
    btn.textContent = '推送中...';
    resultEl.classList.add('hidden');

    try {
      const result = await AdminAPI.gitPush();
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-green-600';
      resultEl.textContent = result.data.message;
      this.refreshGitStatus();
      this.loadGitLog();
    } catch (e) {
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-red-600';
      resultEl.textContent = '推送失败: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '推送到 GitHub';
    }
  },

  // 从 GitHub 拉取
  async gitPull() {
    const select = document.getElementById('git-pull-category');
    const categoryId = select.value;
    const resultEl = document.getElementById('git-action-result');
    const btn = document.getElementById('git-pull-btn');
    if (!btn) return;

    if (!categoryId) {
      alert('请选择拉取文件的目标分类');
      return;
    }

    if (this.gitData.stats.toPull === 0) {
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-yellow-600';
      resultEl.textContent = '没有待拉取的文件';
      return;
    }

    if (!confirm('拉取 ' + this.gitData.stats.toPull + ' 个文件到本地？')) return;

    btn.disabled = true;
    btn.textContent = '拉取中...';
    resultEl.classList.add('hidden');

    try {
      const result = await AdminAPI.gitPull(parseInt(categoryId));
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-green-600';
      resultEl.textContent = result.data.message;

      this.refreshGitStatus();
      this.loadGitLog();
      this.loadMyUploads();
      App.loadLibraryFiles();
      App.loadActivities();
    } catch (e) {
      resultEl.classList.remove('hidden');
      resultEl.className = 'text-xs text-red-600';
      resultEl.textContent = '拉取失败: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '从 GitHub 拉取';
    }
  },

  // 加载提交历史
  async loadGitLog() {
    const container = document.getElementById('git-log-list');
    if (!container) return;
    try {
      const result = await AdminAPI.getGitLog();
      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state text-xs">暂无提交记录</div>';
        return;
      }
      container.innerHTML = result.data.map((c) =>
        '<div class="git-log-item">' +
        '<span class="git-log-sha">' + c.sha + '</span>' +
        '<span class="git-log-msg" title="' + (c.message || '').replace(/"/g, '&quot;') + '">' + (c.message || '') + '</span>' +
        '<span class="git-log-meta">' + (c.author || '') + ' / ' + (c.date ? c.date.slice(0, 10) : '') + '</span>' +
        '</div>'
      ).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state text-xs">加载失败</div>';
    }
  }
};
