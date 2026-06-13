// ===== 文件预览模块 =====
const Preview = {
  modal: null,
  overlay: null,

  init() {
    this.overlay = document.getElementById('preview-overlay');
    this.modal = document.getElementById('preview-modal');

    // 点击遮罩关闭
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }

    // 关闭按钮
    const closeBtn = document.getElementById('preview-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  },

  async open(fileId) {
    try {
      const titleEl = document.getElementById('preview-title');
      const bodyEl = document.getElementById('preview-body');

      titleEl.textContent = '加载中...';
      bodyEl.innerHTML = '<p class="text-gray-400 text-center py-8">正在加载文件内容...</p>';
      this.overlay.classList.remove('hidden');

      const result = await FileAPI.preview(fileId);
      const file = result.data;

      titleEl.textContent = file.filename;

      if (file.type === 'md') {
        // 使用 marked.js 渲染 Markdown
        bodyEl.innerHTML = '<div class="markdown-body">' + marked.parse(file.content || '') + '</div>';
      } else if (file.type === 'txt') {
        bodyEl.innerHTML = '<pre class="whitespace-pre-wrap font-mono text-sm text-gray-700">' + this.escapeHtml(file.content || '') + '</pre>';
      } else if (['ppt', 'pptx', 'doc', 'docx'].includes(file.type)) {
        // Office 文件预览：优先尝试 Office Online，失败时显示下载链接
        const rawPath = file.rawPath || file.previewUrl;
        const fullUrl = window.location.origin + rawPath;
        const encodedUrl = encodeURIComponent(fullUrl);
        // 判断是否为本地环境（localhost / 127.0.0.1）
        const isLocalhost = /^(http:\/\/)?(localhost|127\.0\.0\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(window.location.origin);

        if (isLocalhost) {
          // 本地环境无法使用 Office Online，直接提供下载
          bodyEl.innerHTML =
            '<div class="text-center py-8">' +
            '<p class="text-gray-500 mb-4">Office 在线预览仅支持公网访问的地址</p>' +
            '<p class="text-gray-400 text-sm mb-4">本地开发环境下，请下载文件后打开查看</p>' +
            '<a href="' + rawPath + '" download="' + this.escapeHtml(file.filename) + '" ' +
            'class="inline-block px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">' +
            '下载文件</a>' +
            '</div>';
        } else {
          // 生产环境：Office Online iframe 预览
          bodyEl.innerHTML =
            '<iframe ' +
            'src="https://view.officeapps.live.com/op/embed.aspx?src=' + encodedUrl + '" ' +
            'width="100%" ' +
            'height="600" ' +
            'frameborder="0" ' +
            'class="rounded-lg"' +
            '></iframe>' +
            '<div class="mt-3 text-center">' +
            '<a href="' + rawPath + '" download="' + this.escapeHtml(file.filename) + '" ' +
            'class="inline-block px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm">' +
            '如预览失败请点击下载</a>' +
            '</div>';
        }
      } else {
        bodyEl.innerHTML = '<p class="text-gray-500 text-center py-8">不支持预览此文件类型</p>';
      }
    } catch (e) {
      const bodyEl = document.getElementById('preview-body');
      bodyEl.innerHTML = '<p class="text-red-500 text-center py-8">加载失败：' + this.escapeHtml(e.message) + '</p>';
    }
  },

  close() {
    if (this.overlay) this.overlay.classList.add('hidden');
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
