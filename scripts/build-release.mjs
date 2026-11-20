// 发布构建：带 VITE_HONGYI_RELEASE=1 跑 vite build（去掉洪译实测入口与代码）。跨平台，不依赖 cross-env。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const vite = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "vite", "bin", "vite.js");
const r = spawnSync(process.execPath, [vite, "build"], {
  stdio: "inherit",
  env: { ...process.env, VITE_HONGYI_RELEASE: "1" },
});
process.exit(r.status ?? 1);
