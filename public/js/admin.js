// ===== 管理面板模块 =====
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
        '<div class="meta">' + f.category_name + ' / ' + f.creator + ' / ' + f.uploaded_at.slice(0, 10) + '</div>' +
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
    if (!confirm('确定通过此文件？将通过后自动同步到 Git。')) return;
    try {
      await FileAPI.approve(id);
      this.loadPendingFiles();
      this.loadMyUploads();
      App.loadFiles();
      App.loadActivities();
      App.loadLatestUploads();
    } catch (e) {
      alert('审批失败：' + e.message);
    }
  },

  async rejectFile(id) {
    if (!confirm('确定拒绝此文件？')) return;
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
        '<div class="meta">' + f.category_name + ' / ' + f.uploaded_at.slice(0, 10) + ' / ' + (statusMap[f.status] || f.status) + '</div>' +
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
  }
};
