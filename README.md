# 洪译（ahongutools-hongyi）

uTools 翻译插件：多引擎翻译、翻译并粘回、截图翻译、文件翻译、术语表、AI 动作、生词本。基于开源项目 [Read Frog](https://github.com/mengxi-ream/read-frog)（GPL-3.0）修改，整个插件以 GPL-3.0 发布，许可全文见 `LICENSE`，来源与修改记录见 `NOTICE`。

## 从源码构建

需要 Node.js 24 和 git。

```
git clone --recurse-submodules https://github.com/honglihuang/ahongutools-hongyi.git
cd ahongutools-hongyi
npm ci
npm run build:release
node scripts/audit-dist.mjs --release
```

- `upstream/read-frog` 是 git submodule，固定在 `UPSTREAM.md` 里写的 commit；忘了 `--recurse-submodules` 时运行 `git submodule update --init`。
- `build:release` 生成 `dist/`，用 uTools 开发者工具把「工程目录」选为 `dist/plugin.json` 即可加载；上架的发布包就是这个目录。
- `audit-dist.mjs --release` 检查发布包：没有 `.git`、`.map`，没有外部资源引用，`preload.js` 未压缩，没有禁用的包，并写出依赖许可清单 `reports/dist-licenses.json`。
- 源码与每个版本一一对应：版本 `X.Y.Z` 的源码在 tag `vX.Y.Z`，插件「关于」页链接到这个 tag。

## 本地开发

- 日常使用：「uTools 开发者工具」里本工程的「工程目录」选 `dist/plugin.json`，uTools 直接加载 `dist/`，不需要开着 dev server。uTools 重启（含重启电脑）后开发模式安装会失效，要在开发者工具里再点一次「安装（开发模式）」。
- 改代码后运行 `npm run build`，再退出并重新打开插件（项目设置里开着「退出到后台立即结束运行」）。
- 需要热更新时才用 `npm run dev`，并把「工程目录」改选 `public/plugin.json`（其中 `development.main` 指向 `http://localhost:5173`）；dev server 一停，插件就打不开。

上游同步与构建期补丁见 `UPSTREAM.md`。
