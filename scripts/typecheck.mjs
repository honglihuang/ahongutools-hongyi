#!/usr/bin/env node
// 类型检查：tsc -p tsconfig.typecheck.json。我方代码（src/、shims/、vite.config.ts）必须 0 错；
// 我方代码会导入上游模块，tsc 会顺带检查上游文件，上游（upstream/）的错误只计数，不算失败（上游自身依赖 WXT 生成的类型）。
// 退出码：0 = 我方 0 错；1 = 我方有错；2 = tsc 没跑起来。
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// typescript 7 的 exports 不导出 bin/，从 package.json 的位置推出 bin 路径。
const tsc = path.join(path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");
const res = spawnSync(process.execPath, [tsc, "-p", "tsconfig.typecheck.json", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
});
if (res.error || res.status === null) {
  console.error(`tsc 没跑起来：${res.error?.message ?? res.signal}`);
  process.exit(2);
}

// 每条诊断以 `文件(行,列): error TSxxxx:` 开头，后续缩进行是同一条的补充说明。
const diagnostics = [];
for (const line of `${res.stdout}${res.stderr}`.split(/\r?\n/)) {
  if (line === "") continue;
  if (/^\s/.test(line) && diagnostics.length > 0) diagnostics[diagnostics.length - 1].text += `\n${line}`;
  else diagnostics.push({ file: line.match(/^(.+?)\(\d+,\d+\): /)?.[1]?.replace(/\\/g, "/") ?? "", text: line });
}
const isUpstream = (file) => file.startsWith("upstream/");
const ours = diagnostics.filter((d) => !isUpstream(d.file));
const upstreamCount = diagnostics.length - ours.length;

for (const d of ours) console.log(d.text);
console.log(`类型检查：我方代码 ${ours.length} 个错误；上游代码 ${upstreamCount} 个（不计入，见 scripts/typecheck.mjs 说明）`);
if (ours.length === 0 && res.status !== 0 && diagnostics.length === 0) {
  console.error(`tsc 退出码 ${res.status}，但没有解析到诊断：\n${res.stdout}${res.stderr}`);
  process.exit(2);
}
process.exit(ours.length === 0 ? 0 : 1);
