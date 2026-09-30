# Ming Image Studio

中文网页工作台，结合 `inclusionai/ming-image-0.1-design` 文字生图和 `inclusionai/ming-image-0.1-design-layer` 图片拆层。

在网页中输入自己的 OpenRouter API 密钥。密钥仅保留于页面内存，刷新或关闭页面后清除。GitHub Pages 版由浏览器直接调用 OpenRouter；本地开发和 Worker 版通过 `/api/images` 转发。每次提交前查询公开价格信息，仅在所有对应 Novita 端点价格可明确确认是零时提交，并禁止 provider fallback。价格检查与执行存在时间间隔，最终费用以 OpenRouter 为准。

## Windows 桌面版

桌面版与网页共用同一工作台，提供 Windows 10/11 x64 安装包和免安装 ZIP。界面、原图与六张示例图层随软件一起打包；生图与拆层仍需要联网，使用你在软件中输入的 OpenRouter 密钥。密钥只驻留当前界面内存，退出或刷新后清除。PNG 和 ZIP 导出会打开 Windows“另存为”窗口。

安装包：双击 `Ming-Image-Studio-0.1.0-win-x64-Setup.exe`，安装到当前用户，创建桌面与开始菜单快捷方式。免安装版：完整解压 `Ming-Image-Studio-0.1.0-win-x64.zip` 后运行目录里的 `Ming Image Studio.exe`，不要只复制 EXE。

本机构建：

```powershell
npm ci
npm ci --prefix desktop
npm run desktop
```

生成安装包和免安装版：

```powershell
npm run package:desktop
```

成品位于 `releases`；独立前端产物位于 `dist/desktop`。首版安装包未配置代码签名证书。桌面壳使用 Electron 隔离沙箱和本地协议，未暴露 Node.js 或 IPC 给网页；外部模型链接在系统浏览器打开。

## 网页本地启动

```powershell
npm install
npm run dev
```

打开终端打印的本地地址。`npm run build` 生成 Cloudflare Workers 部署文件。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。之后推送到 `main` 会自动构建并发布；也可在 Actions 中运行 **Deploy GitHub Pages**。

线上地址：[Ming Image Studio](https://sggg221.github.io/ming-image-studio/)。网站发布成功后才可访问。

静态构建和本地预览：

```powershell
npm ci
npm run build:pages
npm run preview:pages
```

预览地址：`http://127.0.0.1:4173/ming-image-studio/`。构建产物位于 `dist/pages`，独立于 Worker 产物。

Pages 版本不需要部署后端或设置共享 API 密钥。用户在页面中输入自己的 OpenRouter 密钥，浏览器直接请求 OpenRouter 的 `novita` 端点。密钥只保留在当前页面内存；请勿把密钥提交到代码、Issue 或构建日志中。

## 功能

- 文字生图、提示词画幅指引
- PNG / JPG / WebP 原图上传（最大 10 MB）
- 2–9 层目标拆分及自定义语义要求
- 成图一键送入拆层，放大预览，PNG 和 ZIP 下载
- 展示返回尺寸、API 往返耗时与上游报告费用
- 预置用户此前实测的耳机广告与六层 PNG；示例与本次结果明确区分

实际层数、像素尺寸、图层边界与提示词要求可能不同。应用不会自动重试超时请求。刷新网页会清除密钥与新生成的会话结果。两项 WebMCP 工具只读取非敏感工作台状态或准备提示词，不调用付费接口。
