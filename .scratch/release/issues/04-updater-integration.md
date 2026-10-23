# 04: 自动更新（Tauri updater）接入

**What to build:** 应用首发即带自动更新（ADR-0004）：启动后延迟静默检查，发现新版显示提示条，用户确认后下载安装并重启；设置面板提供手动「检查更新」与当前版本号。`createUpdaterArtifacts` 开启：draft release 额外产出 `.app.tar.gz + .sig`，tauri-action 生成 `latest.json`，端点为 GitHub Releases 的 latest.json 动态地址（HTTPS）。新增 tauri-plugin-updater 与 tauri-plugin-process（含前端插件包与 capabilities 权限）；minisign 公钥固化进 updater 配置。注意：macOS 的更新载体是 .app.tar.gz 而非 DMG；更新签名（minisign）与 Apple 签名是两套独立体系。

**人类步骤（实现到此票时用 /wizard 生成引导）：** `tauri signer generate` 生成 minisign 密钥对；**私钥离线备份至少两处**（丢失则无法向存量用户推送更新）；TAURI_SIGNING_PRIVATE_KEY（内容）与 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 填入 GitHub secrets。

**Blocked by:** 02（与 03 可并行）

**Status:** ready-for-agent

- [ ] 本地构建产出 .app.tar.gz 与 .sig，且可用公钥验证签名
- [ ] draft release 含 latest.json 且指向正确资产
- [ ] 启动静默检查无感；设置「检查更新」在无新版时提示已是最新
- [ ] 端点 HTTPS、公钥已固化；私钥已备份、secrets 已填
- [ ] npm test / lint 全绿

**参考：** docs/adr/0004、.scratch/release/research/tauri-macos-signing-notarization.md、.scratch/release/spec.md
