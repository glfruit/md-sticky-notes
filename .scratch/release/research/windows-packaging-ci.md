# Tauri 2 Windows 打包（NSIS vs MSI）与 GitHub Actions 多平台构建 — 查证笔记

- **查证日期**：2026-10-22
- **参考版本**：
  - `tauri` crate 最新 stable **2.12.5**（crates.io，2026-10-21 发布；本项目 `src-tauri/Cargo.toml` 锁 2.12.4）
  - `@tauri-apps/cli` 最新 **2.12.4**（npm latest；本项目 ^2.12.3，schema 以本地 `node_modules/@tauri-apps/cli/config.schema.json` 为准）
  - `tauri-apps/tauri-action` 最新 release **action-v1.0.0**（2026-06-29），可用浮动 tag `v1`（此前长期为 `@v0`，现已切到 `@v1`）
- **标注约定**：✅ = 官方文档/源码/schema 明确记载；⚠️ = 基于官方信息的合理推断；❓ = 查证不到、未证实。

---

## 1. Windows 支持的 bundle 目标与配置键

### 1.1 目标类型与默认值

✅ `bundle > targets` 接受 `"all"`、单值或数组；支持的 BundleType 为 `["deb", "rpm", "appimage", "nsis", "msi", "app", "dmg"]`（config schema + [config 参考](https://v2.tauri.app/reference/config/)）。

✅ `"all"` 在 Windows 上展开为 **MSI + NSIS 两种**（tauri-bundler 源码 `crates/tauri-bundler/src/bundle/settings.rs`）：

```rust
TargetPlatform::Windows => vec![PackageType::WindowsMsi, PackageType::Nsis],
```

所以本仓库现在的 `"targets": "all"` 在 Windows runner 上会同时产出 `.msi` 和 `-setup.exe`。只想要 NSIS 就显式写 `"targets": ["nsis"]`（配多平台时按平台分 config 文件，见 §5）。

### 1.2 `bundle > windows` 公共配置（NSIS 与 MSI 共用）

以下为 ✅ schema（2.12.4）逐字段核对结果：

| 键 | 类型 / 默认值 | 说明 |
|---|---|---|
| `webviewInstallMode` | 默认 `{ "silent": true, "type": "downloadBootstrapper" }` | 可选 `skip` / `downloadBootstrapper` / `embedBootstrapper` / `offlineInstaller`（~127MB）/ `fixedRuntime`（~180MB，含 `path`）。⚠️ 注意：MSI 的 updater 场景固定用 `downloadBootstrapper`（schema 原文） |
| `minimumWebview2Version` | string \| null | 用户 WebView2 旧于此版本时安装器会尝试触发升级 |
| `certificateThumbprint` | string \| null | 签名证书的 SHA1 hash |
| `digestAlgorithm` | string \| null | schema 原文："Required for code signing. SHA-256 is recommended." |
| `timestampUrl` | string \| null | 时间戳服务器 |
| `tsp` | bool，默认 `false` | RFC 3161 Time-Stamp Protocol（schema 原文点名 SSL.com 这类云签 CA 需要开它） |
| `signCommand` | string 或 `{ "cmd", "args" }` | 自定义签名命令，`%1` 替换为待签名文件路径；**跨平台交叉编译时必须用它**（[Windows 签名文档](https://v2.tauri.app/distribute/sign/windows/)） |
| `allowDowngrades` | bool，默认 `true` | 是否允许降级安装 |
| `bundleVCRuntime` | bool，默认 `false` | 是否随应用捆绑 VC++ runtime DLL |

### 1.3 `bundle > windows > nsis`（NsisConfig）

✅ 全字段：`installMode`（**默认 `currentUser`**）、`languages`（默认 `["English"]`，未匹配 OS 语言时取第一个）、`customLanguageFiles`、`displayLanguageSelector`、`compression`（默认 `lzma`；可选 `zlib`/`bzip2`/`lzma`/`none`）、`template`（自定义 `.nsi`）、`installerHooks`（`.nsh`，支持 `NSIS_HOOK_PREINSTALL` / `NSIS_HOOK_POSTINSTALL` / `NSIS_HOOK_PREUNINSTALL` / `NSIS_HOOK_POSTUNINSTALL`）、`headerImage`（150×57）、`sidebarImage`（164×314）、`installerIcon`、`uninstallerIcon`、`uninstallerHeaderImage`、`startMenuFolder`、`minimumWebview2Version`（已废弃，移到上层）。

`installMode` 三值（schema 原文 + [windows-installer 文档](https://v2.tauri.app/distribute/windows-installer/)）：
- `currentUser`（默认）：装到 `%LOCALAPPDATA%`，注册表写 `HKCU`，**不需要 Administrator 权限**；
- `perMachine`：装 `Program Files`，系统级，需要管理员；
- `both`：安装时让用户选，但安装器本身需要管理员权限才能执行。

### 1.4 `bundle > windows > wix`（WixConfig，即 MSI）

✅ 全字段：`version`（MSI 版本号，major ≤ 255）、**`upgradeCode`**（GUID，**跨版本必须保持不变**，否则 Windows 视为新应用产生重复安装；默认由 productName+identifier 确定性生成 UUID）、`language`（默认 `en-US`；string / 数组 / `{语言: {localePath}}` 映射）、`template`（自定义 `.wxs`）、`fragmentPaths`、`componentGroupRefs`、`componentRefs`、`featureGroupRefs`、`featureRefs`、`mergeRefs`、`enableElevatedUpdateTask`（默认 false）、`bannerPath`（493×58）、`dialogImagePath`（493×312）、`fipsCompliant`（默认 false，也可用 env `TAURI_BUNDLER_WIX_FIPS_COMPLIANT`）。

⚠️ **WixConfig 没有 `installMode` 字段** — MSI 无 per-user 选项，始终 per-machine、需管理员。官方文档在 NSIS 小节才出现 per-user/无需管理员的论述，MSI 小节完全没有对应内容。这是"MSI 不支持 per-user 安装"在当前 2.x 仍成立的证据（文档未逐字写"MSI 是 per-machine only"，此结论按 schema 缺字段 + 文档结构推断）。

来源：[config 参考](https://v2.tauri.app/reference/config/)、本地 `config.schema.json`、[Windows 安装器文档](https://v2.tauri.app/distribute/windows-installer/)

---

## 2. NSIS vs MSI 实质差异与官方态度

✅ 官方文档明确写出的差异（[windows-installer](https://v2.tauri.app/distribute/windows-installer/)）：

| 维度 | MSI（WiX v3） | NSIS |
|---|---|---|
| 可构建平台 | **只能在 Windows**（WiX 只跑 Windows；还需要开启 VBSCRIPT 可选功能，否则 `failed to run light.exe`） | 全平台可构建（Linux/macOS 经 `cargo-xwin` + LLVM 交叉编译，但文档称这是"last resort"，首选 Windows 机器或 CI） |
| 安装范围 | 无 per-user 选项（见 §1.4 推断） | 默认 per-user、无需管理员 |
| 多语言 | **每种语言一个安装包**（`wix.language`） | **单一安装包内含多语言**（`nsis.languages` + `displayLanguageSelector`） |
| Win7 | 默认 `downloadBootstrapper` 在 Win7 上可能因 TLS 1.2 失败 | `downloadBootstrapper` 在 Win7 正常 |
| 定制 | `.wxs` 模板 + fragments（企业级能力强） | `.nsi` 模板 + 4 个安装/卸载 hook |
| FIPS | 支持（`fipsCompliant`） | 无对应项 |

✅ 官方**没有**一句"推荐 NSIS 而非 MSI"的总括性表述，两格式并行介绍，`"all"` 默认同时产出两者。

⚠️ 但有两处官方信号显示 NSIS 是新一代默认倾向：
1. NSIS 文档小节以"默认 per-user、无需管理员"作为优点来写，而 MSI 小节无此待遇；
2. `tauri-action` 专门提供 `updaterJsonPreferNsis` 输入（默认 `false`，注释原话 "**for legacy reasons**"）——即 updater 的 `latest.json` 默认还指向 `.msi` 只是历史包袱。

⚠️ 对个人开发者的开源小工具，取舍关键点（综合以上官方事实的推断）：
- **NSIS 胜**：单文件多语言安装器；用户双击无 UAC 弹窗（per-user）；产物一个 `-setup.exe` 便于官网/GitHub 直链分发；将来若在 Linux/macOS 上交叉编译也有出路；updater JSON 可选指向 NSIS。
- **MSI 的价值**主要是企业 IT 场景（组策略/msiexec 静默部署、系统级安装）。个人开源工具基本用不上，却要付出"只能 Windows 构建 + 每语言一个包 + 需管理员"三重成本。

来源：同上；tauri-action README（https://github.com/tauri-apps/tauri-action）

---

## 3. Windows 代码签名现状（个人开发者视角）

✅ 无证书会发生什么（[sign/windows](https://v2.tauri.app/distribute/sign/windows/)）：
- 不签名**可以正常运行**，但用户从浏览器下载后启动会触发 SmartScreen 警告（原文大意："is not trusted and can not be started"）；上架 Microsoft Store 必须签名。
- 即使签了名，**SmartScreen 信誉仍需积累**；用同一张证书持续给每个 release 签名可跨版本积累信誉；也可把文件提交 Microsoft 人工复审。
- **2024 年起 EV 证书不再"即买即过 SmartScreen"**，与 OV 同样按信誉积累。

✅ tauri.conf.json 签名配置键（见 §1.2 表）：`certificateThumbprint` / `digestAlgorithm` / `timestampUrl` / `tsp`；非 Windows 工具链或云签服务用 `signCommand`（例：`"signCommand": "relic sign --file %1 --key azure --config relic.conf"`）。官方提醒：SSL 证书不能当签名证书用（"SSL certificates do not work!"）。

✅ 官方覆盖的签名工具链：本地 `signtool`（默认）、`relic`（Azure Key Vault）、`artifact-signing-cli`（**Azure Artifact Signing**，即原 Trusted Signing / Azure Code Signing 改名而来，`cargo install artifact-signing-cli`，参数 `-e` endpoint、`-a` account、`-c` certificate profile）。OV 证书"2023-06-01 之前购买"的流程才完全适用官方 OV 指南；新 OV/EV 证书按 CA 文档 + `signCommand` 走。

个人开发者低成本选项（⚠️ 除注明外均为第三方信息，价格为 2026-10 搜索快照，购买前请核对官网）：

| 方案 | 价格量级 | 说明 |
|---|---|---|
| 不签名 | ¥0 | SmartScreen 警告 + "更多信息→仍要运行"；开源小工具常见起步态 |
| 自签 | ¥0 | ❓+⚠️：官方文档未提自签。推断：根证书不受信，需用户手动装根证书，且对 SmartScreen 信誉无帮助——**只适合本地测试，不适合分发** |
| [Azure Artifact Signing（原 Trusted Signing）](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/) | **$9.99/月**（Basic，5000 签名/月） | ✅ Microsoft 已开放个人开发者 public preview 注册（[官方博客](https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554)）；年化 ~$120；Tauri 官方有 `artifact-signing-cli` 对接 |
| [Certum Open Source Code Signing](https://certum.store/open-source-code-signing-code.html) | **~$29/年起**（面向开源开发者） | 云签（SimplySign）；⚠️ 注意 2026-02-27 起单证书最长有效期 459 天；标准个人云签约 $115–139/年 |
| [SSL.com IV 代码签名](https://www.ssl.com/products/software-integrity/code-signing/iv) | 证书 ~$129/年，eSigner 云签另计（约 $15–20/月，前 30 天免费） | 个人验证（IV）证书，无需公司实体；配合 `tsp: true`（schema 原文点名 SSL.com 用 RFC 3161） |
| [SignPath Foundation](https://signpath.org) | **免费**（符合条件 OSS 项目） | ⚠️ 证书签发给 Foundation、发布者显示为 SignPath Foundation 而非个人；有审核条件；参考案例：[DB Browser for SQLite](https://sqlitebrowser.org/blog/signing-windows-executables-our-journey-with-signpath) |

✅ CI 上注入 Windows 签名的 secret 名：
- 证书文件方式：`WINDOWS_CERTIFICATE`（base64 的 `.pfx`，`certutil -encode` 生成）+ `WINDOWS_CERTIFICATE_PASSWORD`，CI 中 `certutil -decode` + `Import-PfxCertificate` 导入 `Cert:\CurrentUser\My`；
- Azure（Key Vault / Artifact Signing）：`AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_CLIENT_SECRET`（Artifact Signing 另需 .NET 8、Azure CLI、signtool）。

---

## 4. 直接分发 zip（绿色免安装）是否可行

✅ **官方文档没有任何 portable / zip 分发章节**——[windows-installer](https://v2.tauri.app/distribute/windows-installer/) 通篇只讲两种安装器（已逐段核对原 mdx 源文件，无 portable 字样）。结论：zip 属于"非官方支持但可行"的分发方式。

✅ 可行性依据：
- `tauri build` 在 `src-tauri/target/release/<productName>.exe` 产出裸二进制，前端资源打包进二进制内，Windows 上不依赖安装器的资源文件；
- 官方讨论串 [tauri-apps/discussions #3048](https://github.com/orgs/tauri-apps/discussions/3048) 确认"取 target/release 下的 exe（连同旁边可能存在的 dll）直接分发"是标准做法；
- `tauri-action` 有现成输入 **`uploadPlainBinary`**（默认 `false`）可把裸二进制一并传到 GitHub Release——CI 产 zip 产物有一等支持。

✅ WebView2 依赖在 zip 场景的处理：
- 官方文档 note 原文："**On Windows 10 (April 2018 release or later) and Windows 11, the WebView2 runtime is distributed as part of the operating system.**"（Win10+Win11 系统自带）
- zip 没有安装器代装 WebView2，只能依赖系统预装；`webviewInstallMode: skip` 的官方警告同样适用于此："Your application WILL NOT work if the user does not have the runtime installed."
- 要覆盖无 WebView2 的极端机器，只能带 fixedVersion 运行时（~180MB）随包分发——⚠️ 官方无 portable 场景的 `fixedRuntime` 指南，此为社区做法推断（参考：[Stack Overflow: fixed version runtime](https://stackoverflow.com/questions/69633165/how-to-call-webview2-fixed-version-from-tauri)）。

---

## 5. GitHub Actions 多平台 CI 当前最佳实践

### 5.1 官方示例 workflow（✅ 逐字取自 [tauri-docs 源文件 Pipelines/github.mdx](https://github.com/tauri-apps/tauri-docs/blob/dev/src/content/docs/distribute/Pipelines/github.mdx)，对应页面 https://v2.tauri.app/distribute/pipelines/github/）

```yaml
name: 'publish'

on:
  workflow_dispatch:
  push:
    branches:
      - release

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest' # for Arm based macs (M1 and above).
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest' # for Intel based macs.
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'ubuntu-22.04-arm' # Only available in public repos.
            args: ''
          - platform: 'windows-latest'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v7

      - name: install dependencies (ubuntu only)
        if: matrix.platform == 'ubuntu-22.04' || matrix.platform == 'ubuntu-22.04-arm'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils

      - name: setup node
        uses: actions/setup-node@v6
        with:
          node-version: lts/*
          cache: 'npm' # Set this to npm, yarn or pnpm.

      - name: install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: install frontend dependencies
        run: npm install

      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: app-v__VERSION__
          releaseName: 'App v__VERSION__'
          releaseBody: 'See the assets to download this version and install.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

要点：
- ✅ `__VERSION__` 由 action 自动替换为 tauri.conf.json 里的应用版本；`releaseDraft: true` 时五个矩阵 job 的产物全部上传到**同一个 draft release**，人工在 Releases 页发布。触发方式也可换成 `push: tags: ['app-v*']`。
- ✅ 三个平台的差异只有一处：Ubuntu 需要装 `libwebkit2gtk-4.1-dev` 等 GTK/webkit 系统依赖；macOS/Windows 开箱即用。
- ✅ 缓存：Node 用 `setup-node` 的 `cache: 'npm'`，Rust 用 `swatinem/rust-cache@v2`（`workspaces: './src-tauri -> target'`）。
- ✅ 若遇到 "Resource not accessible by integration"：到 Settings → Actions → Workflow permissions 勾选 "Read and write permissions"。
- ✅ 无 Apple 证书构建的 macOS 产物，官方建议配置 ad-hoc signing identity，避免 Apple Silicon 版下载后被 macOS 判为 damaged（Pipelines 指南 Code Signing note + [sign/macos #ad-hoc-signing](https://v2.tauri.app/distribute/sign/macos/)）。

### 5.2 tauri-action 关键 inputs（✅ README，最新版 action-v1.0.0）

- 发 Release 组：`tagName`、`releaseName`、`releaseBody`、`releaseCommitish`、`releaseDraft`（默认 false）、`prerelease`（默认 false）、`generateReleaseNotes`（默认 false）、`releaseId`（直接往指定 release 传）。
- 三个都省略 = 只构建不上传（适合纯 CI 测试）。
- 路径/构建：`projectPath`（项目不在仓库根时用）、`tauriScript`、`args`（如 `--target`）。
- Updater 组：`uploadUpdaterJson`（默认 true，自动生成 `latest.json` 静态 JSON 并传到 release）、`updaterJsonPreferNsis`（默认 false，legacy）、`uploadUpdaterSignatures`（默认 true）。
- 产物组：`uploadPlainBinary`（默认 false，上传裸二进制）、`uploadWorkflowArtifacts`（默认 false）、`releaseAssetNamePattern` / `workflowArtifactNamePattern`。
- Outputs：`releaseId`、`releaseHtmlUrl`、`releaseUploadUrl`、`artifactPaths`、`appVersion`。

### 5.3 CI 需要的 secrets 一览

| 用途 | Secret 名 | 说明 |
|---|---|---|
| 基础 | `GITHUB_TOKEN` | 自动注入，无需创建；需写权限才能发 release |
| Windows 签名（pfx） | `WINDOWS_CERTIFICATE`、`WINDOWS_CERTIFICATE_PASSWORD` | base64 pfx + 导出密码 ✅ |
| Windows 签名（Azure） | `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_CLIENT_SECRET` | Key Vault 与 Artifact Signing 通用 ✅ |
| macOS 签名 | `APPLE_CERTIFICATE`（base64 p12）、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`KEYCHAIN_PASSWORD` | ✅ sign/macos 指南 |
| macOS 公证（App Store 外分发可选） | `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`，或 API Key 方式 `APPLE_API_ISSUER` / `APPLE_API_KEY` / `APPLE_API_KEY_PATH` | ✅ sign/macos 指南 |
| Updater 签名 | `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ✅ updater 文档；注意原文警告 ".env files do not work!"，必须用真 env；公钥填 `plugins.updater.pubkey`（必须是内容不是路径）；`npm run tauri signer generate -w ~/.tauri/myapp.key` 生成；**私钥丢失则无法向已装用户推更新** |

---

## 6. Rust target 与 Runner 对应关系

✅ 当前 GitHub 托管 runner（[actions/runner-images README](https://github.com/actions/runner-images/blob/main/README.md)，main 分支，2026-10 状态）：

| Label | 实际环境 | 架构 |
|---|---|---|
| `macos-latest` | **macOS 26**（同 `macos-26`） | **arm64 only**（Apple Silicon） |
| `macos-latest-large` / `macos-26-intel` / `macos-15-large` | macOS 26/15 Intel | x64（仅 larger runner / 专用 label） |
| `macos-14` | 已标 deprecated | arm64（`macos-14`）/ x64（`macos-14-large`） |
| `macos-13` | **已下架**（列表中不存在） | — |
| `windows-latest` | **Windows Server 2025**（同 `windows-2025`） | x64 |
| `windows-11-arm` | Windows 11 ARM | arm64（Tauri 生态暂无官方模板） |

要点：
- ✅ `macos-latest` 现在是 **arm64**。官方矩阵在同一个 arm64 runner 上跑两次，分别以 `--target aarch64-apple-darwin`（本机）和 `--target x86_64-apple-darwin`（交叉编译 Intel）产出两套 dmg——Intel 目标在 arm64 runner 上交叉编译是官方示例的既定做法。
- ✅ Universal binary：官方 App Store 文档示范 `tauri build --bundles app --target universal-apple-darwin`，一个产物同时支持 Apple Silicon + Intel（前提是 toolchain 装了两个 target，官方 workflow 的 `targets: 'aarch64-apple-darwin,x86_64-apple-darwin'` 正是为此）。⚠️ 取舍：universal 单安装包但体积近似翻倍；双 target 则两个安装包、产物更小。官方 release 模板默认后者。
- ✅ Windows 选 `windows-latest`（x64）即可；本项目 tauri 2.12.x 无需额外系统依赖。

---

## 7. 对本项目的决策摘要

前提：个人开发者 + 开源小工具 + 官网/GitHub 直链分发；已完成 macOS 版，现补 Windows；仓库当前 `bundle.targets: "all"`、无 `.github/workflows`、无签名配置。

**分发格式：推荐 NSIS 为主 + zip 为辅，放弃 MSI。**
- NSIS：单一多语言安装包、默认 per-user 无 UAC（下载→双击→装完，直链体验最好）、官方 updater 生态正向它倾斜（`updaterJsonPreferNsis` 自证 MSI 指向只是 legacy）、将来想交叉编译也有官方路径。配置只需把 targets 按平台设为 `["nsis"]`（可在 `bundle.windows.nsis` 里顺手配 `languages: ["English", "SimplifiedChinese"]`）。
- MSI 对本场景零收益：只能 Windows 构建、每语言一个包、强制管理员；不投入。
- zip：几乎零成本追加——`tauri build` 的裸 exe 即可分发（或开 `uploadPlainBinary` 让 CI 自动传），WebView2 在 Win10/11 系统自带；适合"免安装党"，缺点是 SmartScreen 对未签名裸 exe 警告同样存在、且无自动卸载入口。建议 NSIS + zip 双产物上 release。
- ⚠️ 一个需实测的风险点（未查证）：productName 为中文"MD 便签"（含空格）在 Windows 产物命名/安装路径上的表现，建议第一次 CI 构建后检查安装包文件名与安装目录是否正常。

**CI：用 GitHub Actions，收益远大于成本。**
- 公共仓库标准 runner 免费（含 macOS；macOS 仅在私有仓库按 10× 分钟计费），官方模板即拷即用，`tauri-action` 自动建 draft release + 汇总五平台产物（还可顺带产出 updater `latest.json`）。手头 macOS 已有本地构建，最低成本方案是：CI 只挂 `windows-latest` 单 job 补 Windows 产物，后续想加 Linux 再扩矩阵。
- 签名起步态：**零 secret 也能跑**（只有自动的 `GITHUB_TOKEN`），接受 SmartScreen"更多信息→仍要运行"。开源小工具建议先跑通无签名链路，再决定要不要花钱。

**最少 secrets 配置清单（按投入档位）：**
1. 零成本档：无任何 secret，不签名、暂不上 updater → 0 个。
2. 加自动更新（推荐尽早，reputation 从第一天开始积累）：`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → 2 个。
3. 买签名：倾向 Azure Artifact Signing（$9.99/月、个人可注册、Tauri 官方有 `artifact-signing-cli` 对接，配 `AZURE_CLIENT_ID/​AZURE_TENANT_ID/​AZURE_CLIENT_SECRET` + `signCommand`）；预算敏感则 Certum 开源证书 ~$29/年起（配 `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD`，云签注意 `tsp` 开关）。
4. macOS 侧已有本地签名流程的话，迁移到 CI 才需要 `APPLE_CERTIFICATE` 等一组；继续本地构建 macOS 则不用动。

**未查证/待确认事项**：官方未给 portable 分发指引（§4 推断部分）；中文 productName 在 Windows 安装器中的行为；Certum/SSL.com 价格为搜索快照，购买前需到官网复核；Tauri 2 对 Win7/8 的支持范围本次未查（若目标用户含老系统再补查）。
