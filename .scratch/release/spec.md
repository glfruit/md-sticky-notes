# Spec：发布与跨平台（macOS 公证首发 0.1.0 → Windows 移植 0.2.0）

依据：CONTEXT.md、docs/adr/0001~0006、研究笔记 `.scratch/release/research/tauri-macos-signing-notarization.md` 与 `windows-packaging-ci.md`（2026-10-22 查证，Tauri 2.12）。

## Problem Statement

开发者本人已把应用用到满意（48 个单测、功能完整），但它无法安全地给别人用：macOS 构建未签名未公证，别人下载后被 Gatekeeper 拦截；没有对外下载入口和反馈渠道；没有自动更新；Windows 用户完全用不了。项目停在「自用」状态，无法验证它对别人是否有价值。

## Solution

以 GitHub public 仓库为唯一对外入口（MIT 开源，Issues + Discussions 收反馈）：macOS 侧打通发布管线与自动更新，首发 0.1.0 DMG（arm64 / x64 双包，签名模式见 ADR-0002 修订：先 ad-hoc + Gatekeeper 手动放行，付费 Developer ID + 公证推迟到有真实反馈支持时）；经稳定门槛（自用 ≥14 天 + 反馈渠道开放 ≥1 周 + 零 P0）后启动 Windows 移植，以 NSIS 安装包发布 0.2.0。发布 = 打 tag，CI 自动产出双平台全部资产并生成 draft release，人工放行。两平台都过稳定门槛后发 1.0。

## User Stories

1. 作为 macOS 用户，我想从 GitHub Releases 下载已签名公证的 DMG，首次打开不被 Gatekeeper 拦截。
2. 作为 macOS 用户，我想让应用自动检查并提示更新，不必手动盯新版本。
3. 作为 macOS 用户，我想在设置里手动「检查更新」并立即拿到结果。
4. 作为 Apple Silicon 用户，我想下载 arm64 DMG。
5. 作为 Intel Mac 用户，我想下载 x64 DMG。
6. 作为 Windows 用户，我想下载单个 NSIS 安装包，按向导完成 per-user 安装（不需要管理员权限）。
7. 作为 Windows 用户，遇到 SmartScreen 首次运行警告时，我能从 Release 说明里找到「仍要运行」的指引。
8. 作为 Windows 用户，我想应用自动探测已装的 Dropbox / OneDrive 路径作为默认同步文件夹，零配置上手。
9. 作为 Windows 用户，没有云盘时默认回落 Documents，且我能手选任意文件夹。
10. 作为 Windows 用户，我想点窗口 X 后应用驻留托盘（提醒、全局热键继续有效），从托盘菜单真正退出。
11. 作为 Windows 用户，我想 Alt+N（新建）/ Ctrl+Alt+N（全局新建）与 Mac 版行为一致。
12. 作为双机用户（Mac + Windows），我想两端默认指向同一个云盘子文件夹「MD 便签」，便签互通。
13. 作为 Windows 用户，我误双击两次图标时只启动一个实例，不出现两个进程争写同一批便签文件。
14. 作为发布者（开发者本人），我想打 tag 就自动产出双平台全部资产并生成 draft release，发布开关在我手里。
15. 作为发布者，我想构建在缺签名凭据时显式失败（而非静默产出未签名产物），绝不发出去坏包。
16. 作为发布者，我想 latest.json 随 Release 自动生成，存量用户的 updater 能发现新版。
17. 作为发布者，我想要一份发布 runbook（签名/公证校验、资产清单、说明文案模板、SmartScreen 指引），照单执行不出错。
18. 作为潜在用户，我想在 README 看到下载入口、功能简介与反馈方式。
19. 作为反馈者，我想在 Issues 报 bug、在 Discussions 提建议，并且能得到回应。
20. 作为开发者本人，我要 Mac 公证版达到稳定门槛后才开 Windows 工票，保持串行节奏。
21. 作为开发者本人，我要版本号语义固定：0.1.0 首发、0.2.0 Windows、1.0 = 双平台过门槛；1.0 前不对外承诺数据格式兼容。
22. 作为中文用户，窗口标题、UI、安装器界面全中文。
23. 作为任意平台用户，我的便签数据始终存在我自己的云盘文件夹，应用无账号、无自有云（产品身份延续）。

## Implementation Decisions

**命名与打包配置**
- productName 改为 ASCII `MD Sticky Notes`（ADR-0005），identifier `com.mdstickynotes.app` 不变；窗口标题与 UI 保持中文「MD 便签」；图标沿用现有。
- `bundle.targets` 从 `"all"` 改为显式列表：macOS `dmg`，Windows `nsis`（ADR-0006）。MSI、zip 便携版不做。
- 版本号以 `tauri.conf.json` 的 `version` 为单一真源；发布流程 = 改 version → commit → 打 `v*` tag → push。

**macOS 签名与公证**（ADR-0002 + 研究笔记）
- 配置 `bundle.macOS.signingIdentity`（Developer ID Application）；无需任何 entitlements，hardened runtime 默认开启。
- 公证凭据走 App Store Connect API key 路线：`APPLE_API_ISSUER` / `APPLE_API_KEY` / `APPLE_API_KEY_PATH`。
- 已查证的构建顺序：签 .app → `ditto` 打 zip → `xcrun notarytool submit --wait` → 自动 `stapler staple` → 打 DMG；公证与 staple 都贴在 .app 上，DMG 本身不公证。
- **防坑**：Tauri 无签名凭据时会静默产出未签名产物——构建流水线必须带校验步（`spctl -a -vv` / `stapler validate`），缺失签名即失败。
- 产物：arm64 与 x64 两个 DMG 分开发布（官方默认做法；单 runner 加 `--target` 交叉或双 runner 由实现票定）。

**自动更新**（ADR-0004 + 研究笔记）
- 首发即带 updater：新增 `tauri-plugin-updater`（+ `tauri-plugin-process` 用于更新后重启）；`createUpdaterArtifacts: true`；`plugins.updater` 配 minisign `pubkey` 与端点 `https://github.com/<user>/<repo>/releases/latest/download/latest.json`。
- 更新载体：macOS `.app.tar.gz + .sig`，Windows NSIS 安装包静默重跑；更新签名密钥（minisign）与 Apple 签名是两套独立体系。
- 前端行为：启动后延迟自动检查（静默），发现新版提示条 → 用户确认 → 下载安装并重启；设置面板加手动「检查更新」。更新签名私钥经 `TAURI_SIGNING_PRIVATE_KEY`（内容）/ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 注入 CI。
- 0.1.0 的存量用户从 0.2.0 起进入自动更新通道（0.1.0 自带 updater，无需迁移）。

**CI（GitHub Actions）**（研究笔记 windows-packaging-ci.md）
- 用官方 `tauri-apps/tauri-action`；release workflow 由 `v*` tag 触发，矩阵 macos-latest（arm64）+ x64 产物 + windows-latest（NSIS），产 draft release，人工 publish。
- public 仓库免费；基础构建零 secret（自动 GITHUB_TOKEN），签名/公证/updater 相关 secret 共 5 个：`APPLE_API_ISSUER`、`APPLE_API_KEY`（.p8 内容或 base64）、`APPLE_API_KEY_PATH`、`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 常规 push 另配轻量 test workflow（lint + vitest + cargo test）；Windows 移植开始时补 windows-latest job。

**Windows 移植范围**（七项已确认 + 一项新增建议）
- `home_dir` 跨平台：改用 Tauri path resolver 或 dirs crate，替换按 macOS 写的 Rust 实现。
- 默认文件夹三级探测（纯函数，前端）：读 `%APPDATA%\Dropbox\info.json`（覆盖自选路径）→ `%USERPROFILE%\OneDrive` → 回退 `%USERPROFILE%\Documents`；iCloud Windows 客户端首版不做。子文件夹名保持「MD 便签」（两端必须一致）。
- 原子写占用重试（Rust）：rename 遇 `ERROR_SHARING_VIOLATION` / `ERROR_ACCESS_DENIED` 时退避重试（约 250ms 起指数退避，8 次封顶），最终失败报错、不丢数据。
- 关闭语义：主窗口 X = 隐藏驻留托盘（提醒、热键、同步监听继续），托盘菜单「退出」才真退出；macOS 行为不变。
- 快捷键直译：应用内 ⌥N→Alt+N，全局 ⌃⌥N→Ctrl+Alt+N（Intel 显卡驱动占用的是 Ctrl+Alt+方向键，无冲突）。
- 标题栏：Windows 用系统原生按钮，零代码不自绘。
- **新增建议（原范围外，发布前定夺）**：加 `tauri-plugin-single-instance`，防 Windows 双开进程争写同一批便签文件。
- 默认文件夹的 localStorage 缓存键不变，已是 per-machine 隔离。

**对外门面**
- LICENSE（MIT）、README 增加下载、截图、反馈入口章节；仓库开启 Issues + Discussions（Issues 报 bug、Discussions 闲聊反馈，两者都算「反馈渠道开放」）。
- Release 说明模板：更新内容、下载资产对照表（arm64/x64/Windows）、SmartScreen「仍要运行」指引、反馈入口。

## Testing Decisions

- 只测外部行为，沿用现有风格（纯函数层，vitest，48 个用例为 prior art）。
- **Seam 1（唯一新增 JS seam）**：把默认文件夹探测从 `initStorage` 内联逻辑提为纯函数（输入 home 与各探测点的存在性结果，输出默认路径），vitest 覆盖三级探测、无云盘回落、子文件夹名拼接。这是最高且最小的 seam，不引入新抽象层。
- **Seam 2（首个 Rust 测试）**：原子写重试逻辑用 `cargo test` 覆盖（tempdir + 注入占用/失败），src-tauri 目前没有测试，此票顺带建立 `cargo test` 惯例。
- **Seam 3（管线校验）**：签名/公证以命令验证为「测试」——`spctl -a -vv`、`stapler validate`、`codesign -dv` 进 CI 步骤与 runbook 人工清单；资产清单（双 DMG + NSIS + latest.json + .sig）在 draft release 里断言齐全后才允许 publish。
- updater 不做端到端自动化：0.1.0 发布后按 runbook 打一个 0.1.1 演练 tag，真机走一遍「发现新版 → 更新 → 重启」，通过后删演练 tag。
- Windows 单测随移植票在 CI 的 windows-latest job 跑；最终以真机验收清单人工收口（安装、SmartScreen、托盘、热键、通知、双机互通）。

## Out of Scope

- 移动版 / WebDAV 存储适配器（ADR-0003，等桌面版真实使用数据）
- Mac App Store 与 security-scoped bookmark 改造（ADR-0002）
- Windows 代码签名证书购买（ADR-0006，等 SmartScreen 实际流失反馈）
- MSI、zip 便携版、官网 / 镜像 / CDN（ADR-0004 / 0006，未来可加不冲突）
- 图标重绘、深色模式等 UI 项（留 TODO.md 备忘）
- 自动更新的分阶段灰度发布（staged rollout）
- 1.0 发布本身（本 spec 只到 0.2.0；1.0 = 双平台各过稳定门槛，届时另立 spec）

## Further Notes

- **人类线下步骤**（实现到对应票时标注，用 /wizard 生成引导脚本）：① Apple Developer Program 注册（$99/年）；② 创建 Developer ID Application 证书（仅 Account Holder 可操作）并导入钥匙串；③ App Store Connect 创建 API key（.p8）；④ `tauri signer generate` 生成 minisign 密钥对并**离线备份私钥**；⑤ GitHub 建仓库、push、开 Issues/Discussions；⑥ 六个 secret 填入 GitHub。
- 稳定门槛是一张「人肉票」：它不是工程任务，而是 Mac 票与 Windows 票之间的 blocking 边（自用 ≥14 天 + 反馈渠道开放 ≥1 周 + 零 P0）。
- 竞品与推广价值的市场调研另行产出（`.scratch/release/research/market-analysis.md`），不影响本 spec 的工程范围；若结论影响推广策略，届时更新 README/Further Notes。
- 推演过的替代方案与拒绝理由均已入 ADR，此处不重复。

## 修订记录

- **2026-10-23**：Apple Developer Program（$99/年）投入推迟，等真实用户反馈再决定是否付费签名。过渡期 macOS 以 ad-hoc 签名分发（CI 双模式：配置 `APPLE_CERTIFICATE` 等 secrets 即自动升级为 Developer ID + 公证），README 需含 macOS「首次打开手动放行」指引。决策记录见 ADR-0002 修订段；票 03 改为 deferred（wizard 与管线已备好，付费即恢复）。用户故事 1 的「不被 Gatekeeper 拦截」改为「放行指引清晰可跟随」。
