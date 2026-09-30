import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const npmCli = process.env.npm_execpath;
const action = process.argv[2];
if (!npmCli || !["start", "package"].includes(action)) {
  console.error("请使用 npm run desktop 或 npm run package:desktop。");
  process.exit(1);
}
if (!existsSync(path.join(root, "desktop/node_modules/electron"))) {
  console.error("请先运行 npm ci --prefix desktop 安装桌面构建依赖。");
  process.exit(1);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(signal ? `进程被 ${signal} 中止` : `命令退出码 ${code}`));
    });
  });
}

try {
  await run(["run", "build:desktop"]);
  await run(["--prefix", "desktop", "run", action === "start" ? "start" : "dist:win"]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
