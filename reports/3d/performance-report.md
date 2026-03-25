# 3D 场景性能与素材报告

- 严格合格素材数：0
- 可修复后交付素材数：23
- 场景交付候选数：23
- 废弃素材数：3106
- 最高面数：5246
- 最大贴图边长：2816
- office.packed.glb 将追加 Draco + Meshopt 几何压缩，运行时同时启用两种解码器。
- starfield.atlas.glb 将追加 Meshopt 几何压缩，运行时通过 InstancedMesh 控制 draw calls。
- 最终 GPU 帧时间、Chrome Memory、Lighthouse 由单独性能脚本采样并输出到 performance-lighthouse-report.md。