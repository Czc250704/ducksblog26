// ===== 认证状态管理（纯前端 Supabase 版本） =====
const Auth = {
  token: null,
  user: null,

  init() {
    this.token = localStorage.getItem('token');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.updateUI();
  },

  isLoggedIn() {
    return !!this.token && !!this.user;
  },

  isSuperAdmin() {
    return this.isLoggedIn() && this.user.role === 'super';
  },

  isAdmin() {
    return this.isLoggedIn() && (this.user.role === 'super' || this.user.role === 'admin');
  },

  async login(username, password) {
    const result = await AuthAPI.login(username, password);
    this.token = result.data.token;
    this.user = { username: result.data.username, role: result.data.role };
    localStorage.setItem('token', this.token);
    localStorage.setItem('user', JSON.stringify(this.user));

    // 超级管理员解除调试限制
    if (this.user.role === 'super') {
      window._SUPER_ADMIN_MODE_ = true;
    }

    this.updateUI();
    return result;
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // 重置调试限制
    window._SUPER_ADMIN_MODE_ = false;

    this.updateUI();
  },

  updateUI() {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const usernameDisplay = document.getElementById('username-display');
    const adminToggle = document.getElementById('admin-toggle');
    const adminModal = document.getElementById('admin-modal');

    // 管理员通用功能
    const adminSections = [
      'admin-upload-section',
      'admin-upload-music-section',
      'admin-my-uploads-section',
      'admin-category-section'
    ];

    // 超级管理员专属功能
    const superSections = [
      'admin-approval-section',
      'admin-manage-categories-section',
      'admin-user-section'
    ];

    if (this.isLoggedIn()) {
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      usernameDisplay.textContent = this.user.username + ' (' + (this.user.role === 'super' ? '最高管理员' : '管理员') + ')';

      if (adminToggle) adminToggle.classList.remove('hidden');

      // 显示管理员通用功能
      adminSections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
      });

      // 超级管理员专属功能
      superSections.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (this.user.role === 'super') {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
      usernameDisplay.textContent = '';
      if (adminToggle) adminToggle.classList.add('hidden');
      if (adminModal) adminModal.classList.add('hidden');

      // 隐藏所有管理功能
      [...adminSections, ...superSections].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
    }
  }
};
