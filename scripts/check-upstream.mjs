#!/usr/bin/env node
// 上游升级检查（零依赖）。用法：
//   node scripts/check-upstream.mjs [--repo upstream/read-frog] [--old <commit>] [--new <commit>] [--root .]
// 默认：--repo = <root>/upstream/read-frog；--old = UPSTREAM.md 里的固定 commit；--new = repo 的 HEAD。
// 退出码：0 = 无新增；1 = 有新增耦合点；2 = 参数、git 或入口缺失等错误。
//
// 做法：分别在两个 commit 上，从三组入口（translation hub、引擎、设置页）沿
// import / export from / import() 递归解析 `@/` 与相对路径，求运行时闭包（不跟 `import type`），
// 用 `git ls-tree` + `git cat-file --batch` 读取该 commit 的文件（不碰工作区），
// 在闭包内去掉注释后提取以下耦合点，按类别比较集合，输出新增与删除：
//   - 消息 key：sendMessage("k") / onMessage("k")
//   - browser.* / chrome.* 调用链（如 browser.tabs.query）
//   - import.meta.env.X
//   - 从 #imports、wxt、wxt/*、@webext-core/*、@read-frog/* 导入的名字（含 import type，标 type）
// 闭包算法为本仓库自写。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ENTRIES = {
  hub: ["src/entrypoints/translation-hub/main.tsx"],
  engine: ["src/utils/host/translate/execute-translate.ts"],
  settings: [
    "src/entrypoints/options/pages/api-providers/index.tsx",
    "src/entrypoints/options/pages/preference/translation-language/index.tsx",
  ],
};
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx"];
const CODE_RE = /\.tsx?$/;

const STATIC_RE = /^[ \t]*(import|export)\s+(type\s+)?((?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s*as\s+[\w$]+|\*|[\w$]+))\s*from\s*["']([^"']+)["']/gm;
const SIDE_RE = /^[ \t]*import\s*["']([^"']+)["']/gm;
const DYN_RE = /(?<![\w.])import\(\s*["']([^"']+)["']\s*\)/g;
const WATCHED_MODULE = /^(#imports$|wxt$|wxt\/|@webext-core\/|@read-frog\/)/;

export const PATTERNS = [
  { cat: "消息 key", re: /(?<![\w.$])(sendMessage|onMessage)\(\s*["'`]([^"'`]+)["'`]/g, fmt: (m) => `${m[1]}("${m[2]}")` },
  { cat: "browser.*", re: /(?<![\w.$/])browser\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g, fmt: (m) => `browser.${m[1]}` },
  { cat: "chrome.*", re: /(?<![\w.$/"'])chrome\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g, fmt: (m) => `chrome.${m[1]}` },
  { cat: "import.meta.env", re: /import\.meta\.env\.([A-Za-z_$][\w$]*)/g, fmt: (m) => `import.meta.env.${m[1]}` },
];

export function stripComments(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
  return s.replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

function git(repo, args, input) {
  return execFileSync("git", ["-C", repo, ...args], {
    input,
    maxBuffer: 1 << 30,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
}

export function resolveCommit(repo, rev) {
  return git(repo, ["rev-parse", "--verify", `${rev}^{commit}`]).toString().trim();
}

// 读取某 commit 下 src/ 的全部 .ts/.tsx：返回 Map<路径, 内容>
export function readTree(repo, commit) {
  const entries = git(repo, ["ls-tree", "-r", "-z", commit, "--", "src"]).toString("utf8").split("\0").filter(Boolean);
  const blobs = [];
  for (const e of entries) {
    const tab = e.indexOf("\t");
    const [, type, sha] = e.slice(0, tab).split(" ");
    const p = e.slice(tab + 1);
    if (type === "blob" && CODE_RE.test(p)) blobs.push({ p, sha });
  }
  const files = new Map();
  if (!blobs.length) return files;
  const buf = git(repo, ["cat-file", "--batch"], `${blobs.map((b) => b.sha).join("\n")}\n`);
  let off = 0;
  for (const b of blobs) {
    const nl = buf.indexOf(0x0a, off);
    const size = Number(buf.toString("latin1", off, nl).split(" ")[2]);
    files.set(b.p, buf.toString("utf8", nl + 1, nl + 1 + size));
    off = nl + 1 + size + 1;
  }
  return files;
}

function names(clause) {
  const out = [];
  const body = clause.replace(/\s+/g, " ").trim();
  const brace = body.match(/\{([^}]*)\}/);
  const head = body.replace(/\{[^}]*\}/, "").replace(/,\s*$/, "").trim();
  if (head.startsWith("*")) out.push({ name: "*", type: false });
  else if (head) out.push({ name: "default", type: false });
  if (brace) {
    for (const raw of brace[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      const type = raw.startsWith("type ");
      out.push({ name: raw.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim(), type });
    }
  }
  return out;
}

// 解析一个文件：返回 { deps: [{spec, typeOnly}], watched: [string] }
export function parseFile(code) {
  const deps = [];
  const watched = [];
  for (const m of code.matchAll(STATIC_RE)) {
    const typeKw = Boolean(m[2]);
    const items = names(m[3]);
    const spec = m[4];
    const typeOnly = typeKw || (m[3].trim().startsWith("{") && items.length > 0 && items.every((i) => i.type));
    deps.push({ spec, typeOnly });
    if (WATCHED_MODULE.test(spec)) {
      for (const i of items) watched.push(`${spec}: ${i.name}${typeKw || i.type ? " (type)" : ""}`);
    }
  }
  for (const m of code.matchAll(SIDE_RE)) {
    deps.push({ spec: m[1], typeOnly: false });
    if (WATCHED_MODULE.test(m[1])) watched.push(`${m[1]}: (side-effect)`);
  }
  for (const m of code.matchAll(DYN_RE)) {
    deps.push({ spec: m[1], typeOnly: false });
    if (WATCHED_MODULE.test(m[1])) watched.push(`${m[1]}: (dynamic)`);
  }
  return { deps, watched };
}

export function resolveSpec(spec, fromFile, files) {
  spec = spec.split("?")[0];
  let base;
  if (spec.startsWith("@/")) base = path.posix.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  else return null;
  for (const s of RESOLVE_SUFFIXES) if (files.has(base + s)) return base + s;
  return undefined; // 非代码文件（css、yml、图片）或缺失
}

// 计算一个 commit 的耦合点：返回 { files: 闭包文件数, items: Map<类别, Map<项, Set<位置>>> , missingEntries }
export function collect(repo, commit) {
  const files = readTree(repo, commit);
  const parsed = new Map();
  const getParsed = (f) => {
    if (!parsed.has(f)) {
      const code = stripComments(files.get(f));
      parsed.set(f, { code, ...parseFile(code) });
    }
    return parsed.get(f);
  };
  const seen = new Set();
  const missingEntries = [];
  const stack = [];
  for (const list of Object.values(ENTRIES)) {
    for (const e of list) {
      if (files.has(e)) stack.push(e);
      else missingEntries.push(e);
    }
  }
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of getParsed(f).deps) {
      if (d.typeOnly) continue;
      const r = resolveSpec(d.spec, f, files);
      if (r) stack.push(r);
    }
  }
  const items = new Map();
  const add = (cat, item, where) => {
    if (!items.has(cat)) items.set(cat, new Map());
    const m = items.get(cat);
    if (!m.has(item)) m.set(item, new Set());
    m.get(item).add(where);
  };
  for (const f of [...seen].sort()) {
    const { code, watched } = getParsed(f);
    for (const w of watched) add("模块导入", w, f);
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      for (const p of PATTERNS) for (const m of line.matchAll(p.re)) add(p.cat, p.fmt(m), `${f}:${i + 1}`);
    });
  }
  return { files: seen.size, items, missingEntries };
}

export function diff(oldRes, newRes) {
  const cats = [...new Set([...oldRes.items.keys(), ...newRes.items.keys()])].sort();
  const out = [];
  for (const cat of cats) {
    const o = oldRes.items.get(cat) ?? new Map();
    const n = newRes.items.get(cat) ?? new Map();
    const added = [...n.keys()].filter((k) => !o.has(k)).sort().map((k) => ({ item: k, where: [...n.get(k)].sort() }));
    const removed = [...o.keys()].filter((k) => !n.has(k)).sort().map((k) => ({ item: k, where: [...o.get(k)].sort() }));
    if (added.length || removed.length) out.push({ cat, added, removed });
  }
  return out;
}

export function pinnedCommit(upstreamMd) {
  const text = fs.readFileSync(upstreamMd, "utf8");
  const m = text.match(/固定 commit[^\n]*?\b([0-9a-f]{40})\b/i);
  if (!m) throw new Error(`${upstreamMd} 里找不到「固定 commit」后的 40 位哈希`);
  return m[1];
}

function parseArgs(argv) {
  const opts = { root: path.resolve(SCRIPT_DIR, ".."), repo: null, old: null, new: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--root", "--repo", "--old", "--new"].includes(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} 缺少参数`);
      opts[a.slice(2)] = argv[++i];
    } else throw new Error(`未知参数：${a}`);
  }
  opts.root = path.resolve(opts.root);
  opts.repo = path.resolve(opts.repo ?? path.join(opts.root, "upstream", "read-frog"));
  return opts;
}

function main() {
  let opts;
  let changes;
  let oldC;
  let newC;
  let oldRes;
  let newRes;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(opts.repo)) throw new Error(`找不到上游仓库：${opts.repo}（没有 submodule 时用 --repo 指向本地克隆）`);
    oldC = resolveCommit(opts.repo, opts.old ?? pinnedCommit(path.join(opts.root, "UPSTREAM.md")));
    newC = resolveCommit(opts.repo, opts.new ?? "HEAD");
    oldRes = collect(opts.repo, oldC);
    newRes = collect(opts.repo, newC);
    for (const [c, r] of [[oldC, oldRes], [newC, newRes]]) {
      if (r.missingEntries.length) throw new Error(`${c.slice(0, 9)} 缺少入口：${r.missingEntries.join(", ")}（入口改名需更新 ENTRIES）`);
    }
    changes = diff(oldRes, newRes);
  } catch (err) {
    const detail = err.stderr ? String(err.stderr).trim() : "";
    console.error(`check-upstream: ${err.message}${detail ? `\n${detail}` : ""}`);
    process.exit(2);
  }
  console.log(`旧 ${oldC}（闭包 ${oldRes.files} 个文件）`);
  console.log(`新 ${newC}（闭包 ${newRes.files} 个文件）`);
  let added = 0;
  for (const c of changes) {
    console.log(`\n## ${c.cat}`);
    for (const a of c.added) {
      added++;
      console.log(`  + ${a.item}    ${a.where.slice(0, 3).join(", ")}${a.where.length > 3 ? ` 等 ${a.where.length} 处` : ""}`);
    }
    for (const r of c.removed) console.log(`  - ${r.item}`);
  }
  const removed = changes.reduce((n, c) => n + c.removed.length, 0);
  console.log(`\ncheck-upstream: 新增 ${added}，删除 ${removed}${added ? "。新增项需要在 shim / 消息总线里处理后再升级" : ""}`);
  process.exit(added ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
