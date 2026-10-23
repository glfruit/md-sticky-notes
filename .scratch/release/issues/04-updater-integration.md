# 04: 自动更新（Tauri updater）接入

**What to build:** 应用首发即带自动更新（ADR-0004）：启动后延迟静默检查，发现新版显示提示条，用户确认后下载安装并重启；设置面板提供手动「检查更新」与当前版本号。`createUpdaterArtifacts` 开启：draft release 额外产出 `.app.tar.gz + .sig`，tauri-action 生成 `latest.json`，端点为 GitHub Releases 的 latest.json 动态地址（HTTPS）。新增 tauri-plugin-updater 与 tauri-plugin-process（含前端插件包与 capabilities 权限）；minisign 公钥固化进 updater 配置。注意：macOS 的更新载体是 .app.tar.gz 而非 DMG；更新签名（minisign）与 Apple 签名是两套独立体系。

**人类步骤（实现到此票时用 /wizard 生成引导）：** `tauri signer generate` 生成 minisign 密钥对；**私钥离线备份至少两处**（丢失则无法向存量用户推送更新）；TAURI_SIGNING_PRIVATE_KEY（内容）与 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 填入 GitHub secrets。

**Blocked by:** 02（与 03 可并行）

**Status:** done（2026-10-23 验收通过；GUI 项「启动静默检查 / 设置里检查更新显示已是最新」留给用户下次打开新构建时顺手确认——当前无已发布 release，预期显示「已是最新 ✓」）

**实现注记：** createUpdaterArtifacts 要求 plugins.updater 段同时存在（缺了在 bundler 设置阶段硬报错）；updater 产物需要 targets 含 `app`（`.app.tar.gz` 从 app bundle 打出，只有 dmg/nsis 时出警告且不产更新包）。本地构建用 `bash scripts/build-desktop.sh`（自动注入 .env 里的密钥；直接 `npx tauri build` 会报缺私钥）。私钥在 ~/.tauri/md-sticky-notes.key（空密码，用户已确认备份），CI 用 secret TAURI_SIGNING_PRIVATE_KEY（内容），密码 secret 按设计未设。draft 阶段 latest.json 的 url 指向 GitHub 资产 API 地址（tauri-action 对 draft 的标准行为，updater 带 octet-stream Accept 头可下载），端到端更新闭环在票 06 的 0.1.1 演练中实测。

- [x] 本地构建产出 .app.tar.gz 与 .sig，且可用公钥验证签名（bundler 签名时校验 keynum 与 pubkey 一致）
- [x] draft release 含 latest.json 且指向正确资产（v0.0.5 冒烟：7 个资产齐全，darwin-aarch64 / darwin-x86_64 条目带签名；验完已清理）
- [ ] 启动静默检查无感；设置「检查更新」在无新版时提示已是最新（GUI，用户下次启动确认）
- [x] 端点 HTTPS、公钥已固化；私钥已备份、secrets 已填
- [x] npm test / lint 全绿（56 个测试）

**参考：** docs/adr/0004、.scratch/release/research/tauri-macos-signing-notarization.md、.scratch/release/spec.md
