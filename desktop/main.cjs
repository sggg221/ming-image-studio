"use strict";

const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { APP_URL, createAssetHandler, isExternalUrl, isAllowedRequest, downloadName, isAllowedDownload } = require("./security.cjs");

app.setName("Ming Image Studio");
app.setAppUserModelId("chat.mingimagestudio.app");
protocol.registerSchemesAsPrivileged([{ scheme: "mingstudio", privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);

let mainWindow;
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const resourceRoot = app.isPackaged ? path.join(process.resourcesPath, "studio") : path.join(__dirname, "..", "dist", "desktop");
    try { await fs.access(path.join(resourceRoot, "index.html")); }
    catch {
      dialog.showErrorBox("Ming Image Studio", "找不到本地界面文件。开发模式请先运行 npm run build:desktop；安装版本请重新解压或安装完整程序。");
      app.quit();
      return;
    }

    // No persist: prefix: cookies, cache and browser storage stay in this process only.
    const studioSession = session.fromPartition("ming-image-studio-session", { cache: false });
    studioSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    studioSession.setPermissionCheckHandler(() => false);
    studioSession.setDevicePermissionHandler(() => false);
    studioSession.protocol.handle("mingstudio", createAssetHandler(resourceRoot));
    studioSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isAllowedRequest(details.url) });
    });
    studioSession.on("will-download", (event, item, contents) => {
      const allowed = mainWindow && !mainWindow.isDestroyed() && contents === mainWindow.webContents &&
        isAllowedDownload({ url: item.getURL(), initiatorOrigin: item.getInitiatorOrigin(),
          filename: item.getFilename(), mimeType: item.getMimeType(), totalBytes: item.getTotalBytes() });
      if (!allowed) { event.preventDefault(); return; }
      const filename = downloadName(item.getFilename());
      const extension = path.extname(filename).slice(1).toLowerCase();
      // Let Electron display its native Save dialog; never choose a destination silently.
      item.setSaveDialogOptions({ title: extension === "zip" ? "保存全部图层" : "保存图片",
        defaultPath: path.join(app.getPath("downloads"), filename),
        filters: [{ name: extension === "zip" ? "ZIP 图层压缩包" : "PNG 图片", extensions: [extension] }],
      });
      item.once("done", (_downloadEvent, state) => {
        if (state === "interrupted" && mainWindow && !mainWindow.isDestroyed()) {
          void dialog.showMessageBox(mainWindow, { type: "error", title: "下载未完成", message: "文件未保存完整，请重新下载。" });
        }
      });
    });

    mainWindow = new BrowserWindow({ title: "Ming Image Studio", width: 1440, height: 1000,
      minWidth: 1024, minHeight: 720, show: false, backgroundColor: "#f8fafc",
      icon: path.join(__dirname, "assets", "icon.png"),
      webPreferences: { session: studioSession, contextIsolation: true, sandbox: true,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        webSecurity: true, webviewTag: false, spellcheck: false, devTools: !app.isPackaged,
      },
    });
    const contents = mainWindow.webContents;
    const openExternal = (url) => {
      if (isExternalUrl(url)) void shell.openExternal(url).catch(() => {
        if (mainWindow && !mainWindow.isDestroyed()) void dialog.showMessageBox(mainWindow, { type: "error", message: "无法打开系统浏览器，请手动打开模型页面。" });
      });
    };
    contents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
    contents.on("will-frame-navigate", (event) => {
      event.preventDefault();
      if (event.isMainFrame) openExternal(event.url);
    });
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) dialog.showErrorBox("界面加载失败", "无法加载本地界面文件，请重新打开完整安装包或解压后的程序。");
    });
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("closed", () => { mainWindow = null; });

    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "文件", submenu: [{ label: "重新加载", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.webContents.reload() }, { type: "separator" }, { role: "quit", label: "退出" }] },
      { label: "编辑", submenu: [{ role: "undo", label: "撤销" }, { role: "redo", label: "重做" }, { type: "separator" }, { role: "cut", label: "剪切" }, { role: "copy", label: "复制" }, { role: "paste", label: "粘贴" }, { role: "selectAll", label: "全选" }] },
      { label: "视图", submenu: [{ role: "resetZoom", label: "实际大小" }, { role: "zoomIn", label: "放大" }, { role: "zoomOut", label: "缩小" }, { role: "togglefullscreen", label: "全屏" }] },
    ]));
    await mainWindow.loadURL(APP_URL);
  }).catch(() => {
    dialog.showErrorBox("Ming Image Studio", "程序启动失败，请重新打开或重新安装。您的 API 密钥不会保存到磁盘。");
    app.quit();
  });
  app.on("window-all-closed", () => app.quit());
}
