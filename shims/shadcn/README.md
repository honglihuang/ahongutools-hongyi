`tailwind.css` 原样取自 npm 包 `shadcn@4.23.0` 的 `dist/tailwind.css`（MIT，见同目录 `LICENSE.md`）。
上游 `src/assets/styles/theme.css` 用 `@import "shadcn/tailwind.css"` 引用它；整个 shadcn CLI 包带约 200 个传递依赖，
所以只复制这一个文件，`vite.config.ts` 把 `shadcn/tailwind.css` 别名到这里。升级上游时对照上游锁定的 shadcn 版本重新复制。
