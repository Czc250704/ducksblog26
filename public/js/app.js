// ===== 主应用（新布局版本） =====
const App = {
  currentCategory: null,
  audio: null,
  playlist: [],
  currentMusicIndex: -1,
  currentContribType: 'normal',
  allCategories: [],
  allFiles: [],
  // 已打开的文件列表（侧边栏用）
  openedFiles: [],
  // 当前预览中的文件信息
  currentPreviewFile: null,

  async init() {
    Auth.init();
    Preview.init();
    Admin.init();
    this.initDock();

    document.getElementById('login-btn').addEventListener('click', () => this.showLoginModal());
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      window.location.reload();
    });
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // 模态框点击遮罩关闭（通用委托）
    document.getElementById('main-interface').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        const container = e.target.querySelector('.modal-container');
        if (container) container.classList.remove('minimized', 'maximized');
        e.target.classList.add('hidden');
        // 全屏预览关闭时同步状态
        if (e.target.id === 'preview-overlay') {
          Preview.exitFullscreen();
          const body = document.getElementById('preview-panel-body');
          if (body) body.classList.remove('maximized');
        }
      }
    });

    this.setupDebugProtection();
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
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const container = overlay.querySelector('.modal-container');
    if (container) container.classList.remove('minimized', 'maximized');
  },

  closeModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    overlay.classList.add('hidden');
    const container = overlay.querySelector('.modal-container');
    if (container) container.classList.remove('minimized', 'maximized');
  },

  // ===== 公告弹窗 =====
  announcementTimer: null,
  announcementRemaining: 0,

  async checkAnnouncement() {
    try {
      const result = await AnnouncementAPI.getActive();
      if (result.data) {
        this.showAnnouncement(result.data);
      }
    } catch (e) {
      // 静默失败，不干扰用户
    }
  },

  showAnnouncement(data) {
    const overlay = document.getElementById('announcement-overlay');
    const titleEl = document.getElementById('announcement-title');
    const bodyEl = document.getElementById('announcement-body');
    const timerEl = document.getElementById('announcement-timer');

    titleEl.textContent = data.title || '公告';

    // 支持 Markdown 渲染
    if (typeof marked !== 'undefined') {
      bodyEl.innerHTML = marked.parse(data.content || '');
    } else {
      bodyEl.innerHTML = (data.content || '').replace(/\n/g, '<br>');
    }

    overlay.classList.remove('hidden');

    // 倒计时自动关闭
    this.announcementRemaining = data.display_duration || 10;
    this.updateAnnouncementTimer(timerEl);

    if (this.announcementTimer) clearInterval(this.announcementTimer);
    this.announcementTimer = setInterval(() => {
      this.announcementRemaining--;
      if (this.announcementRemaining <= 0) {
        this.closeAnnouncement();
      } else {
        this.updateAnnouncementTimer(timerEl);
      }
    }, 1000);
  },

  updateAnnouncementTimer(timerEl) {
    if (timerEl) {
      timerEl.textContent = this.announcementRemaining + ' 秒后自动关闭';
    }
  },

  closeAnnouncement() {
    const overlay = document.getElementById('announcement-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (this.announcementTimer) {
      clearInterval(this.announcementTimer);
      this.announcementTimer = null;
    }
  },

  trafficAction(modalId, action) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    const container = overlay.querySelector('.modal-container');
    if (action === 'close') {
      overlay.classList.add('hidden');
      if (container) container.classList.remove('maximized', 'minimized');
    } else if (action === 'minimize') {
      if (container) {
        if (container.classList.contains('minimized')) container.classList.remove('minimized');
        else { container.classList.remove('maximized'); container.classList.add('minimized'); }
      }
    } else if (action === 'maximize') {
      if (container) { container.classList.remove('minimized'); container.classList.toggle('maximized'); }
    }
  },

  // ===== 发动态 =====
  showPostModal() {
    document.getElementById('post-modal').classList.remove('hidden');
    document.getElementById('post-author').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-content').focus();
  },

  async submitPost(e) {
    e.preventDefault();
    const author = document.getElementById('post-author').value.trim() || '匿名访客';
    const content = document.getElementById('post-content').value.trim();
    if (!content) return;

    try {
      await ActivityAPI.create(content, author);
      document.getElementById('post-modal').classList.add('hidden');
      this.loadActivities();
    } catch (err) {
      alert('发布失败：' + err.message);
    }
  },

  switchContribTab(type) {
    this.currentContribType = type;
    document.querySelectorAll('.contrib-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });
    document.getElementById('contrib-form-normal').classList.toggle('hidden', type !== 'normal');
    document.getElementById('contrib-form-signed').classList.toggle('hidden', type !== 'signed');
  },

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
        document.querySelector('#contributor-modal .modal-body').innerHTML =
          '<div class="contrib-success">' +
          '<div class="check-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' +
          '<h3>申请已提交</h3>' +
          '<p>感谢您的申请！我们将在 3 个工作日内通过邮件回复审核结果。</p>' +
          '</div>';
      } else alert('提交失败：' + (result.error || '未知错误'));
    } catch (e) {
      alert('提交失败，请稍后重试');
    }
  },

  // ===== 进入动画 =====
  startEntryAnimation() {
    const overlay = document.getElementById('entry-overlay');
    const mainInterface = document.getElementById('main-interface');

    setTimeout(() => {
      overlay.classList.add('fade-out');
      mainInterface.classList.add('visible');
      setTimeout(() => {
        overlay.style.display = 'none';
        this.loadAll();
        // 检测公告弹窗
        setTimeout(() => this.checkAnnouncement(), 500);
      }, 700);
    }, 3800);
  },

  // ===== 加载所有数据 =====
  loadAll() {
    this.loadCategoriesWithCards();
    this.loadActivities();
    this.loadLibraryFiles();
    this.loadMusic();
  },

  // ===== 左侧边栏分类 + 分类卡片（联合加载） =====
  async loadCategoriesWithCards() {
    try {
      const result = await CategoryAPI.getAll();
      this.allCategories = result.data || [];

      // 更新关于我们统计
      const catCountEl = document.getElementById('about-cat-count');
      if (catCountEl) catCountEl.textContent = this.allCategories.length;

      // 获取文件数据以计算每个分类的文件数
      const fileResult = await FileAPI.getAll(null);
      this.allFiles = fileResult.data || [];
      const fileCountEl = document.getElementById('about-file-count');
      if (fileCountEl) fileCountEl.textContent = this.allFiles.length;

      // 计算每个分类的文件数和最新更新时间
      const catStats = {};
      this.allCategories.forEach((c) => { catStats[c.id] = { count: 0, latestDate: c.created_at }; });
      this.allFiles.forEach((f) => {
        if (catStats[f.category_id]) {
          catStats[f.category_id].count++;
          const fDate = f.approved_at || f.uploaded_at;
          if (fDate && fDate > catStats[f.category_id].latestDate) {
            catStats[f.category_id].latestDate = fDate;
          }
        }
      });

      // ---- 渲染左侧边栏分类列表 ----
      const sidebarContainer = document.getElementById('sidebar-category-list');
      sidebarContainer.innerHTML = '';

      // "全部" 链接
      const allLink = document.createElement('a');
      allLink.className = 'sidebar-cat-link active';
      allLink.textContent = '全部';
      allLink.addEventListener('click', () => {
        this.selectCategory(null);
        document.querySelectorAll('.sidebar-cat-link').forEach((l) => l.classList.remove('active'));
        allLink.classList.add('active');
      });
      sidebarContainer.appendChild(allLink);

      // 各分类链接
      this.allCategories.forEach((cat) => {
        const link = document.createElement('a');
        link.className = 'sidebar-cat-link';
        link.textContent = cat.name;
        link.addEventListener('click', () => {
          this.selectCategory(cat.id);
          document.querySelectorAll('.sidebar-cat-link').forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
        });
        sidebarContainer.appendChild(link);
      });

      // ---- 渲染主内容区分类卡片 ----
      const cardsContainer = document.getElementById('category-cards-container');
      cardsContainer.innerHTML = '';

      // "全部" 卡片
      const allCard = document.createElement('div');
      allCard.className = 'cat-card active';
      allCard.id = 'cat-card-all';
      allCard.innerHTML =
        '<div class="cc-name">全部</div>' +
        '<div class="cc-sub">所有文件</div>' +
        '<div class="cc-date">' + this.allFiles.length + ' 个文件</div>';
      allCard.addEventListener('click', () => this.selectCategory(null));
      cardsContainer.appendChild(allCard);

      // 各分类卡片
      this.allCategories.forEach((cat) => {
        const stats = catStats[cat.id] || { count: 0, latestDate: '-' };
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.id = 'cat-card-' + cat.id;
        const dateStr = stats.latestDate ? stats.latestDate.slice(0, 10) : '-';
        card.innerHTML =
          '<div class="cc-name">' + cat.name + '</div>' +
          '<div class="cc-sub">创作者: ' + (cat.creator || '-') + '</div>' +
          '<div class="cc-date">更新: ' + dateStr + '</div>';
        card.addEventListener('click', () => this.selectCategory(cat.id));
        cardsContainer.appendChild(card);
      });
    } catch (e) {
      console.error('加载分类失败:', e);
    }
  },

  // 选择分类（同时更新侧边栏高亮、卡片高亮、书库内容、同级切换）
  selectCategory(categoryId) {
    this.currentCategory = categoryId;

    // 更新侧边栏高亮
    document.querySelectorAll('.sidebar-cat-link').forEach((link) => link.classList.remove('active'));
    if (categoryId === null) {
      const firstLink = document.querySelector('#sidebar-category-list .sidebar-cat-link');
      if (firstLink) firstLink.classList.add('active');
    } else {
      const targetLink = Array.from(document.querySelectorAll('.sidebar-cat-link'))
        .find((l) => l.textContent === this.getCategoryNameById(categoryId));
      if (targetLink) targetLink.classList.add('active');
    }

    // 更新卡片高亮
    document.querySelectorAll('.cat-card').forEach((card) => card.classList.remove('active'));
    if (categoryId === null) {
      const allCard = document.getElementById('cat-card-all');
      if (allCard) allCard.classList.add('active');
    } else {
      const catCard = document.getElementById('cat-card-' + categoryId);
      if (catCard) catCard.classList.add('active');
    }

    // 刷新书库列
    this.loadLibraryFiles();
    // 刷新同级切换
    this.updatePeerSwitchList();
  },

  getCategoryNameById(id) {
    const cat = this.allCategories.find((c) => c.id === id);
    return cat ? cat.name : '';
  },

  // ===== 书库列（文件列表） =====
  async loadLibraryFiles() {
    try {
      let result;
      if (this.currentCategory) {
        result = await FileAPI.getAll(this.currentCategory);
      } else {
        result = await FileAPI.getAll(null);
      }

      const container = document.getElementById('library-column-body');
      const files = result.data || [];

      if (files.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无文件</div>';
        return;
      }

      container.innerHTML = files.map((f) => {
        const ext = (f.original_name || f.filename).split('.').pop().toLowerCase();
        const safeName = (f.original_name || f.filename).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return (
          '<div class="library-file-item" onclick="App.previewFile(' + f.id + ', \'' + safeName + '\')">' +
          '<div class="library-file-icon"><span>' + ext + '</span></div>' +
          '<div class="library-file-info">' +
          '<div class="lf-name" title="' + safeName + '">' + f.original_name + '</div>' +
          '<div class="lf-meta">' + (f.category_name || '') + ' / ' + f.creator + '</div>' +
          '</div>' +
          '</div>'
        );
      }).join('');
    } catch (e) {
      document.getElementById('library-column-body').innerHTML = '<div class="empty-state">加载失败</div>';
    }
  },

  // ===== 动态列 =====
  async loadActivities() {
    try {
      const result = await ActivityAPI.getAll();
      const container = document.getElementById('activity-column-body');

      if (result.data.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无动态</div>';
        return;
      }

      container.innerHTML = result.data.map((a) => {
        const typeLabel = a.type === 'upload' ? '上传' : a.type === 'approve' ? '审核通过' : '评论';
        return (
          '<div class="activity-entry" id="activity-' + a.id + '">' +
          '<div class="ae-content"><span style="color:#f97316;font-weight:600">[' + typeLabel + '] </span>' + a.content + '</div>' +
          '<div class="ae-meta">' +
          '<span>' + a.author + ' / ' + a.created_at.slice(0, 16).replace('T', ' ') + '</span>' +
          '<button class="ae-comment-btn" onclick="App.showCommentBox(' + a.id + ')">评论 (' + (a.commentCount || 0) + ')</button>' +
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

    if (!box.classList.contains('hidden')) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '<div style="font-size:0.7rem;color:#9ca3af;padding:8px 0;">加载中...</div>';

    try {
      const result = await CommentAPI.getByActivity(activityId);
      const comments = result.data;

      let html = '<div class="comment-box-inner">';
      if (comments.length === 0) {
        html += '<div style="font-size:0.7rem;color:#9ca3af;padding:6px 0;">暂无评论</div>';
      } else {
        comments.forEach((c) => {
          html += '<div class="cmt-item"><span class="cmt-author">' + c.author + '</span>: ' + c.content + '</div>';
        });
      }
      html += '</div>';

      html += '<div class="cmt-input-row">' +
        '<input type="text" id="comment-input-' + activityId + '" placeholder="输入评论...">' +
        '<input type="text" id="comment-author-' + activityId + '" placeholder="昵称" style="max-width:70px">' +
        '<button onclick="App.submitComment(' + activityId + ')">发表</button>' +
        '</div>';

      box.innerHTML = html;

      const input = document.getElementById('comment-input-' + activityId);
      if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitComment(activityId); });
    } catch (e) {
      box.innerHTML = '<div style="font-size:0.7rem;color:#ef4444;padding:8px 0;">加载失败</div>';
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
      this.showCommentBox(activityId);
      this.loadActivities();
    } catch (e) {
      alert('评论失败：' + e.message);
    }
  },

  // ===== 音乐播放器 =====
  async loadMusic() {
    try {
      const result = await MusicAPI.getList();
      this.playlist = result.data || [];

      // 渲染音乐列表
      this.renderPlaylist();

      if (this.playlist.length > 0) {
        this.currentMusicIndex = 0;
        this.updatePlayerUI();
      }
    } catch (e) {
      console.error('加载音乐列表失败:', e);
    }
  },

  renderPlaylist() {
    const container = document.getElementById('music-playlist');
    if (this.playlist.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">暂无音乐</div>';
      return;
    }

    container.innerHTML = this.playlist.map((song, index) =>
      '<div class="playlist-item' + (index === this.currentMusicIndex ? ' playing' : '') + '" onclick="App.playSongAtIndex(' + index + ')">' +
      '<span class="pi-index">' + (index + 1) + '</span>' +
      '<span class="pi-name">' + song.name + '</span>' +
      '<div class="pi-playing-icon"><span></span><span></span><span></span></div>' +
      '</div>'
    ).join('');
  },

  updatePlaylistHighlight() {
    document.querySelectorAll('.playlist-item').forEach((item, index) => {
      item.classList.toggle('playing', index === this.currentMusicIndex);
    });
  },

  updatePlayerUI() {
    const nameEl = document.getElementById('now-playing-name');
    if (!this.playlist.length || this.currentMusicIndex < 0) {
      nameEl.textContent = '暂无音乐';
      return;
    }
    nameEl.textContent = this.playlist[this.currentMusicIndex].name;
    this.updatePlaylistHighlight();
  },

  playMusic() {
    if (this.playlist.length === 0) return;

    if (this.audio) this.audio.pause();

    const song = this.playlist[this.currentMusicIndex];
    this.audio = new Audio(song.url);

    const progressFill = document.getElementById('music-progress-fill');
    const playBtn = document.getElementById('music-play-btn');

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio.duration) {
        progressFill.style.width = ((this.audio.currentTime / this.audio.duration) * 100) + '%';
      }
    });

    this.audio.addEventListener('ended', () => this.nextMusic());

    this.audio.play().then(() => {
      playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
    }).catch((e) => console.error('播放失败:', e));

    this.updatePlayerUI();
  },

  togglePlay() {
    const playBtn = document.getElementById('music-play-btn');
    if (!this.audio) {
      this.playMusic();
      return;
    }
    if (this.audio.paused) {
      this.audio.play();
      playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
    } else {
      this.audio.pause();
      playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
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

  playSongAtIndex(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentMusicIndex = index;
    this.playMusic();
  },

  // ===== 文件预览 & 打开的文件管理（内嵌面板版） =====
  previewFile(fileId, fileName) {
    // 添加到已打开列表
    const exists = this.openedFiles.find((f) => f.id === fileId);
    if (!exists) {
      this.openedFiles.push({ id: fileId, name: fileName || ('file_' + fileId) });
    }
    this.currentPreviewFile = { id: fileId, name: fileName || ('file_' + fileId) };

    // 更新侧边栏
    this.updateOpenedFilesList();
    this.updatePeerSwitchList();
    
    // 打开内嵌预览面板
    Preview.open(fileId);
  },

  // 关闭预览面板，回到默认三列视图
  closePreviewPanel() {
    Preview.close();
  },

  // 最小化预览面板（暂时隐藏，保留状态）
  minimizePreviewPanel() {
    const panel = document.getElementById('preview-panel');
    const body = document.getElementById('preview-panel-body');
    if (panel && !panel.classList.contains('hidden')) {
      body.classList.toggle('minimized');
    }
  },

  // 最大化预览面板（进入全屏模式）
  maximizePreviewPanel() {
    const body = document.getElementById('preview-panel-body');
    if (body) {
      body.classList.toggle('maximized');
      if (body.classList.contains('maximized')) {
        Preview.enterFullscreen();
      }
    }
  },

  // 退出全屏预览
  exitFullscreenPreview() {
    Preview.exitFullscreen();
    const body = document.getElementById('preview-panel-body');
    if (body) body.classList.remove('maximized');
  },

  updateOpenedFilesList() {
    const container = document.getElementById('opened-files-list');
    if (this.openedFiles.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">暂无打开文件</div>';
      return;
    }

    container.innerHTML = this.openedFiles.map((f) => {
      const isCurrent = this.currentPreviewFile && this.currentPreviewFile.id === f.id;
      return (
        '<div class="opened-file-item' + (isCurrent ? ' current' : '') + '" onclick="App.previewFile(' + f.id + ', \'' + (f.name || '').replace(/'/g, "\\'") + '\')">' +
        '<span class="file-dot"></span>' +
        '<span class="file-name-text" title="' + f.name + '">' + f.name + '</span>' +
        '</div>'
      );
    }).join('');
  },

  updatePeerSwitchList() {
    const container = document.getElementById('peer-switch-list');
    // 找到当前文件的同类文件（同分类）
    if (!this.currentPreviewFile) {
      container.innerHTML = '<div class="empty-state-sm">选择文件后显示</div>';
      return;
    }

    // 从 allFiles 中找到当前文件的分类
    const currentFileInfo = this.allFiles.find((f) => f.id === this.currentPreviewFile.id);
    if (!currentFileInfo) {
      container.innerHTML = '<div class="empty-state-sm">未找到文件信息</div>';
      return;
    }

    const categoryId = currentFileInfo.category_id;
    // 筛选同级文件（同分类，排除自己）
    const peerFiles = this.allFiles.filter((f) => f.category_id === categoryId && f.id !== currentFileInfo.id);

    if (peerFiles.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">无同级文件</div>';
      return;
    }

    container.innerHTML = peerFiles.map((f) => {
      const safeName = (f.original_name || f.filename).replace(/'/g, "\\'");
      return (
        '<div class="peer-file-item" onclick="App.previewFile(' + f.id + ', \'' + safeName + '\')">' +
        '<span>' + f.original_name + '</span>' +
        '</div>'
      );
    }).join('');
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
    if (!username || !password) { alert('请输入用户名和密码'); return; }

    try {
      await Auth.login(username, password);
      document.getElementById('login-modal').classList.add('hidden');
      this.loadAll();
    } catch (e) {
      alert('登录失败：' + e.message);
    }
  },

  // ===== 调试保护 =====
  setupDebugProtection() {
    document.addEventListener('contextmenu', (e) => {
      if (!window._SUPER_ADMIN_MODE_) e.preventDefault();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (window._SUPER_ADMIN_MODE_) return;
      if (e.key === 'F12' || e.keyCode === 123) { e.preventDefault(); return false; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c' || e.keyCode === 73 || e.keyCode === 67)) { e.preventDefault(); return false; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) { e.preventDefault(); return false; }
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.keyCode === 85)) { e.preventDefault(); return false; }
      if (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.keyCode === 83)) { e.preventDefault(); return false; }
    }, true);

    setInterval(() => {
      if (!window._SUPER_ADMIN_MODE_) {
        const before = new Date();
        debugger;
        const after = new Date();
        if (after - before > 100) console.clear();
      }
    }, 1000);
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
