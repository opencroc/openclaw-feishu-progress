# 3D 场景部署文档

## 本地开发

- 安装依赖：`npm install`
- 生成素材报告与场景资产：`npm run assets:pixel-scenes`
- 启动后端与前端：`npm run dev`
- 单独启动前端：`npm run web:dev`
- 关键入口：
  - `/tasks`
  - `/office`
  - `/starmap`

## 生产构建

- 先生成场景资产：`npm run assets:pixel-scenes`
- 再执行构建：`npm run build`
- Web 静态资源输出到 `src/web/dist`
- 运行产物输出到 `dist`

## CDN 缓存策略

- `generated/*.glb` 与 `generated/*.json` 使用文件指纹或版本目录，建议 `Cache-Control: public, max-age=31536000, immutable`
- HTML 入口使用 `Cache-Control: no-cache`
- 运行时代码 chunk 使用 `Cache-Control: public, max-age=31536000, immutable`
- 当 `star-catalog.json` 更新时，同时提升版本目录，避免 IndexedDB 与 CDN 缓存不一致

## 版本号规则

- 主版本：场景结构或接口不兼容变更
- 次版本：新增素材、交互或可见功能
- 修订号：素材修正、性能调优、文案调整
- 资源版本建议与应用版本同步，例如 `v1.8.7/generated/...`

## 发布前检查

- 执行 `npm run assets:pixel-scenes`
- 执行 `npm run web:build`
- 执行 `npm run test -- src/__tests__/pixel-3d-scenes.test.ts`
- 检查 `reports/3d/material-screening-report.csv`
- 检查 `reports/3d/performance-report.md`
