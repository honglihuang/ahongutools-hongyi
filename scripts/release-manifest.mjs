// 发布构建用：从 plugin.json 的 features 里去掉指定 code 的项（纯函数，不改入参）。
export function stripFeatures(manifest, codes) {
  if (!Array.isArray(manifest.features)) return manifest;
  return { ...manifest, features: manifest.features.filter((f) => !codes.includes(f.code)) };
}
