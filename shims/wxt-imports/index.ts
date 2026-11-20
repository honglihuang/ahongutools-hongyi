// WXT 虚拟模块 `#imports` 的替代：上游闭包只用到 storage、browser 两个值（另有 Browser 类型，构建时擦除）。
export { browser } from './browser.ts'
export { storage } from './storage.ts'
