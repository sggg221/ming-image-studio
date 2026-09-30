# Ming Image Studio

中文网页工作台，结合 `inclusionai/ming-image-0.1-design` 文字生图和 `inclusionai/ming-image-0.1-design-layer` 图片拆层。

在网页中输入自己的 OpenRouter API 密钥。密钥仅保留于页面内存，通过本站服务端转发到 OpenRouter；不写入磁盘，不提供共享密钥。每次提交前查询公开价格信息，仅在所有对应 Novita 端点价格可明确确认是零时提交，并禁止 provider fallback。价格检查与执行存在时间间隔，最终费用以 OpenRouter 为准。

## 本地启动

```powershell
npm install
npm run dev
```

打开终端打印的本地地址。`npm run build` 生成 Cloudflare Workers 部署文件。

## 功能

- 文字生图、提示词画幅指引
- PNG / JPG / WebP 原图上传（最大 10 MB）
- 2–9 层目标拆分及自定义语义要求
- 成图一键送入拆层，放大预览，PNG 和 ZIP 下载
- 展示返回尺寸、API 往返耗时与上游报告费用
- 预置用户此前实测的耳机广告与六层 PNG；示例与本次结果明确区分

实际层数、像素尺寸、图层边界与提示词要求可能不同。应用不会自动重试超时请求。刷新网页会清除密钥与新生成的会话结果。两项 WebMCP 工具只读取非敏感工作台状态或准备提示词，不调用付费接口。

