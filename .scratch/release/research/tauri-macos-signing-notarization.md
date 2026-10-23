# Tauri 2 macOS 代码签名与公证（Developer ID + Notarization + DMG）研究笔记

- **查证日期**：2026-10-22
- **参考版本**：tauri crate 最新稳定版 **2.12.5**（crates.io `max_stable_version`，查询于 2026-10-22）；本项目实际使用 `tauri 2.12.4` / `tauri-build 2.7.3` / `@tauri-apps/cli 2.12.3`（见 `src-tauri/Cargo.toml` 与 `package.json`）。官方源码结论均基于 GitHub `dev` 分支当日内容（dev 分支即 2.x 的开发分支）。
- **证据标注约定**：
  - 【文档】= 官方文档（v2.tauri.app）明确写了的内容
  - 【源码】= 从 tauri-apps/tauri 官方仓库源码直接读到的行为
  - 【推断】= 由上述证据合理推断、但无明文
  - 【未证实/不确定】= 查证不到，如实标注

主要一手来源：

- 官方文档：macOS Code Signing — https://v2.tauri.app/distribute/sign/macos/
- 官方文档：Configuration Reference（bundle > macOS / dmg / createUpdaterArtifacts）— https://v2.tauri.app/reference/config/
- 官方文档：Updater Plugin — https://v2.tauri.app/plugin/updater/
- 官方文档：macOS App Store Distribution（仅用于对比 entitlements）— https://v2.tauri.app/distribute/app-store/
- 官方 CLI 环境变量清单 — https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/ENVIRONMENT_VARIABLES.md
- 源码（均为 `https://github.com/tauri-apps/tauri/blob/dev/<path>`，下文简称"源码路径"）：
  - `crates/tauri-utils/src/config.rs`（配置键定义与默认值）
  - `crates/tauri-cli/src/interface/rust.rs`（环境变量覆盖配置）
  - `crates/tauri-cli/src/bundle.rs`（updater 产物签名）
  - `crates/tauri-bundler/src/bundle.rs`（打包主流程与 target 顺序）
  - `crates/tauri-bundler/src/bundle/macos/app.rs`（.app 签名 + 公证调用点）
  - `crates/tauri-bundler/src/bundle/macos/sign.rs`（identity 解析、codesign 参数组装）
  - `crates/tauri-bundler/src/bundle/macos/dmg/mod.rs`（DMG 打包与自签）
  - `crates/tauri-bundler/src/bundle/updater_bundle.rs`（.app.tar.gz 生成）
  - `crates/tauri-macos-sign/src/lib.rs`（notarytool 提交与 stapler）
  - `crates/tauri-macos-sign/src/keychain.rs`（codesign 具体参数、CI 临时钥匙串）

---

## 1. tauri.conf.json 中 macOS 签名相关配置键

位置：`bundle > macOS`（schema 名 `MacConfig`）。

| 键 | 类型 | 默认值 | 行为 | 证据 |
|---|---|---|---|---|
| `signingIdentity` | `string \| null` | `null` | codesign 使用的签名身份（如 `Developer ID Application: Your Name (TEAMID)`）；设为 `"-"` 表示 ad-hoc 签名 | 【文档】config reference；【源码】`tauri-utils/src/config.rs` L654-656 |
| `entitlements` | `string \| null` | `null` | entitlements **文件路径**；仅在有值时才传给 codesign | 【文档】config reference；【源码】`config.rs` L663-664、`tauri-bundler/.../macos/sign.rs` |
| `hardenedRuntime` | `bool` | **`true`** | 是否对可执行文件启用 hardened runtime（codesign `--options runtime`） | 【源码】`config.rs` L657-659（`#[serde(default = "default_true")]`）、L685（`hardened_runtime: true`）；【文档】config reference 同样标注默认 true |
| `providerShortName` | `string \| null` | `null` | Apple ID 挂多个 team 时指定公证用 team | 【文档】ENVIRONMENT_VARIABLES.md（`APPLE_PROVIDER_SHORT_NAME` 覆盖此键） |
| `minimumSystemVersion` | `string \| null` | `"10.13"` | 写入 Info.plist 的 `LSMinimumSystemVersion` | 【文档】config reference |
| `dmg` | `DmgConfig` | 见第 6 节 | DMG 外观配置 | 【源码】`config.rs` L552-596 |

### 自动探测签名身份的条件（重点）

Tauri **不会自动扫描登录钥匙串来"猜"身份**。签名是否发生完全由以下三个输入决定（`tauri-bundler/.../macos/sign.rs` 的 `keychain()` 函数）【源码】：

1. 设置了 `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`（CI 路线）→ 创建**临时钥匙串**导入证书；若同时还配了 `signingIdentity`，会校验证书身份与之匹配，不匹配直接报错。
2. 否则有身份（`signingIdentity` 配置项，或 `APPLE_SIGNING_IDENTITY` 环境变量——后者**覆盖**配置，见 `tauri-cli/src/interface/rust.rs` 中 `tauri_config_to_bundle_settings`）→ 用该身份签名。
3. 两者都没有 → `keychain()` 返回 `None`，**整个签名与公证被静默跳过，构建仍成功**（`macos/app.rs`：`else if let Some(keychain) = super::sign::keychain(...)`，无 else 告警）。

【文档】distribute/sign/macos 页建议用 `security find-identity -v -p codesigning` 查看本机可用身份。

---

## 2. Developer ID 公证路线的 entitlements 与 hardened runtime

- **hardened runtime 默认开启**（`hardenedRuntime` 默认 `true`，见上表）。且【源码】`sign.rs` 中传给 codesign 的条件是 `target.is_an_executable && settings.macos().hardened_runtime`——即只有**主可执行文件**（.app）加 `--options runtime`，嵌套的 frameworks / sidecar 二进制不加。
- **entitlements 默认为空**：不配置 `entitlements` 就不传 `--entitlements`，Tauri **没有内置的默认 entitlements plist**（【源码】`sign.rs` 中 `None => (None, None)`；在官方仓库全文检索 `com.apple.security` 无任何 macOS entitlements 模板文件）。
- **官方提供的 entitlements 内容**：Developer ID + 公证路线的官方文档（distribute/sign/macos）**没有给出、也没有要求** entitlements 文件。官方唯一给出 entitlements plist 示例的地方是 App Store 分发指南（distribute/app-store），内容是 `com.apple.security.app-sandbox = true` + `com.apple.application-identifier` + `com.apple.developer.team-identifier`——那是 **App Store 路线专用**（App Store 强制 App Sandbox），**不适用于** Developer ID 路线。【文档】
- 【推断】Tauri 默认不启用 App Sandbox，WKWebView 在 hardened runtime 下不需要额外 entitlements 即可运行，因此本项目走 Developer ID + 公证时**可以完全不写 entitlements**（社区普遍做法）；若未来加 App Sandbox 才需要配 `entitlements` 并自行处理 sandbox 限制。
- 【文档】重要限制：**免费 Apple 账号不能公证**（notarization 需要付费开发者账号），免费账号签出的应用仍会被 macOS 标记为未验证。

---

## 3. 公证完整流程与环境变量

### 3.1 全部相关环境变量（官方清单 ENVIRONMENT_VARIABLES.md + 源码核对）

**签名身份类**：

| 变量 | 用途 | 证据 |
|---|---|---|
| `APPLE_SIGNING_IDENTITY` | 指定签名身份，**覆盖** `bundle > macOS > signingIdentity` | 【文档】ENVIRONMENT_VARIABLES.md；【源码】`interface/rust.rs` |
| `APPLE_CERTIFICATE` | base64 编码的 `.p12` 证书（CI 用），未设 `APPLE_SIGNING_IDENTITY` 时从中推断身份 | 【文档】 |
| `APPLE_CERTIFICATE_PASSWORD` | 该 `.p12` 的导出密码 | 【文档】 |
| `APPLE_PROVIDER_SHORT_NAME` | 多 team 时指定公证 team，覆盖 `providerShortName` | 【文档】 |
| `TAURI_SKIP_SIDECAR_SIGNATURE_CHECK` | 跳过 sidecar 二进制签名 | 【文档】 |
| CLI 旗标 `--no-sign` | 完全跳过签名打包 | 【源码】`tauri-cli/src/build.rs` L79-81 |
| CLI 旗标 `--skip-stapling` | 公证提交但不等待/不 staple | 【文档】sign/macos；【源码】`build.rs` L71-73 |

**公证凭据——路线 A：Apple ID（个人账号 + app-specific password）**：

| 变量 | 用途 |
|---|---|
| `APPLE_ID` | Apple 账号邮箱 |
| `APPLE_PASSWORD` | **App-specific password**（在 appleid.apple.com 生成，不是账号密码）；支持 `@keychain:` / `@env:` 前缀 |
| `APPLE_TEAM_ID` | Team ID（开发者会员页可查）。**三件套缺 TEAM_ID 时构建直接报错**（`NotarizeAuthError::MissingTeamId` 为致命错误）【源码】`macos/app.rs` L143-145 |

【源码】`tauri-bundler/.../macos/sign.rs` `notarize_auth()`：三件套齐全才走此路线。

**公证凭据——路线 B：App Store Connect API key（推荐用于 CI）**：

| 变量 | 用途 |
|---|---|
| `APPLE_API_KEY` | API Key 的 Key ID |
| `APPLE_API_ISSUER` | Issuer ID（`APPLE_API_KEY` 存在时必填） |
| `APPLE_API_KEY_PATH` | `.p8` 私钥文件路径；**未设置时自动搜索** `./private_keys`、`~/private_keys`、`~/.private_keys`、`~/.appstoreconnect/private_keys` 下的 `AuthKey_<key_id>.p8` |

【文档】`.p8` 私钥**只能下载一次**，页面刷新后可再查看入口。两条路线都设置时优先级：【源码】`notarize_auth()` 先匹配 Apple ID 三件套，再匹配 API key 三件套，都缺则返回 `MissingCredentials` → 打 warning 跳过公证（见第 4 节）。

### 3.2 构建阶段：codesign + notarize 发生在哪一步

`tauri build` 在 macOS 上的实际顺序（【源码】`tauri-bundler/src/bundle.rs` 的 target 循环 + `macos/app.rs` + `tauri-macos-sign/src/lib.rs`）：

1. `cargo build --release`（Rust 编译，不涉及签名）。
2. **`MacOsBundle`（.app）target 先构建**（注释明言 "dmg is dependent of MacOsBundle"）：
   a. 组装 `.app`，先 `xattr -crs` 清除扩展属性（引用 Apple QA1940）；
   b. **由内向外**签名：frameworks、sidecar 二进制先签，`.app` 整体最后签；
   c. codesign 实际参数【源码】`tauri-macos-sign/src/keychain.rs`：`codesign --force -s <identity> [--options runtime（仅可执行文件且 hardenedRuntime=true）] [--entitlements <path>（仅配置了才传）] [--keychain <path>（CI 临时钥匙串时）] <path>`。注意**没有显式传 `--timestamp`**（依赖 codesign 默认行为）【源码观察】；
   d. **紧接着公证**（仍在 app 打包步骤内、DMG 之前）：`notarize_auth()` 拿到凭据后——
      - 用 `ditto -c -k --keepParent --sequesterRsrc` 把 `.app` 压成 zip（注释：模拟 Finder 打包以避免 99% 公证误报），并**对 zip 也做一次 codesign**；
      - `xcrun notarytool submit <zip> --wait --output-format json`（附 `--apple-id/--password/--team-id` 或 `--key-id/--key/--issuer`）；
      - 状态为 `Accepted` → 自动 **staple**：`xcrun stapler staple -v <app>`；状态非 Accepted → 报错并附 `xcrun notarytool log <id>` 的日志。
3. **DMG target 随后构建**：用内嵌的 `bundle_dmg.sh`（hdiutil + osascript 驱动 Finder）把**已公证并 staple 过的 `.app`** 打进 DMG；然后**用同一身份对 DMG 文件自身做 codesign（`is_an_executable: false`，无 hardened runtime），但 DMG 不做公证**；ad-hoc（`-`）身份时打印 "skipping self-signing DMGs" 跳过。【源码】`dmg/mod.rs`
4. 最后 CLI 层 `sign_updaters`：若启用了 updater，把 `.app` 打成 `.app.tar.gz` 并用 minisign 私钥生成 `.sig`（见第 5 节）。【源码】`tauri-cli/src/bundle.rs` L230-232

即：**公证的对象是 .app（经 ditto zip 提交），staple 也贴在 .app 上；DMG 只是"装着已 staple 应用的容器"，其自身签名但未公证**。这在 Developer ID 分发下是有效组合（Gatekeeper 校验的是 DMG 内的 app）【文档无明文，此句为推断+源码事实组合】。

---

## 4. 常见坑

- **无公证凭据不会 fail 构建**：签名身份存在但三件套/API key 全缺 → 只打 warning `skipping app notarization, ...`，产出"已签名未公证"的 app（浏览器下载会触发 Gatekeeper "已损坏/未验证" 警告）。只有"给了 APPLE_ID+APPLE_PASSWORD 却缺 APPLE_TEAM_ID"才**硬报错**。【源码】`macos/app.rs` L135-150
- **没有签名身份时构建静默成功（不签名）**：CI 上如果忘记配 `APPLE_CERTIFICATE`/`APPLE_SIGNING_IDENTITY`，不会报错，产物是未签名的（本地开发这是预期行为；CI 需自查产物）。`--no-sign` 则会打一条 warning。【源码】`app.rs` L115-119、`build.rs` L95-97
- **公证超时与重试**：Tauri 侧**没有实现超时或重试逻辑**（【源码】对 `tauri-macos-sign` 全文 grep `timeout/retry/sleep` 仅命中 `--wait` 相关；等待完全交给 `notarytool submit --wait` 阻塞，Apple 侧审核通常几分钟、偶尔更长）。若 Apple 拒绝（status 非 Accepted），Tauri 报错并把 notarytool 日志附上。CI 需给足 job 超时。【未证实】Apple 侧具体时长无官方保证。
- **stapling 是自动的**：走默认 `notarize()`（wait=true）时 Accepted 后自动 `stapler staple`；加 `--skip-stapling` 则变成"提交不等待"（wait=false，打印 "Not waiting for notarization to finish" 并提示之后手动 `xcrun stapler staple <app>`），适合首次快速验证。【文档】+【源码】`lib.rs`
- **CI 签名**：`APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` 路线会自动创建**临时钥匙串**（随机 16 位密码、`set-keychain-settings -t 3600 -u`、`set-key-partition-list -S apple-tool:,apple:,codesign:` 白名单 `/usr/bin/codesign` 等，Drop 时自动删除）——不需要手工建钥匙串，但 GitHub Actions 官方示例仍展示用 `security create-keychain` 手动导入的方式，两条路都可行。【源码】`tauri-macos-sign/src/keychain.rs`；【文档】sign/macos 的 GitHub Actions 示例（使用 `tauri-apps/tauri-action@v0`）
- **证书注意**：Developer ID Application 证书**只有 Account Holder 能创建**（CSR 可用其他邮箱生成以绑定另一个 Apple ID）；无效证书不会出现在"登录"钥匙串和 `find-identity` 输出（下载 .cer 时默认钥匙串要选 login）。【文档】
- **ad-hoc（`"-"`）**：仅适合 Apple Silicon 本机测试，用户首次打开仍需在"隐私与安全性"里放行，**不能用于对外分发**。【文档】

---

## 5. Tauri updater（tauri-plugin-updater）当前配置

### 5.1 `bundle > createUpdaterArtifacts`

- 类型 `false | true | "v1Compatible"`，默认 `false`（`Updater` 枚举，`Bool(bool)` 或 `String("v1Compatible")`）。作用："Produce updaters and their signatures or not"——生成更新包（macOS 上为 `.app.tar.gz`）并用 minisign 私钥生成 `.sig`。【文档】config reference +【源码】`config.rs` L1553-1565
- `"v1Compatible"` 仅用于从 Tauri v1 迁移（产出 zip 包装的旧格式）；文档明确 **"This setting will be removed in v3"**，新项目直接用 `true`。【文档】plugin/updater

### 5.2 签名密钥（minisign）

- 生成：`cargo tauri signer generate -w ~/.tauri/myapp.key`（或 `npx @tauri-apps/cli signer generate ...`），产出公钥（填入配置）与私钥（妥善保管；丢失则已装用户无法收到更新）。【文档】plugin/updater
- 构建时环境变量（**必须是真实环境变量，`.env` 文件不生效**）【文档】plugin/updater + ENVIRONMENT_VARIABLES.md：
  - `TAURI_SIGNING_PRIVATE_KEY`：私钥的**路径或内容**（【源码】`bundle.rs` L288-298：先按环境变量读，若值是存在的文件路径则读文件内容）
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码；CI 下未设时**默认空字符串**（【源码】L283-285）
  - `TAURI_SIGNING_PRIVATE_KEY_PATH`：仅 `tauri signer sign` 子命令用，与 `TAURI_SIGNING_PRIVATE_KEY` 互斥。【文档】ENVIRONMENT_VARIABLES.md
- 【源码】若配置了 `plugins > updater > pubkey` 但没设 `TAURI_SIGNING_PRIVATE_KEY`，`tauri build` **直接报错**："A public key has been found, but no private key. Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable."；签名时还校验私钥 keynum 与 pubkey 是否一致，不一致打 warning（升级后无法通过运行时校验）。

### 5.3 `plugins > updater` 配置格式

```jsonc
// tauri.conf.json
{
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<公钥内容，内联字符串，不能是文件路径>",
      "endpoints": [
        "https://releases.example.com/{{target}}/{{arch}}/{{current_version}}",
        "https://github.com/<user>/<repo>/releases/latest/download/latest.json"
      ]
      // 可选: windows.installMode = "passive"(默认) | "basicUi" | "quiet"
      // 可选: dangerousInsecureTransportProtocol (允许 http，不建议)
    }
  }
}
```

- `endpoints` 模板变量：`{{current_version}}`、`{{target}}`（`darwin`/`linux`/`windows`）、`{{arch}}`（`x86_64`/`aarch64` 等）；生产模式**强制 TLS**；仅当响应非 2XX 才会尝试下一个 endpoint。【文档】plugin/updater
- **静态 JSON**（如 GitHub Releases 的 `latest.json`）格式：顶层 `version`（SemVer，可带 `v` 前缀）、可选 `notes`、`pub_date`（RFC 3339）、`platforms`，platform 键为 `<os>-<arch>`（如 `darwin-aarch64`），每项必填 `signature`（**`.sig` 文件的原始内容**，不能是路径/URL）与 `url`；整个文件先整体校验再比较版本。【文档】plugin/updater
- 动态服务器：无更新返回 `204`；有更新返回 `200` + `{ version, url, signature, pub_date?, notes? }`。【文档】plugin/updater

### 5.4 macOS 用哪个更新产物

- **DMG 不是更新载体**。macOS 的更新包是 `<app>.app.tar.gz` + `.app.tar.gz.sig`（由**已签名/公证/staple 过的 `.app`** 直接 tar 而来）。【文档】plugin/updater 的产物表；【源码】`updater_bundle.rs` `bundle_update_macos()`（从 `MacOsBundle` 产物找 `.app` 打 tar.gz）
- DMG 仍照常产出，用于**首次安装**分发；updater 只消费 tar.gz。

### 5.5 两套签名体系互相独立（确认）

- Apple 侧：`signingIdentity`/`APPLE_*` → codesign + notarytool，管的是 Gatekeeper 首次运行校验。
- Updater 侧：`plugins > updater > pubkey` + `TAURI_SIGNING_PRIVATE_KEY` → minisign，管的是**更新包完整性**（防止更新投毒）。
- 【源码】两者在 `tauri-cli/src/bundle.rs` 与 `tauri-bundler/.../macos/sign.rs` 是完全独立的两段代码路径，互不读取对方配置。【推断】即使 minisign 私钥泄露也不会影响 Apple 签名，反之亦然；两者都要有：Apple 签名保证安装包可信，minisign 保证自动更新可信。

---

## 6. DMG 配置键（`bundle > macOS > dmg`）

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `background` | `string \| null` | `null` | DMG 背景图，支持 png/jpg/gif |
| `windowPosition` | `Position \| null` | `null` | 卷窗口在屏幕上的位置（不设则系统默认） |
| `windowSize` | `Size` | `{ "width": 660, "height": 400 }` | 卷窗口大小 |
| `appPosition` | `Position` | `{ "x": 180, "y": 170 }` | app 图标在窗口内的位置 |
| `applicationFolderPosition` | `Position` | `{ "x": 480, "y": 170 }` | Applications 文件夹图标位置 |

`Position` 为 `{ "x": uint, "y": uint }`。【文档】config reference；【源码】`config.rs` L552-596（含 serde alias：`window-size` 等下划线写法也可用）。DMG 由内嵌 `bundle_dmg.sh`（hdiutil + AppleScript）制作。【源码】`dmg/mod.rs`

---

## 7. 对本项目的落地清单（Developer ID + 公证 DMG，不上 App Store）

> 本项目现状【本地文件核对】：`src-tauri/tauri.conf.json` 尚无 `bundle.macOS` 段、`targets: "all"`、`version 0.1.0`、identifier `com.mdstickynotes.app`；未安装 updater 插件。

### 人类线下动作（必须）

1. 加入 Apple Developer Program（**$99/年**；免费账号无法公证）。
2. 以 Account Holder 在 Certificates, IDs & Profiles 创建 **Developer ID Application** 证书：钥匙串访问生成 CSR → 上传 → 下载 `.cer` 双击导入"登录"钥匙串；`security find-identity -v -p codesigning` 确认出现 `Developer ID Application: ...`。
3. （仅当启用 updater 时）`npx @tauri-apps/cli signer generate -w ~/.tauri/md-sticky-notes.key` 生成 minisign 密钥对，保存好私钥与密码。

### tauri.conf.json 最小改动

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],            // 避免拉入不需要的目标；"all" 也可
    "macOS": {
      "signingIdentity": "Developer ID Application: <你的名字> (TEAMID)"
      // hardenedRuntime 默认 true，无需写；Developer ID 路线无需 entitlements
      // "dmg": { "windowSize": { "width": 660, "height": 400 } }  // 可选
    }
    // 启用 updater 时加: "createUpdaterArtifacts": true
  }
  // 启用 updater 时加:
  // "plugins": { "updater": { "pubkey": "<公钥>", "endpoints": ["..."] } }
}
```

### 环境变量（本机构建最小集）

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: ... (TEAMID)"  # 或只写 conf，二选一
# 公证凭据二选一：
export APPLE_ID="<邮箱>"
export APPLE_PASSWORD="<app-specific password>"   # 非账号密码
export APPLE_TEAM_ID="<TEAMID>"
# 或（推荐 CI）：
export APPLE_API_ISSUER="<issuer id>"
export APPLE_API_KEY="<key id>"
export APPLE_API_KEY_PATH="/path/AuthKey_<keyid>.p8"   # 或放入 ~/private_keys 自动发现
# 启用 updater 时追加：
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/md-sticky-notes.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<密码或留空>"
```

CI 额外路线：`APPLE_CERTIFICATE`（`openssl base64 -A -in cert.p12` 的输出）+ `APPLE_CERTIFICATE_PASSWORD` 可代替本机钥匙串导入；updater 私钥同理注入。

### 构建与验证

```bash
npm run tauri build            # 自动: 编译 → 签 .app → 公证 + staple → 打 DMG 并签 DMG
# 首次调试公证可加 --bundles dmg --skip-stapling（跳过等待，事后手动 xcrun stapler staple）
spctl -a -vv -t open "src-tauri/target/release/bundle/macos/MD 便签.app"   # 应显示 accepted, source=Notarized Developer ID
xcrun stapler validate "src-tauri/target/release/bundle/dmg/MD 便签_0.1.0_aarch64.dmg"  # 校验 DMG（内含 staple）
codesign -dv --verbose=4 "src-tauri/target/release/bundle/macos/MD 便签.app"  # 查看 TeamID/flags
```

### 明确不适用 / 无冲突项

- App Sandbox entitlements 示例是 **App Store 路线专属**，Developer ID 路线不需要、也不应照抄（sandbox 化反而需大量适配）。
- 官方没有"Developer ID 路线必须的 entitlements 文件"，查证不到即确实不存在——不配置是官方默认行为，不是遗漏。
- `minimumSystemVersion` 默认 10.13，按需覆盖；与本路线无冲突。
- 唯一需要注意的官方限制：**免费账号不能公证**、**Developer ID 证书仅 Account Holder 可创建**、**生产模式 updater endpoint 强制 HTTPS**。

### 不确定/未证实事项（如实记录）

- Tauri 侧公证**无**超时/重试（已由源码 grep 证实为"无实现"），Apple 实际审核时长无官方 SLA。
- codesign 未显式传 `--timestamp`，依赖 codesign 对分发签名的默认时间戳行为（源码事实；对公证的实际影响未查到官方说明，实践上公证通过不受影响【推断】）。
- `entitlements` 在 tauri.conf.json schema 中是字符串路径；bundler 内部存在 `Entitlements::Plist`（内联 plist）变体，但 CLI 用户配置入口未见文档化【源码观察，勿依赖】。
