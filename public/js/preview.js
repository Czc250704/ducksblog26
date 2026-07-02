// ===== 文件预览模块（全格式支持 + 内嵌面板） =====
const Preview = {
  _currentFileId: null,
  _currentBlobUrl: null,
  _isFullscreen: false,

  // 文件类型分类
  _typeMap: {
    // 文本/标记
    text: ['md', 'txt', 'log', 'csv', 'xml', 'json', 'html', 'htm', 'css', 'js', 'ts',
           'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
           'rb', 'php', 'sql', 'sh', 'bat', 'yaml', 'yml', 'toml', 'ini', 'conf',
           'env', 'gitignore', 'dockerfile', 'makefile'],
    // PDF
    pdf: ['pdf'],
    // 图片
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif'],
    // 音频
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'],
    // 视频
    video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'm4v'],
    // Office 文档（提供下载+在线预览链接）
    office: ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']
  },

  // 获取文件分类
  _getCategory(ext) {
    for (const [cat, exts] of Object.entries(this._typeMap)) {
      if (exts.includes(ext)) return cat;
    }
    return 'binary';
  },

  init() {
    // 初始化完成，无需绑定 overlay 事件
  },

  // 打开预览：写入内嵌面板
  async open(fileId) {
    if (this._currentBlobUrl) URL.revokeObjectURL(this._currentBlobUrl);
    this._currentBlobUrl = null;
    this._currentFileId = fileId;

    const panel = document.getElementById('preview-panel');
    const titleEl = document.getElementById('preview-panel-title');
    const bodyEl = document.getElementById('preview-panel-body');
    const defaultView = document.getElementById('default-view');

    titleEl.textContent = '加载中...';
    bodyEl.innerHTML = '<div class="preview-loading"><div class="loading-spinner"></div><p>正在加载文件内容...</p></div>';

    // 显示预览面板，隐藏默认三列视图
    panel.classList.remove('hidden');
    defaultView.classList.add('hidden');

    try {
      const result = await FileAPI.preview(fileId);
      const file = result.data;
      const fileType = (file.file_type || '').toLowerCase();
      const fileName = file.original_name || file.filename || ('file_' + fileId);

      titleEl.textContent = fileName;

      // 保存 blob URL 引用，关闭时释放
      if (file._blobUrl) this._currentBlobUrl = file._blobUrl;

      // 根据文件类型分发渲染
      const category = this._getCategory(fileType);
      
      switch (category) {
        case 'text':
          bodyEl.innerHTML = this._renderText(file, fileType, fileName);
          break;
        case 'pdf':
          bodyEl.innerHTML = this._renderPdf(file);
          break;
        case 'image':
          bodyEl.innerHTML = this._renderImage(file);
          break;
        case 'audio':
          bodyEl.innerHTML = this._renderAudio(file, fileName);
          break;
        case 'video':
          bodyEl.innerHTML = this._renderVideo(file);
          break;
        case 'office':
          bodyEl.innerHTML = this._renderOffice(file, fileName, fileType);
          break;
        default:
          bodyEl.innerHTML = this._renderBinary(file, fileName);
      }
    } catch (e) {
      bodyEl.innerHTML = '<div class="preview-error"><p>加载失败：' + this.escapeHtml(e.message) + '</p></div>';
    }
  },

  // ===== 渲染器：文本类（Markdown / 代码 / 纯文本） =====
  _renderText(file, ext, fileName) {
    let content = file.content || '';
    
    // Markdown 文件用 marked.js 渲染
    if (ext === 'md') {
      return '<div class="markdown-body">' + marked.parse(content) + '</div>';
    }

    // 代码文件：语法高亮显示（纯文本 + 行号）
    const codeExts = ['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sql', 'sh', 'css', 'html', 'htm', 'json', 'xml', 'yaml', 'yml'];
    const escapedContent = this.escapeHtml(content);
    const lines = content.split('\n');
    
    if (codeExts.includes(ext)) {
      let lineNumbers = lines.map((_, i) => '<span class="code-ln">' + (i + 1) + '</span>').join('');
      return (
        '<div class="code-preview-wrap">' +
        '<div class="code-preview-header"><span class="code-lang-badge">' + ext.toUpperCase() + '</span><span class="code-file-name">' + fileName + '</span></div>' +
        '<pre class="code-preview-block"><code class="code-lines-num">' + lineNumbers + '</code><code class="code-content">' + escapedContent.replace(/\n/g, '&#10;') + '</code></pre>' +
        '</div>'
      );
    }

    // 其他文本文件
    return '<pre class="text-preview-block">' + escapedContent + '</pre>';
  },

  // ===== 渲染器：PDF（iframe 嵌入 / 下载） =====
  _renderPdf(file) {
    const url = file.previewUrl || '';
    return (
      '<div class="pdf-preview-wrap">' +
      '<iframe class="pdf-iframe" src="' + url + '" title="PDF 预览"></iframe>' +
      '<div class="pdf-fallback">' +
      '<p>浏览器不支持内嵌 PDF 预览</p>' +
      '<a href="' + url + '" download class="download-btn">下载 PDF</a>' +
      '</div>' +
      '</div>'
    );
  },

  // ===== 渲染器：图片 =====
  _renderImage(file) {
    const url = file.previewUrl || '';
    return (
      '<div class="image-preview-wrap">' +
      '<img src="' + url + '" alt="图片预览" class="preview-image" onload="this.style.opacity=1">' +
      '</div>'
    );
  },

  // ===== 渲染器：音频 =====
  _renderAudio(file, fileName) {
    const url = file.previewUrl || '';
    return (
      '<div class="audio-preview-wrap">' +
      '<div class="audio-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="#f97316"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>' +
      '<div class="audio-info"><strong>' + this.escapeHtml(fileName) + '</strong></div>' +
      '<audio controls autoplay preload="metadata" class="audio-player">' +
      '<source src="' + url + '" type="audio/mpeg">浏览器不支持音频播放</audio>' +
      '<a href="' + url + '" download="' + this.escapeHtml(fileName) + '" class="download-btn-sm">下载</a>' +
      '</div>'
    );
  },

  // ===== 渲染器：视频 =====
  _renderVideo(file) {
    const url = file.previewUrl || '';
    return (
      '<div class="video-preview-wrap">' +
      '<video controls preload="metadata" class="video-player">' +
      '<source src="' + url + '">浏览器不支持视频播放</video>' +
      '</div>'
    );
  },

  // ===== 渲染器：Office 文档（WPS 内嵌预览） =====
  _renderOffice(file, fileName, ext) {
    const url = file.previewUrl || '';
    const absUrl = window.location.origin + url;
    const wpsUrl = 'https://wwo.wps.cn/office/?_w_=1&url=' + encodeURIComponent(absUrl);

    return (
      '<div class="wps-preview-wrap">' +
      '<div class="wps-loading">WPS 在线预览加载中...</div>' +
      '<iframe class="wps-iframe" src="' + wpsUrl + '" title="WPS 文档预览" allowfullscreen></iframe>' +
      '</div>'
    );
  },

  // ===== 渲染器：二进制文件（无法预览） =====
  _renderBinary(file, fileName) {
    const url = file.previewUrl || '';
    return (
      '<div class="binary-preview-wrap">' +
      '<div class="binary-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
      '<p class="binary-text">此文件类型暂不支持在线预览</p>' +
      '<a href="' + url + '" download="' + this.escapeHtml(fileName) + '" class="download-btn">下载文件</a>' +
      '</div>'
    );
  },

  // 关闭预览面板（回到默认三列视图）
  close() {
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }

    const panel = document.getElementById('preview-panel');
    const defaultView = document.getElementById('default-view');
    const fullscreenOverlay = document.getElementById('preview-overlay');

    panel.classList.add('hidden');
    defaultView.classList.remove('hidden');
    
    // 如果处于全屏模式，也关闭
    if (this._isFullscreen) {
      fullscreenOverlay.classList.add('hidden');
      this._isFullscreen = false;
    }

    // 重置面板大小状态
    const container = panel.querySelector('.preview-panel-body');
    if (container) container.classList.remove('maximized');

    this._currentFileId = null;

    // 通知 App 更新侧边栏
    if (typeof App !== 'undefined') {
      App.currentPreviewFile = null;
      App.updateOpenedFilesList();
      App.updatePeerSwitchList();
    }
  },

  // 进入全屏预览模式
  enterFullscreen() {
    const overlay = document.getElementById('preview-overlay');
    const titleEl = document.getElementById('preview-title');
    const fsBodyEl = document.getElementById('preview-body');
    const panelBodyEl = document.getElementById('preview-panel-body');

    // 复制当前内容到全屏模态框
    titleEl.textContent = document.getElementById('preview-panel-title').textContent;
    fsBodyEl.innerHTML = panelBodyEl.innerHTML;

    overlay.classList.remove('hidden');
    this._isFullscreen = true;
  },

  // 退出全屏预览模式
  exitFullscreen() {
    const overlay = document.getElementById('preview-overlay');
    overlay.classList.add('hidden');
    this._isFullscreen = false;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
