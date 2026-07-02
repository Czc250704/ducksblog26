---
name: preview-scrollbar-wps
overview: 为预览面板添加自定义滚动条，并将 Office 文档预览改为内嵌 WPS 直接预览、移除下载与跳转。
todos:
  - id: add-preview-scrollbar
    content: 为 .preview-panel-body 添加橘色自定义滚动条样式
    status: completed
  - id: wps-office-iframe
    content: 将 Office 预览改为 WPS 内嵌 iframe，移除下载与跳转
    status: completed
    dependencies:
      - add-preview-scrollbar
---

## Product Overview

优化 Duck's Blog 文件预览面板的交互体验：让 Markdown 等长内容在预览面板内滚动时使用与页面一致的橘色滚动条；将 Office 文档（Word / PPT / Excel）预览从「跳转 Microsoft Office Online + 下载按钮」改为直接内嵌 WPS 在线预览。

## Core Features

- 预览面板内容区添加统一橘色自定义滚动条
- Office 文档直接在当前面板内嵌预览
- Office 预览去除下载按钮与跳转行为
- 使用 WPS 在线预览服务替代 Microsoft Office Online

## Tech Stack

- 前端：HTML + Tailwind CSS（CDN） + 原生 JavaScript
- 文件预览：WPS 在线预览 iframe（`https://wwo.wps.cn/office/?_w_=1&url=`）
- 无需改动后端

## Implementation Approach

1. 在 `public/css/style.css` 中为 `.preview-panel-body` 补充与 `.column-body` 一致的 `scrollbar-width` / `::-webkit-scrollbar` 自定义滚动条样式，解决长 Markdown 文档使用浏览器默认滚动条的问题。
2. 在 `public/js/preview.js` 中将 `Preview._renderOffice` 从「按钮卡片 + 新窗口打开 Microsoft Office Online + 下载按钮」改为「直接内嵌 iframe」，iframe 地址通过 WPS 在线预览服务构造：

- 将后端返回的相对路径 `/storage/approved/xxx` 拼成 `window.location.origin + previewUrl` 的绝对地址；
- 使用 `encodeURIComponent` 编码后传入 `https://wwo.wps.cn/office/?_w_=1&url=`；
- 移除下载按钮和跳转链接，不再打开新标签。

3. 为 WPS iframe 容器添加 `width: 100%`、`min-height: 480px`、`border: none` 等样式，确保在预览面板和全屏模态框中自适应。

## Implementation Notes

- WPS 在线预览要求文件 URL 可被公网访问，部署到域名 `duckpublic.qd.je` 后生效；本地 `localhost` 可能无法加载，属于服务方限制，不影响代码实现。
- `.preview-panel-body` 仍保留 `overflow-y: auto`，Markdown/文本类内容继续走面板滚动条；Office 类内容由 iframe 自身滚动。
- 全屏预览通过 `enterFullscreen()` 复制面板 innerHTML，iframe 会随内容一起进入全屏模态框。
- 保持现有文件类型映射 `office: ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']` 不变。