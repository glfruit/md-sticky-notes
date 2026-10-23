# 10: 原子写占用重试（Rust）

**What to build:** 便签文件的原子写（临时文件 + rename）在 Windows 上遇到目标被占用（sharing violation / access denied，典型来源：同步客户端、杀软、索引服务）时按退避策略重试（250ms 起指数退避，8 次封顶）；重试耗尽则向前端返回明确错误，前端保存失败有提示且编辑器内容不丢。重试逻辑平台中性，macOS 行为不变。借此建立 src-tauri 的 cargo test 惯例（spec Seam 2）：tempdir + 失败注入，覆盖「重试后成功 / 耗尽报错 / 正常写不受影响」。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] cargo test 三个场景全过（项目首批 Rust 测试）
- [ ] Windows 真机冒烟：模拟占用场景，保存成功或得到明确报错
- [ ] 保存失败路径：前端提示出现、便签内容保留
- [ ] macOS 无回归，npm test 全绿

**参考：** .scratch/release/spec.md（Testing Decisions / Seam 2）、README 存储格式一节
