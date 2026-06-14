// ===== 文件预览模块（Edge Function 代理版） =====
const Preview = {
  modal: null,
  overlay: null,
  _currentFileId: null,
  _currentBlobUrl: null,

  init() {
    this.overlay = document.getElementById('preview-overlay');
    this.modal = document.getElementById('preview-modal');
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }
  },

  async open(fileId) {
    // 清理上一个 blob URL
    if (this._currentBlobUrl) URL.revokeObjectURL(this._currentBlobUrl);
    this._currentBlobUrl = null;
    this._currentFileId = fileId;

    const titleEl = document.getElementById('preview-title');
    const bodyEl = document.getElementById('preview-body');

    titleEl.textContent = '加载中...';
    bodyEl.innerHTML = '<p class="text-gray-400 text-center py-8">正在加载文件内容...</p>';
    this.overlay.classList.remove('hidden');

    try {
      const result = await FileAPI.preview(fileId);
      const file = result.data;

      titleEl.textContent = file.original_name || file.filename;

      // 保存 blob URL 引用，关闭时释放
      if (file._blobUrl) this._currentBlobUrl = file._blobUrl;

      if (file.type === 'md') {
        // Markdown 渲染
        bodyEl.innerHTML = '<div class="markdown-body">' + marked.parse(file.content || '') + '</div>';
      } else if (file.type === 'txt') {
        // 纯文本显示
        bodyEl.innerHTML = '<pre class="whitespace-pre-wrap font-mono text-sm text-gray-700">' + this.escapeHtml(file.content || '') + '</pre>';
      } else if (['ppt', 'pptx', 'doc', 'docx'].includes(file.type)) {
        // Office 文件：提供下载（Office Online 不支持 blob URL，直接下载最可靠）
        const dlUrl = file.previewUrl || '';
        const fileName = this.escapeHtml(file.original_name || file.filename);
        bodyEl.innerHTML =
          '<div class="flex flex-col items-center py-10 gap-4">' +
          '<div class="w-20 h-20 bg-orange-100 rounded-xl flex items-center justify-center">' +
          '<span class="text-3xl font-bold text-orange-500">' + (file.type === 'doc' || file.type === 'docx' ? 'W' : 'P') + '</span>' +
          '</div>' +
          '<p class="text-gray-600 text-sm">此文件类型请在本地打开查看</p>' +
          '<a href="' + dlUrl + '" download="' + fileName + '" ' +
          'class="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>' +
          '下载 ' + fileName + '</a>' +
          '</div>';
      } else if (file.type === 'music') {
        // 音乐播放器
        const srcUrl = file.previewUrl || '';
        bodyEl.innerHTML =
          '<div class="flex flex-col items-center py-6 gap-4">' +
          '<audio controls autoplay preload="metadata" class="w-full max-w-md rounded-lg">' +
          '<source src="' + srcUrl + '" type="audio/mpeg">浏览器不支持音频播放</audio>' +
          '<a href="' + srcUrl + '" download="' + this.escapeHtml(file.original_name || file.filename) + '" ' +
          'class="inline-block px-4 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium">下载音乐</a>' +
          '</div>';
      } else {
        bodyEl.innerHTML = '<p class="text-gray-500 text-center py-8">不支持预览此文件类型</p>';
      }
    } catch (e) {
      bodyEl.innerHTML = '<p class="text-red-500 text-center py-8">加载失败：' + this.escapeHtml(e.message) + '</p>';
    }
  },

  close() {
    // 释放 Blob URL 内存
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }
    if (this.overlay) this.overlay.classList.add('hidden');
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
