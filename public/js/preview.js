// ===== 文件预览模块（Supabase Storage 版本） =====
const Preview = {
  modal: null,
  overlay: null,
  _currentFileId: null,

  init() {
    this.overlay = document.getElementById('preview-overlay');
    this.modal = document.getElementById('preview-modal');

    // 点击遮罩关闭
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }
  },

  async open(fileId) {
    this._currentFileId = fileId;
    try {
      const titleEl = document.getElementById('preview-title');
      const bodyEl = document.getElementById('preview-body');

      titleEl.textContent = '加载中...';
      bodyEl.innerHTML = '<p class="text-gray-400 text-center py-8">正在加载文件内容...</p>';
      this.overlay.classList.remove('hidden');

      const result = await FileAPI.preview(fileId);
      const file = result.data;

      titleEl.textContent = file.original_name || file.filename;

      if (file.type === 'md') {
        // 使用 marked.js 渲染 Markdown
        bodyEl.innerHTML = '<div class="markdown-body">' + marked.parse(file.content || '') + '</div>';
      } else if (file.type === 'txt') {
        bodyEl.innerHTML = '<pre class="whitespace-pre-wrap font-mono text-sm text-gray-700">' + this.escapeHtml(file.content || '') + '</pre>';
      } else if (['ppt', 'pptx', 'doc', 'docx'].includes(file.type)) {
        const publicUrl = file.previewUrl;
        const encodedUrl = encodeURIComponent(publicUrl);

        // Office 文件预览：多源降级策略
        // 1. Microsoft Office Online（国际）
        // 2. Google Docs Viewer（备选）
        // 3. 最终兜底：直接下载
        bodyEl.innerHTML =
          '<div class="office-preview-container">' +
          '<iframe id="office-iframe" ' +
          'src="https://view.officeapps.live.com/op/embed.aspx?src=' + encodedUrl + '" ' +
          'width="100%" ' +
          'height="600" ' +
          'frameborder="0" ' +
          'class="rounded-lg"' +
          '></iframe>' +
          '</div>' +
          '<div class="mt-3 flex flex-wrap gap-2 justify-center">' +
          '<a href="' + publicUrl + '" target="_blank" rel="noopener noreferrer" ' +
          'class="inline-block px-4 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium">' +
          '下载文件</a>' +
          '<button onclick="this.previousElementSibling.click();const frm=document.getElementById(\'office-iframe\');if(frm)frm.src=\'https://docs.google.com/viewer?url=' + encodedUrl + '&embedded=true\';" ' +
          'class="inline-block px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm">' +
          '切换 Google 预览</button>' +
          '</div>';

        // 检测 Office 预览加载失败，自动切换提示
        const iframe = document.getElementById('office-iframe');
        if (iframe) {
          iframe.addEventListener('load', function() {
            try {
              // 如果 iframe 内容被阻止，会抛出跨域错误
              // 这里仅做标记，实际由用户手动切换
            } catch(e) {}
          });
        }
      } else if (file.type === 'music') {
        // 音乐播放器
        bodyEl.innerHTML =
          '<div class="flex flex-col items-center py-6 gap-4">' +
          '<audio controls preload="metadata" class="w-full max-w-md"><source src="' + (file.previewUrl || file.content_url || '') + '" type="audio/mpeg">浏览器不支持音频播放</audio>' +
          '<a href="' + (file.previewUrl || file.content_url || '') + '" download="' + this.escapeHtml(file.original_name || file.filename) + '" ' +
          'class="inline-block px-4 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium">下载音乐</a>' +
          '</div>';
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
    // 通知 Dock 移除该文件
    if (this._currentFileId && typeof App !== 'undefined' && App.removeDockFileItem) {
      App.removeDockFileItem(this._currentFileId);
    }
    this._currentFileId = null;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
