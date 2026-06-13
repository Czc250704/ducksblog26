// ===== 主应用 =====
const App = {
  currentCategory: null,
  audio: null,
  playlist: [],
  currentMusicIndex: -1,
  currentContribType: 'normal',

  async init() {
    // 初始化认证
    Auth.init();

    // 初始化预览
    Preview.init();

    // 初始化管理面板
    Admin.init();

    // 初始化 Dock 导航
    this.initDock();

    // 登录按钮
    document.getElementById('login-btn').addEventListener('click', () => this.showLoginModal());

    // 登出按钮
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      window.location.reload();
    });

    // 登录表单提交
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // 关闭登录框
    document.getElementById('login-close').addEventListener('click', () => {
      document.getElementById('login-modal').classList.add('hidden');
    });

    // 模态框关闭按钮（通用委托）
    document.getElementById('main-interface').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.add('hidden');
      }
    });

    // 设置调试保护
    this.setupDebugProtection();

    // 触发进入动画
    this.startEntryAnimation();
  },

  // ===== Dock 导航栏 =====
  initDock() {
    document.querySelectorAll('.dock-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'about') this.openModal('about-modal');
        else if (action === 'contact') this.openModal('contact-modal');
        else if (action === 'contribute') this.openModal('contributor-modal');
        else if (action === 'files') window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  },

  openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
  },

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  },

  // ===== 贡献者类型切换 =====
  switchContribTab(type) {
    this.currentContribType = type;
    document.querySelectorAll('.contrib-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });
    document.getElementById('contrib-form-normal').classList.toggle('hidden', type !== 'normal');
    document.getElementById('contrib-form-signed').classList.toggle('hidden', type !== 'signed');
  },

  // ===== 提交贡献者申请 =====
  async submitContributor(e, type) {
    e.preventDefault();
    let data = { type: type };

    if (type === 'normal') {
      data.name = document.getElementById('contrib-normal-name').value.trim();
      data.email = document.getElementById('contrib-normal-email').value.trim();
      data.field = document.getElementById('contrib-normal-field').value.trim();
      data.reason = document.getElementById('contrib-normal-reason').value.trim();
    } else {
      data.realName = document.getElementById('contrib-signed-realname').value.trim();
      data.email = document.getElementById('contrib-signed-email').value.trim();
      data.phone = document.getElementById('contrib-signed-phone').value.trim();
      data.field = document.getElementById('contrib-signed-field').value.trim();
      data.bio = document.getElementById('contrib-signed-bio').value.trim();
      data.frequency = document.getElementById('contrib-signed-frequency').value;
    }

    try {
      const result = await ContributorAPI.submit(data);
      if (result.success) {
        // 显示成功界面
        const modalBody = document.querySelector('#contributor-modal .modal-body');
        modalBody.innerHTML =
          '<div class="contrib-success">' +
          '<div class="check-icon">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">' +
          '<polyline points="20 6 9 17 4 12"/>' +
          '</svg>' +
          '</div>' +
          '<h3>申请已提交</h3>' +
          '<p>感谢您的申请！我们将在 3 个工作日内通过邮件回复审核结果。</p>' +
          '</div>';
      } else {
        alert('提交失败：' + (result.error || '未知错误'));
      }
    } catch (e) {
      alert('提交失败，请稍后重试');
    }
  },

  // ===== 进入动画 =====
  startEntryAnimation() {
    const overlay = document.getElementById('entry-overlay');
    const mainInterface = document.getElementById('main-interface');

    // Public Studio → Duck's Blog → 主界面
    setTimeout(() => {
      overlay.classList.add('fade-out');
      mainInterface.classList.add('visible');
      setTimeout(() => {
        overlay.style.display = 'none';
        // 加载数据
        this.loadAll();
      }, 600);
    }, 3000);
  },

  // ===== 加载所有数据 =====
  loadAll() {
    this.loadCategories();
    this.loadFiles();
    this.loadLatestUploads();
    this.loadActivities();
    this.loadMusic();
  },

  // ===== 分类 =====
  async loadCategories() {
    try {
      const result = await CategoryAPI.getAll();
      const container = document.getElementById('category-tabs');
      const allTab = document.getElementById('category-all-tab');

      // 更新关于我们分类统计
      const catCountEl = document.getElementById('about-cat-count');
      if (catCountEl) catCountEl.textContent = result.data.length;

      // 清除除"全部"外的标签
      while (container.children.length > 1) {
        container.removeChild(container.lastChild);
      }

      // 设置"全部"为激活状态
      allTab.classList.add('active');
      this.currentCategory = null;

      result.data.forEach((cat) => {
        const tab = document.createElement('span');
        tab.className = 'category-tab';
        tab.textContent = cat.name;
        tab.addEventListener('click', () => {
          // 清除所有激活
          container.querySelectorAll('.category-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          this.currentCategory = cat.id;
          this.loadFiles(cat.id);
        });
        container.appendChild(tab);
      });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  // ===== 文件列表 =====
  async loadFiles(categoryId) {
    try {
      const result = await FileAPI.getAll(categoryId || null);
      const container = document.getElementById('file-list');

      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无内容</div>';
        return;
      }

      container.innerHTML = result.data.map((f) => {
        const ext = (f.original_name || f.filename).split('.').pop().toLowerCase();
        return (
          '<div class="file-item" onclick="App.previewFile(' + f.id + ')">' +
          '<div class="file-icon"><span>' + ext + '</span></div>' +
          '<div class="file-info">' +
          '<div class="file-name">' + f.original_name + '</div>' +
          '<div class="file-meta">' + f.category_name + ' / ' + f.creator + ' / ' + (f.uploaded_at ? f.uploaded_at.slice(0, 10) : '') + '</div>' +
          '</div>' +
          '</div>'
        );
      }).join('');
    } catch (e) {
      document.getElementById('file-list').innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  // ===== 最新上传 =====
  async loadLatestUploads() {
    try {
      const result = await FileAPI.getAll(null);
      const container = document.getElementById('latest-uploads-list');
      const latest = result.data.slice(0, 5);

      // 更新关于我们统计数据
      const fileCountEl = document.getElementById('about-file-count');
      if (fileCountEl) fileCountEl.textContent = result.data.length;

      if (latest.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无内容</div>';
        return;
      }

      container.innerHTML = latest.map((f) =>
        '<div class="latest-item">' +
        '<div class="name">' + f.original_name + '</div>' +
        '<div class="date">' + (f.uploaded_at ? f.uploaded_at.slice(0, 10) : '') + ' / ' + f.category_name + '</div>' +
        '</div>'
      ).join('');
    } catch (e) {
      console.error('加载最新上传失败:', e);
    }
  },

  // ===== 动态流 =====
  async loadActivities() {
    try {
      const result = await ActivityAPI.getAll();
      const container = document.getElementById('activity-feed-list');

      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无动态</div>';
        return;
      }

      container.innerHTML = result.data.map((a) => {
        const typeLabel = a.type === 'upload' ? '上传' : a.type === 'approve' ? '审核通过' : '评论';
        return (
          '<div class="activity-item" id="activity-' + a.id + '">' +
          '<div class="content"><span class="text-orange-500 font-medium">[' + typeLabel + ']</span> ' + a.content + '</div>' +
          '<div class="meta">' + a.author + ' / ' + a.created_at.slice(0, 16).replace('T', ' ') +
          ' <button class="comment-btn" onclick="App.showCommentBox(' + a.id + ')">评论 (' + a.commentCount + ')</button>' +
          '</div>' +
          '<div id="comment-box-' + a.id + '" class="hidden"></div>' +
          '</div>'
        );
      }).join('');
    } catch (e) {
      console.error('加载动态失败:', e);
    }
  },

  // ===== 评论功能 =====
  async showCommentBox(activityId) {
    const box = document.getElementById('comment-box-' + activityId);
    if (!box) return;

    // 切换显示
    if (!box.classList.contains('hidden')) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '<div class="text-gray-400 text-xs py-2">加载中...</div>';

    try {
      const result = await CommentAPI.getByActivity(activityId);
      const comments = result.data;

      let html = '<div class="comment-list">';
      if (comments.length === 0) {
        html += '<div class="text-gray-400 text-xs py-2">暂无评论</div>';
      } else {
        comments.forEach((c) => {
          html += '<div class="comment-item"><span class="author">' + c.author + '</span>: ' + c.content + '</div>';
        });
      }
      html += '</div>';

      html += '<div class="comment-input-row">' +
        '<input type="text" id="comment-input-' + activityId + '" placeholder="输入评论...">' +
        '<input type="text" id="comment-author-' + activityId + '" placeholder="昵称" style="max-width:80px">' +
        '<button onclick="App.submitComment(' + activityId + ')">发表</button>' +
        '</div>';

      box.innerHTML = html;

      // 回车提交
      const input = document.getElementById('comment-input-' + activityId);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submitComment(activityId);
        });
      }
    } catch (e) {
      box.innerHTML = '<div class="text-red-500 text-xs py-2">加载失败</div>';
    }
  },

  async submitComment(activityId) {
    const input = document.getElementById('comment-input-' + activityId);
    const authorInput = document.getElementById('comment-author-' + activityId);
    const content = input.value.trim();
    const author = authorInput ? authorInput.value.trim() : '';

    if (!content) return;

    try {
      await CommentAPI.create(activityId, content, author || '匿名访客');
      input.value = '';
      // 重新加载评论
      this.showCommentBox(activityId);
      // 刷新动态列表更新评论数
      this.loadActivities();
    } catch (e) {
      alert('评论失败：' + e.message);
    }
  },

  // ===== 音乐播放器 =====
  async loadMusic() {
    try {
      const result = await MusicAPI.getList();
      this.playlist = result.data;
      if (this.playlist.length > 0) {
        this.currentMusicIndex = 0;
        this.updatePlayerUI();
      }
    } catch (e) {
      console.error('加载音乐列表失败:', e);
    }
  },

  updatePlayerUI() {
    const songName = document.getElementById('current-song-name');
    if (this.playlist.length === 0) {
      songName.textContent = '暂无音乐';
      return;
    }
    songName.textContent = this.playlist[this.currentMusicIndex].name;
  },

  playMusic() {
    if (this.playlist.length === 0) return;

    if (this.audio) {
      this.audio.pause();
    }

    const song = this.playlist[this.currentMusicIndex];
    this.audio = new Audio(song.url);

    const progressFill = document.getElementById('progress-fill');
    const playBtn = document.getElementById('play-btn');

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio.duration) {
        const pct = (this.audio.currentTime / this.audio.duration) * 100;
        progressFill.style.width = pct + '%';
      }
    });

    this.audio.addEventListener('ended', () => {
      this.nextMusic();
    });

    this.audio.play().then(() => {
      playBtn.textContent = '| |';
    }).catch((e) => {
      console.error('播放失败:', e);
    });

    this.updatePlayerUI();
  },

  togglePlay() {
    const playBtn = document.getElementById('play-btn');
    if (!this.audio) {
      this.playMusic();
      return;
    }
    if (this.audio.paused) {
      this.audio.play();
      playBtn.textContent = '| |';
    } else {
      this.audio.pause();
      playBtn.textContent = '>';
    }
  },

  prevMusic() {
    if (this.playlist.length === 0) return;
    this.currentMusicIndex = (this.currentMusicIndex - 1 + this.playlist.length) % this.playlist.length;
    this.playMusic();
  },

  nextMusic() {
    if (this.playlist.length === 0) return;
    this.currentMusicIndex = (this.currentMusicIndex + 1) % this.playlist.length;
    this.playMusic();
  },

  // ===== 文件预览 =====
  previewFile(fileId) {
    Preview.open(fileId);
  },

  // ===== 登录 =====
  showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-username').focus();
  },

  async handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
      alert('请输入用户名和密码');
      return;
    }

    try {
      await Auth.login(username, password);
      document.getElementById('login-modal').classList.add('hidden');
      // 刷新数据
      this.loadFiles();
      this.loadActivities();
    } catch (e) {
      alert('登录失败：' + e.message);
    }
  },

  // ===== 调试保护 =====
  setupDebugProtection() {
    // 禁用右键菜单
    document.addEventListener('contextmenu', (e) => {
      if (!window._SUPER_ADMIN_MODE_) e.preventDefault();
    });

    // 禁用 F12 和开发者工具快捷键
    document.addEventListener('keydown', (e) => {
      if (window._SUPER_ADMIN_MODE_) return;
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+J
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        return false;
      }
      // Ctrl+U
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        return false;
      }
    });

    // 检测开发者工具（简单版）
    setInterval(() => {
      if (!window._SUPER_ADMIN_MODE_) {
        const before = new Date();
        debugger;
        const after = new Date();
        if (after - before > 100) {
          console.clear();
        }
      }
    }, 1000);
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
