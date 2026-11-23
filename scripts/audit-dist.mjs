#!/usr/bin/env node
// 发布包审计（零依赖）。用法：
//   node scripts/audit-dist.mjs [--dist dist] [--root .] [--report reports/dist-licenses.json] [--release]
// 退出码：0 = 无命中；1 = 有命中（逐条列出文件与位置）；2 = 参数或运行错误。
//
// 规则：
// A. 禁止文件：任何 *.map；名为 .git / .gitignore / .gitmodules / .github / .vscode 的文件或目录。
// B. 外部资源：只查「资源加载语法」，不查普通 URL 字符串。AI/翻译接口的端点
//    （如 fetch("https://api.openai.com/v1")、baseURL: "https://..."）不是资源加载，不算。
//    扫描 .html .htm .css .js .mjs .cjs .svg，命中以下任一且地址以 http://、https:// 或 // 开头：
//    - 标签属性：<任意标签 ... src= / srcset= / poster= / data=>，<link ... href=>，<image|use ... href=>
//    - CSS：url(...)、@import "..." / @import url(...)
//    - JS：import("...")、静态 import ... from "..."、importScripts("...")、new Worker("...")、
//          JSX 编译后的 src:"..." / srcSet:"..."、.src = "..."
//    <a href> 是跳转链接，不算资源加载。
// C. 禁用内容：所有文件按字节（latin1）扫描，见 FORBIDDEN。
// D. 必需文件：plugin.json、index.html、plugin.json 的 logo 与 preload 指向的文件；
//    plugin.json 不得含 development（开发期 dev server 配置，uTools 见到就改连 development.main）；
//    preload 及其用 require("./...") 引入的本地 js 必须是未压缩源码（见 MINIFIED_*）。
// E. 许可清单：读 package-lock.json 的生产依赖（排除 dev: true 与 link），license 取锁文件，
//    缺失时读 node_modules/<路径>/package.json；写 reports/dist-licenses.json（不进 dist）。
//    状态：ok = 白名单内；review = 白名单外，待人工确认；rejected = 缺失或明确不兼容。
//    review 与 rejected 都算命中（非零退出）：确认后把许可加进 LICENSE_OK 再跑。
// F. --release：dist/plugin.json 的 features 里不得有 code 为 probe 的项，dist/assets 下不得有 probe 开头的文件
//    （洪译实测只给开发用）。不带该参数时不查。
//    本脚本只做工程侧筛查，不构成法律意见。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const FORBIDDEN_NAMES = new Set([".git", ".gitignore", ".gitmodules", ".github", ".vscode"]);

export const FORBIDDEN = [
  { rule: "禁用接口", label: "translate-pa.googleapis.com", re: /translate-pa\.googleapis\.com/gi },
  { rule: "禁用接口", label: "translate.googleapis.com", re: /(?<![\w-])translate\.googleapis\.com/gi },
  { rule: "禁用接口", label: "edge.microsoft.com/translate", re: /edge\.microsoft\.com\/translate/gi },
  { rule: "硬编码 Google key", label: "AIzaSy…", re: /AIzaSy[0-9A-Za-z_-]{33}/g },
  { rule: "禁用包", label: "@read-frog/layout-engine", re: /@read-frog\/layout-engine/g },
  { rule: "禁用包", label: "@read-frog/api-contract", re: /@read-frog\/api-contract/g },
  { rule: "禁用域名", label: "readfrog.app", re: /readfrog\.app/gi },
  { rule: "禁用内容", label: "lobehub", re: /lobehub/gi },
  { rule: "疑似密钥", label: "sk-…", re: /sk-[A-Za-z0-9]{20,}/g },
  { rule: "疑似密钥", label: "gho_", re: /gho_/g },
  { rule: "疑似密钥", label: "Bearer …", re: /Bearer [A-Za-z0-9._-]{20,}/g },
];

// 外部地址：http://、https://、协议相对 //
const EXT = String.raw`((?:https?:)?\/\/[^\s"'<>)\\\x60]+)`;
const Q = String.raw`["'\x60]`;
// HTML 属性值：引号前允许一个反斜杠（JS 字符串里的 HTML 片段，如 "<img src=\"https://...\">"）。
const AV = String.raw`\s*=\s*\\?["']?\s*`;
export const RESOURCE_RULES = [
  { label: "HTML src/srcset/poster", re: new RegExp(String.raw`<[a-z][\w:-]*\b[^>]*?\s(?:src|srcset|poster)` + AV + EXT, "gi") },
  { label: "HTML <link href>", re: new RegExp(String.raw`<link\b[^>]*?\shref` + AV + EXT, "gi") },
  { label: "HTML <object data>", re: new RegExp(String.raw`<object\b[^>]*?\sdata` + AV + EXT, "gi") },
  { label: "SVG <image|use href>", re: new RegExp(String.raw`<(?:image|use|feImage)\b[^>]*?\s(?:xlink:)?href` + AV + EXT, "gi") },
  { label: "CSS url()", re: new RegExp(String.raw`(?<![\w$.])url\(\s*["']?\s*` + EXT, "g") },
  { label: "CSS @import", re: new RegExp(String.raw`@import\s+(?:url\(\s*)?["']?\s*` + EXT, "g") },
  { label: "JS import()", re: new RegExp(String.raw`(?<![\w$.])import\s*\(\s*` + Q + String.raw`\s*` + EXT, "g") },
  { label: "JS import from", re: new RegExp(String.raw`(?<![\w$.])(?:import|from)\s*` + Q + EXT, "g") },
  { label: "JS importScripts()", re: new RegExp(String.raw`importScripts\(\s*` + Q + EXT, "g") },
  { label: "JS new Worker()", re: new RegExp(String.raw`new\s+(?:Shared)?Worker\(\s*` + Q + EXT, "g") },
  { label: "JS src/srcSet 属性", re: new RegExp(String.raw`(?<![\w$])(?:src|srcSet|srcset)\s*:\s*` + Q + EXT, "g") },
  { label: "JS .src 赋值", re: new RegExp(String.raw`\.(?:src|srcset)\s*=\s*` + Q + EXT, "g") },
];
const RESOURCE_EXTS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".svg"]);

// 未压缩判定：非空行平均长度 > 120，或任一行 > 1000 字符，视为压缩/混淆。
export const MINIFIED_AVG = 120;
export const MINIFIED_MAX = 1000;

// GPL-3.0 兼容白名单（保守，按 SPDX ID，大小写不敏感）。白名单外 = 待人工确认。
// 决策 L7：OFL-1.1（字体）列入；CC-BY-4.0 不在白名单，逐个人工确认。
export const LICENSE_OK = new Set([
  "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "Unlicense",
  "CC0-1.0", "OFL-1.1", "Zlib", "MPL-2.0", "BlueOak-1.0.0", "Python-2.0",
  "Unicode-3.0", "Unicode-DFS-2016",
  "LGPL-2.0", "LGPL-2.0-only", "LGPL-2.0-or-later", "LGPL-2.0+",
  "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-2.1+",
  "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later", "LGPL-3.0+",
  "GPL-2.0-or-later", "GPL-2.0+", "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later", "GPL-3.0+",
].map((s) => s.toUpperCase()));
// 明确不兼容（或无授权）的写法，直接判 rejected。
export const LICENSE_BAD = [/^UNLICENSED$/i, /^SEE LICENSE/i, /proprietary/i, /commercial/i,
  /^SSPL/i, /^BUSL/i, /^Elastic-/i, /^CC-BY-NC/i, /^GPL-2\.0(-only)?$/i];

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    out.push({ abs, rel, name: ent.name, isDir: ent.isDirectory() });
    if (ent.isDirectory() && !ent.isSymbolicLink()) walk(abs, base, out);
  }
  return out;
}

function lineCol(text, index) {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) {
    line++;
    last = i;
  }
  return `${line}:${index - last}`;
}

function snippet(s) {
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

// 返回 findings：{ rule, file, loc, detail }
export function scanFiles(distDir) {
  const findings = [];
  const entries = walk(distDir);
  for (const e of entries) {
    if (FORBIDDEN_NAMES.has(e.name)) findings.push({ rule: "禁止文件", file: e.rel, loc: "", detail: `不允许 ${e.name}` });
    else if (!e.isDir && e.name.toLowerCase().endsWith(".map")) findings.push({ rule: "禁止文件", file: e.rel, loc: "", detail: "不允许 source map" });
  }
  for (const e of entries) {
    if (e.isDir || e.rel.split("/").some((p) => FORBIDDEN_NAMES.has(p))) continue;
    const text = fs.readFileSync(e.abs).toString("latin1");
    for (const f of FORBIDDEN) {
      // NOTICE 合规声明明确点名未分发的上游包，不是代码引用。
      if (e.rel === 'NOTICE' && f.rule === '禁用包') continue;
      for (const m of text.matchAll(f.re)) {
        findings.push({ rule: f.rule, file: e.rel, loc: lineCol(text, m.index), detail: `${f.label}: ${snippet(m[0])}` });
      }
    }
    if (RESOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
      const reported = new Set(); // 同一位置被多条规则命中时只报一次（如 @import url(...)）
      for (const r of RESOURCE_RULES) {
        for (const m of text.matchAll(r.re)) {
          const at = m.index + m[0].lastIndexOf(m[1]);
          if (reported.has(at)) continue;
          reported.add(at);
          findings.push({ rule: "外部资源", file: e.rel, loc: lineCol(text, at), detail: `${r.label}: ${snippet(m[1])}` });
        }
      }
    }
  }
  return findings;
}

export function minifiedReason(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const max = Math.max(...lines.map((l) => l.length));
  const avg = lines.reduce((n, l) => n + l.length, 0) / lines.length;
  if (max > MINIFIED_MAX) return `最长行 ${max} 字符 > ${MINIFIED_MAX}`;
  if (avg > MINIFIED_AVG) return `平均行长 ${avg.toFixed(1)} > ${MINIFIED_AVG}`;
  return null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

// preload 及其 require("./…") 引入的本地 js，逐个检查是否压缩
function preloadClosure(distDir, entryRel) {
  const seen = new Set();
  const stack = [path.resolve(distDir, entryRel)];
  while (stack.length) {
    const abs = stack.pop();
    if (seen.has(abs) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    seen.add(abs);
    const text = fs.readFileSync(abs, "utf8");
    for (const m of text.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
      const base = path.resolve(path.dirname(abs), m[1]);
      for (const c of [base, `${base}.js`, `${base}.cjs`, path.join(base, "index.js")]) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          stack.push(c);
          break;
        }
      }
    }
  }
  return [...seen];
}

export function checkRequired(distDir) {
  const findings = [];
  const miss = (file, detail) => findings.push({ rule: "必需文件", file, loc: "", detail });
  if (!fs.existsSync(path.join(distDir, "index.html"))) miss("index.html", "缺失");
  const pj = path.join(distDir, "plugin.json");
  if (!fs.existsSync(pj)) {
    miss("plugin.json", "缺失");
    return findings;
  }
  let manifest;
  try {
    manifest = readJson(pj);
  } catch (err) {
    miss("plugin.json", `JSON 解析失败：${err.message}`);
    return findings;
  }
  if (Object.hasOwn(manifest, "development")) {
    findings.push({ rule: "开发配置", file: "plugin.json", loc: "", detail: "发布包不得含 development（uTools 会改连 development.main）" });
  }
  for (const key of ["logo", "preload"]) {
    const v = manifest[key];
    if (typeof v !== "string" || v === "") miss("plugin.json", `未声明 ${key}`);
    else if (!fs.existsSync(path.resolve(distDir, v))) miss(v, `plugin.json 的 ${key} 指向的文件缺失`);
  }
  if (typeof manifest.preload === "string" && manifest.preload !== "") {
    for (const abs of preloadClosure(distDir, manifest.preload)) {
      const reason = minifiedReason(fs.readFileSync(abs, "utf8"));
      const rel = path.relative(distDir, abs).split(path.sep).join("/");
      if (reason) findings.push({ rule: "preload 未明文", file: rel, loc: "", detail: `疑似压缩：${reason}` });
    }
  }
  return findings;
}

function licenseOf(raw) {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.type === "string") return raw.type.trim();
  if (Array.isArray(raw) && raw.length) {
    const parts = raw.map(licenseOf).filter(Boolean);
    return parts.length ? `(${parts.join(" OR ")})` : "";
  }
  return "";
}

function singleStatus(id) {
  if (LICENSE_BAD.some((re) => re.test(id))) return "rejected";
  return LICENSE_OK.has(id.toUpperCase()) ? "ok" : "review";
}

// SPDX 表达式：OR 取最宽松，AND 取最严格；混用 AND/OR 或含 WITH 一律待人工确认。
export function classifyLicense(expr) {
  if (!expr) return "rejected";
  const s = expr.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "rejected";
  const hasOr = /\sOR\s/i.test(s);
  const hasAnd = /\sAND\s/i.test(s);
  if (/\sWITH\s/i.test(s) || (hasOr && hasAnd)) return "review";
  if (!hasOr && !hasAnd) return singleStatus(s);
  const parts = s.split(hasOr ? /\sOR\s/i : /\sAND\s/i).map(singleStatus);
  const rank = { ok: 0, review: 1, rejected: 2 };
  const pick = hasOr ? Math.min(...parts.map((p) => rank[p])) : Math.max(...parts.map((p) => rank[p]));
  return Object.keys(rank).find((k) => rank[k] === pick);
}

export function collectLicenses(rootDir) {
  const lockPath = path.join(rootDir, "package-lock.json");
  if (!fs.existsSync(lockPath)) return { error: "缺少 package-lock.json，无法列出生产依赖", packages: [] };
  const lock = readJson(lockPath);
  const packages = [];
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (key === "" || !key.includes("node_modules/") || meta.dev === true || meta.link === true) continue;
    const name = meta.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    let license = licenseOf(meta.license);
    let version = meta.version ?? "";
    let source = "package-lock.json";
    const pkgJson = path.join(rootDir, key, "package.json");
    if (!license && fs.existsSync(pkgJson)) {
      const pj = readJson(pkgJson);
      license = licenseOf(pj.license) || licenseOf(pj.licenses);
      version ||= pj.version ?? "";
      source = `${key}/package.json`;
    }
    packages.push({ name, version, license: license || null, status: classifyLicense(license), path: key, source });
  }
  packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return { error: null, packages };
}

export function checkRelease(distDir) {
  const findings = [];
  for (const name of ['LICENSE', 'NOTICE']) {
    const file = path.join(distDir, name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || !stat.size) findings.push({ rule: '发布缺少许可文件', file: name, loc: '', detail: '文件缺失或为空' });
  }
  const pj = path.join(distDir, "plugin.json");
  if (fs.existsSync(pj)) {
    try {
      const features = readJson(pj).features;
      if (Array.isArray(features) && features.some((f) => f && f.code === "probe")) {
        findings.push({ rule: "发布包含开发入口", file: "plugin.json", loc: "", detail: "features 里有 code 为 probe 的项" });
      }
    } catch {
      // JSON 解析失败已由 checkRequired 报告
    }
  }
  const assets = path.join(distDir, "assets");
  if (fs.existsSync(assets)) {
    for (const name of fs.readdirSync(assets)) {
      if (/^probe/i.test(name)) findings.push({ rule: "发布包含开发入口", file: `assets/${name}`, loc: "", detail: "probe 代码不应进发布包" });
    }
  }
  return findings;
}

function parseArgs(argv) {
  const opts = { root: path.resolve(SCRIPT_DIR, ".."), dist: null, report: null, release: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" || a === "--dist" || a === "--report") {
      if (argv[i + 1] === undefined) throw new Error(`${a} 缺少参数`);
      opts[a.slice(2)] = path.resolve(argv[++i]);
    } else if (a === "--release") opts.release = true;
    else throw new Error(`未知参数：${a}`);
  }
  opts.dist ??= path.join(opts.root, "dist");
  opts.report ??= path.join(opts.root, "reports", "dist-licenses.json");
  return opts;
}

export function audit({ root, dist, report, release = false }) {
  if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) throw new Error(`找不到 dist 目录：${dist}`);
  const relToDist = path.relative(dist, report);
  if (!relToDist.startsWith("..") && !path.isAbsolute(relToDist)) throw new Error(`许可清单不能写进 dist：${report}`);
  const findings = [...scanFiles(dist), ...checkRequired(dist)];
  if (release) findings.push(...checkRelease(dist));
  const lic = collectLicenses(root);
  if (lic.error) findings.push({ rule: "许可清单", file: "package-lock.json", loc: "", detail: lic.error });
  for (const p of lic.packages) {
    if (p.status === "ok") continue;
    const why = p.status === "rejected" ? (p.license ? "不兼容或无授权" : "无 license 字段") : "白名单外，待人工确认";
    findings.push({ rule: "许可", file: p.path, loc: "", detail: `${p.name}@${p.version} ${p.license ?? "(无)"}：${why}` });
  }
  const summary = { total: lic.packages.length, ok: 0, review: 0, rejected: 0 };
  for (const p of lic.packages) summary[p.status]++;
  fs.mkdirSync(path.dirname(report), { recursive: true });
  const doc = {
    note: "工程侧许可筛查结果，不构成法律意见。review/rejected 需人工确认。",
    generatedAt: new Date().toISOString(),
    lockfile: path.join(root, "package-lock.json"),
    summary,
    packages: lic.packages,
  };
  fs.writeFileSync(report, `${JSON.stringify(doc, null, 2)}\n`);
  return { findings, summary };
}

function main() {
  let opts;
  let result;
  try {
    opts = parseArgs(process.argv.slice(2));
    result = audit(opts);
  } catch (err) {
    console.error(`audit-dist: ${err.message}`);
    process.exit(2);
  }
  const red = process.stdout.isTTY && !process.env.NO_COLOR ? (s) => `\x1b[31m${s}\x1b[0m` : (s) => s;
  const { findings, summary } = result;
  for (const f of findings) {
    const where = f.loc ? `${f.file}:${f.loc}` : f.file;
    console.log(red(`[${f.rule}] ${where}  ${f.detail}`));
  }
  console.log(`许可清单：${opts.report}（共 ${summary.total}，ok ${summary.ok}，待确认 ${summary.review}，不兼容/缺失 ${summary.rejected}）`);
  console.log(findings.length ? red(`audit-dist: ${findings.length} 处命中`) : "audit-dist: 通过");
  process.exit(findings.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
