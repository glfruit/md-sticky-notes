# 01: 命名与打包基线（productName ASCII 化）

**What to build:** 应用以 ASCII productName「MD Sticky Notes」构建（ADR-0005）：本地 `tauri build` 产出该名的 .app 与 DMG 且可正常打开使用；`bundle.targets` 显式化（macOS 只出 `dmg`，Windows 侧只出 `nsis`，不再用 `"all"`），确保不会误产 MSI；identifier `com.mdstickynotes.app` 不变；窗口标题与全部 UI 文案保持中文「MD 便签」；版本号 0.1.0 不动，`tauri.conf.json` 的 `version` 为发版单一真源。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 本地构建产物名为 MD Sticky Notes.app / 对应 DMG（已验证：构建成功，DMG 4.38 MiB）；「打开可正常使用」待确认——验证时旧版实例在运行且无双开防护，未启动新构建；双击打开 target/release/bundle/dmg/MD Sticky Notes_0.1.0_aarch64.dmg 正常使用后勾掉本项
- [x] bundle.targets 显式为 dmg / nsis，不再隐式产出 MSI 等其他目标（macOS 构建只产 DMG）
- [x] UI 内中文「MD 便签」显示无回归（窗口标题等——全部 7 处 UI 文案未动，含同步子文件夹名）
- [x] npm test、npm run lint 全绿（48 测试通过）
- [x] 排查代码与文档中没有依赖旧 productName 的硬编码引用需要同步（仅 productName 本体需改；发现的 README 过时命令 `npm run tauri build` 与命名无关，留票 05 重写 README 时处理）

**参考：** docs/adr/0005-ascii-product-name.md、.scratch/release/spec.md
