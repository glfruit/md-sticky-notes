# 02: GitHub 仓库与基础发布管线

**What to build:** 项目以 public 仓库 + MIT 开源（ADR-0004），打通「打 tag → CI 产出双架构 macOS DMG（未签名）→ draft release 人工放行」管线：push `v*` tag 时用官方 tauri-action 构建 arm64 与 x64 两个 DMG 并生成 draft release（不自动 publish）；另配轻量 test workflow（push 时 lint + vitest）。构建加 Rust 缓存。arm64/x64 实现方式（单 runner `--target` 交叉或双 runner）由本票定，参考研究笔记 windows-packaging-ci.md 的官方模板。当前零 secret 必须能跑通（workflow 里为后续票留好 secret 占位）。

**人类步骤（实现到此票时用 /wizard 生成引导）：** 创建 GitHub public 仓库（建议名 md-sticky-notes）、push 代码、仓库设置开启 Issues 与 Discussions、创建 MIT LICENSE 文件。

**Blocked by:** 01

**Status:** done（2026-10-23 验收通过）

- [x] GitHub public 仓库可见，含 MIT LICENSE，Issues / Discussions 已开启（glfruit/md-sticky-notes，GitHub 已识别 MIT）
- [x] tag 触发的 release workflow 产出 arm64 + x64 两个 DMG 的 draft release，需人工 publish（v0.0.1 冒烟：两个 DMG 资产齐全、draft 状态正确，产物经 ad-hoc 签名验证 `Signature=adhoc`；冒烟 draft 与 tag 已按计划删除）
- [x] push 触发的 test workflow（lint + vitest）绿（27s）
- [x] Rust 缓存生效（首跑 `Cache mode: write` 已落袋，二次运行起命中）
- [x] 零 secret 跑通全流程（仅自动 GITHUB_TOKEN）

**参考：** docs/adr/0004、.scratch/release/research/windows-packaging-ci.md、.scratch/release/spec.md
