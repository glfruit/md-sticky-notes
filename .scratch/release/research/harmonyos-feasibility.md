# 鸿蒙（HarmonyOS）版本可行性与工作量调研

- 查证日期：**2026-10-23**。鸿蒙生态变化快，本文结论有时效性，建议引用时注明日期。
- 评估对象：「MD 便签」（Tauri 2 + React 19 + Vite + Tailwind，macOS 已发布，Windows 移植中）。产品前提：每张便签 = 用户云盘同步文件夹里的一个纯 .md 文件，多机同步靠云盘客户端（默认 Dropbox，可 iCloud/坚果云），应用无账号无自有云。
- 标注约定：【文档明确】= 一手资料直接证实；【推断】= 依据一手资料+合理推理；【查证不到】= 未找到可靠来源，如实存疑。
- 区分两条线：**HarmonyOS 4.x**（基于 AOSP，可运行 Android APK）与 **HarmonyOS NEXT / HarmonyOS 5**（纯血鸿蒙，移除 AOSP，不兼容 APK）。除特别说明外，本文「鸿蒙」指 HarmonyOS NEXT。

---

## 一、结论（先看这里）

### 1.1 一句话结论

**技术上可行（ArkTS 壳 + ArkWeb 加载现有 React 前端 + TS 版 WebDAV 适配器），但 Tauri 代码无法复用到鸿蒙，桌面版「云盘同步文件夹」的产品前提在鸿蒙手机上不成立（三方应用无权自由读用户目录），等于要为鸿蒙重写壳层并把存储模型换成 WebDAV 网络直连；单人开发者做到可用 MVP 约需 2.5–4 个月全职当量，且其中约六成投入（WebDAV 适配器 + 移动布局）恰好是未来 iOS/Android 移动版（ADR-0003）也要做的——所以正确姿势不是「鸿蒙单独立项」，而是「移动版统一规划、鸿蒙作为其中一个壳移植目标」。**

### 1.2 工作量区间（单人、全职当量、Route A：自建 ArkTS 壳，见 1.4）

| 模块 | 内容 | 估时 | 占比 | 与未来移动版可共享 |
|---|---|---|---|---|
| ArkTS 壳 | UIAbility + ArkWeb + JSBridge + 生命周期 + 签名打包 CI | 2–3 周 | ~15% | 否（鸿蒙特有；但 IPC 接口设计可对齐） |
| 移动布局重做 | 手机屏单手交互、便签列表/编辑器改版、深色模式 | 3–4 周 | ~25% | 是（React 层，~90% 共享） |
| WebDAV 存储适配器 | PROPFIND/GET/PUT、增量同步、冲突处理、坚果云限频适配、加密凭据存取 | 3–4 周 | ~30% | 是（平台无关 TS，~100% 共享） |
| 系统能力适配 | 通知授权、文件夹 picker + URI 持久化、前后台切换触发同步、桌面卡片替代托盘/热键 | 2–3 周 | ~15% | 小部分（概念可复用，代码不共享） |
| 上架与调试 | 账号实名、软著/承诺函、App 备案、签名、审核往返、ArkWeb CORS/file:// 等坑 | 2–3 周 | ~15% | 否（鸿蒙特有） |
| **合计** | | **12–17 周（约 3–4 个月）** | 100% | **移动版总投入的约 60–65% 可共享** |

- 前端业务逻辑（markdown 渲染、便签模型、冲突处理，DOMPurify/marked 等）本来就 100% 在 React 层，天然共享。
- Rust 侧核心（原子写、notify 监听、热键、托盘）**默认不复用**：为把 Rust 编到 OHOS 要引入 `aarch64-unknown-linux-ohos` 交叉编译 + napi-ohos/ohos-rs 桥接两条额外风险链，收益只是「文件 IO 用 Rust 写」——这部分逻辑太薄，ArkTS/TS 重写更便宜。Route A 下前端改用 TS 实现原子写（临时文件 + rename）与轮询/事件式刷新。
- Route B（等/接 Tauri 社区 OHOS 移植）壳成本可降至 1–2 周，但当前成熟度是「原型/工程专项」，见 2.1，不建议押注。

### 1.3 三个最有分量的发现

1. **Tauri 官方不支持鸿蒙、无时间表**：维护者明确说「需要一位生态内维护者加入 working group 才会做」，issue 至今 open（help wanted）。社区已有 Eclipse Oniro 工程专项（2026-04 宣布 `cargo tauri ohos dev`）和 richerfu 的原型 demo（49 star），但均未上游化、无生产案例。（见 2.1）
2. **产品前提在鸿蒙手机上不成立**：`ohos.permission.FILE_ACCESS` 等访问用户目录的权限属**受限开放权限（ACL）**，官方写明可申请场景是「应用为 IDE 或其他开发调测工具，需要读写 PC/2in1 设备上的用户目录」——便签类应用拿不到。三方应用访问用户文件的标准姿势是 **DocumentViewPicker + URI 持久化授权**，且无法像桌面那样被动享受「云盘客户端把文件同步到文件夹」——云盘客户端写文件，你的 app 感知不到路径级事件。**结论：鸿蒙版必须走 WebDAV 网络直连（恰是 ADR-0003 的移动版路线）**。（见 3.4、4.1）
3. **Rust/工具链不阻塞，成本在壳与合规**：Rust 官方 Tier 2（with host tools）支持 `aarch64-unknown-linux-ohos`；DevEco Studio 原生支持 macOS（含 Apple Silicon）；坚果云已有鸿蒙原生版且 WebDAV 应用密码机制健全（限频：免费 600 次/30 分钟）。真正的成本是 ArkTS 壳重写 + 上架合规（实名、软著或承诺函、App 备案、签名 Profile、1–3 个工作日/轮的审核）。（见 2.3、3、4.1、5.1）

### 1.4 若做，两条技术路线

- **Route A（推荐，若做）**：ArkTS 壳（UIAbility）+ ArkWeb 加载现有 React SPA + `registerJavaScriptProxy`/`runJavaScript` 双向桥 + 纯 TS WebDAV 适配器。完全自主可控，不依赖任何移植项目。
- **Route B（观望）**：跟进 Eclipse Oniro 的 Tauri-on-OpenHarmony CLI 扩展或 richerfu/tauri-demo，等其上游化并有生产案例。2026-10 时点不成熟。

---

## 二、Tauri / Rust / ArkWeb 生态查证

### 2.1 Tauri 官方对 HarmonyOS / OpenHarmony 的支持现状

【文档明确】

- **官方不支持，且没有路线图表态**。Tauri 2.0（2024-10 stable）官方支持桌面三平台 + Android/iOS；HarmonyOS 不在其中。官方路线图文档只覆盖 iOS/Android：https://v2.tauri.app/blog/roadmap-to-tauri-2-0
- **主跟踪 issue #7287**（`[feat] Add support for Huawei WebView / HarmonyOS`，2023-06 开，至今 open，标签 `help wanted`）：维护者 FabianLars 表态——Tauri 不会在没有「生态内维护者加入 working group」的情况下增加 OHOS 支持，并称 2025 底/2026 初解决「非常不现实」，拒绝给时间线。2025-11 社区开发者 richerfu（曾移植 winit/wry/tao/dioxus 到 OHOS）表示加入 working group，2026-01 放出原型 https://github.com/richerfu/tauri-demo 。2026 年内多次「any updates」追问，无官方承诺。
  - 来源：https://github.com/tauri-apps/tauri/issues/7287
  - 相关 issue：#11112（HarmonyOS NEXT 适配讨论，2024-09）、#14397（2025-10 请求支持，当天被关闭为 #7287 的重复）：https://github.com/tauri-apps/tauri/issues/11112 、https://github.com/tauri-apps/tauri/issues/14397
- **社区移植现状（原型级，非生产级）**：
  - Eclipse Oniro 工程专项（2026-04-30 官方通讯）：把 Ionic/Capacitor 和 Tauri 移植到 OpenHarmony，「数周完成」，Tauri 侧用 Node-API 绑定 + 「Window Adoption」模式解决「Rust 拥有事件循环 vs OHOS 由 ArkTS UIAbility 拥有进程」的控制反转，提供 `cargo tauri ohos dev` CLI 扩展；文章以 Capacitor 版 Lichess（React）作生产性验证，**Tauri 侧未给出同等验证、未给仓库链接、未提 Tauri 版本号**。来源：https://newsroom.eclipse.org/eclipse-newsletter/2026/april/bridging-ecosystem-divide-bringing-ionic-and-tauri-openharmony ；Oniro 2026 年中总结确认 Q1 2026 完成：https://blogs.eclipse.org/post/ignacio-ahedo/frameworks-hardware-and-community-oniro%E2%80%99s-2026-mid-year-update
  - GitHub 实测检索（2026-10-23）：`richerfu/tauri-demo`（"A tauri prototype for OpenHarmony/HarmonyNext"，49 star，最后 push 2026-08）；`LeenHawk/tauri-harmony`（"Reproducible Tauri OpenHarmony / HarmonyOS NEXT build toolchain"，0 star，2026-10 仍在日更 GHCR 镜像）。均无 star 量级与生产案例支撑。
- **结论**：【文档明确】官方零支持无时间表；【推断】12 个月内出现「可直接用于生产的官方 Tauri OHOS 目标」概率低；社区路线若成熟，可作为壳层替换选项持续观望。

### 2.2 ArkWeb + ArkTS 壳加载 React SPA 的可行性

【文档明确】这是华为官方支持的主流混合开发形态。

- ArkWeb 是 HarmonyOS 官方 Web 组件（Web 组件 + WebviewController）。加载本地 SPA 与远程页面均有官方指南；React/Vite 产物可直接跑。
- **JSBridge 标准方式**（官方 API 参考：https://developer.huawei.com/consumer/cn/doc/harmonyos-references/ts-basic-components-web ）：
  - 前端 → 原生：`javaScriptProxy()`（Web 组件初始化时注册，单对象）或 `WebviewController.registerJavaScriptProxy()`（初始化后注册，多对象，需 `refresh()` 生效）；
  - 原生 → 前端：`runJavaScript()` 在页面内执行 JS。
  - 官方指南《前端页面调用应用侧函数》即以此为主题；Eclipse Oniro 的 Capacitor 移植也正是用 `javaScriptProxy`（JS→原生）+ `runJavaScript`（原生→JS）实现的，证明该桥足够承载一个完整框架的 IPC。【文档明确】
- **已知坑**【文档明确】：ArkWeb 对 `file://` 有严格 CORS 限制——Oniro 用「请求拦截器伪造 `http://localhost` origin 的虚拟服务器」绕过。MD 便签的 Vite 产物建议直接以 `resource://` 或本地 http 回环方式加载，开发期就要把这个坑排进壳层工时。
- **DevEco Studio 对 macOS 的支持**【文档明确】：官方支持 macOS（X86 与 ARM/Apple Silicon 双版本），macOS 10.15+（建议 11+），内存建议 16GB，磁盘建议 ~100GB（安装包约 3.3GB，含 SDK/模拟器更大）；不支持 Linux。下载：https://cn.devecostudio.huawei.com 。**结论：mac 开发机不构成阻塞**。真机调试需要一台华为鸿蒙 NEXT 设备（模拟器功能有限，且 Rust 官方文档提到 OHOS 模拟器无网络——做 WebDAV 调试必须真机）。【推断】

### 2.3 Rust 对 OpenHarmony 的支持

【文档明确】

- **官方 target 与 tier**：`aarch64-unknown-linux-ohos`、`armv7-unknown-linux-ohos`、`x86_64-unknown-linux-ohos` 为 **Tier 2（with host tools）**，Rust 1.78 起 rustup 提供预编译 std（`rustup target add aarch64-unknown-linux-ohos` 即可用）；`loongarch64-unknown-linux-ohos` 为 Tier 3。官方平台页：https://doc.rust-lang.org/rustc/platform-support/openharmony.html
- **限制**【文档明确】：OHOS SDK 不直接支持 Rust 编译，需自建 clang wrapper 脚本指定 `--sysroot` 与 `-D__MUSL__` 并配置 cargo linker；**openssl 需要 ohos-openssl 替代**（https://github.com/ohos-rs/ohos-openssl ）；模拟器无网络导致测试困难；miri 不支持。
- **Rust ↔ ArkTS 桥接生态**【文档明确】：
  - napi-rs 上游无官方 OHOS target；社区分支 **ohos-rs**（fork 自 napi-rs，API 基本对齐）：https://github.com/ohos-rs/ohos-rs 、crates.io `napi-ohos`：https://crates.io/crates/napi-ohos 、文档 https://ohos.rs ；
  - uniffi 上游不支持 ArkTS，ohos-rs 组织提供「为 UniFFI Rust 库生成 ArkTS 绑定」的项目；OpenHarmony 三方库组织有 https://gitee.com/openharmony-tpc/ohos_napi_rs ；
  - 生态案例：Servo 2024 报告将 OHOS 列为移动目标（https://servo.org/files/2024-05-06-openharmony-os-for-next-gen-mobile.pdf ）；ast-grep 等项目有加 OHOS prebuild 的 feature request（https://github.com/ast-grep/ast-grep/issues/2907 ）。
- **结论**：Rust 编到 OHOS 是「可行但要多扛一条工具链」——对 MD 便签而言，桌面 Rust 侧的能力（notify、托盘、热键）在鸿蒙上根本没有对应物，唯一可迁移的文件原子写逻辑用 TS 重写更便宜。【推断】Route A 不引入 Rust。

---

## 三、系统能力映射（HarmonyOS NEXT）

桌面版能力 → 鸿蒙 NEXT 对照：

| 桌面版能力 | 鸿蒙 NEXT 对应物 | 可用性 | 来源/标注 |
|---|---|---|---|
| notify 文件夹监听 | `fs.createWatcher`（`@ohos.file.fs`，IN_MODIFY/IN_CREATE 等事件） | **仅对应用沙箱内/有权限的路径可用**；沙箱外路径受 3.4 的权限模型约束 | 官方 API：https://developer.huawei.com/consumer/en/doc/harmonyos-references/js-apis-file-fs 【文档明确】 |
| 原子写文件 | 无系统 API，应用层自己实现（写临时文件 + rename） | 可用（沙箱内） | 【推断】 |
| 系统托盘常驻入口 | 手机端**无托盘概念**；替代：桌面卡片（ArkTS Widget/服务卡片）、桌面长按快捷方式（shortcuts_config）、长时任务常驻通知 | 可用但形态不同，产品需重新设计入口 | 【文档明确/推断】替代方案为官方 Kit 能力，具体设计自由度有限 |
| 全局热键 | **三方应用不可注册全局热键**；相关能力（inputConsumer/shortKey）面向系统应用或受限场景；官方建议用 Shortcuts + 卡片替代 | **不可用**（手机形态）；2in1/PC 形态有全局快捷键 API 但三方受限、热键冲突需处理 | 【文档明确】系统快捷键被系统保留；三方受限的实践佐证：https://blog.csdn.net/TrisighT0/article/details/161237377 （Electron 在鸿蒙 PC 注册全局快捷键的坑，2026） |
| 系统通知 | Notification Kit：`requestEnableNotification()` 弹窗授权**仅弹一次**，拒绝后错误码 1600004，需引导去设置开启；调用需在 UI 加载完成后 | 可用，授权模型比 macOS 更刚性 | 官方指南：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/push-send-alert ；实践：https://www.infoq.cn/zones/harmonyos/article/00eb643a9454180f4e53962d1 【文档明确】 |
| 后台常驻（监听 + 同步） | 短时任务（退后台数分钟宽限）+ 长时任务（`backgroundTaskManager.startContinuousTask`，须声明任务类型与权限，系统做**一致性校验**，类型与实际行为不符会被取消并挂起进程）； HarmonyOS NEXT 引入 `ContinuousTaskExtensionAbility` 承载 | **没有「永久保活」**；便签的「后台自动同步」应改为：前台同步 + 退后台短时任务收尾 + 关键节点（启动/切前台）触发同步。长时任务的合法类型（音频/导航/定位等）不含「文件同步」，硬套有一致性校验被杀风险 | 官方指南：https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/continuous-task 【文档明确】；【推断】同步类任务不在长时任务白名单场景 |

### 3.4 文件访问与 picker 化限制（本节是产品前提的关键）

【文档明确】

- **应用默认只能访问自身沙箱**（`/data/app/el2/100/base/<bundle>/...`），沙箱内读写免权限。
- **自由读写用户目录/公共目录对三方应用不开放**：华为官方《受限权限说明》将访问用户目录的权限列为**受限开放权限（需 ACL）**，原文给出的可申请场景是「应用为 IDE 或其他开发调测工具，需要读写 PC/2in1 设备上的用户目录」。便签应用不属于该场景，**应视为拿不到**。
  - 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/restricted-permissions （2026-10 更新版页面）
- **标准姿势是 Picker**：`DocumentViewPicker` 让用户选文件/文件夹，免权限、返回 URI；**URI 默认只有临时权限**，需通过持久化授权（`isPersistent` / `uriPermissionManager` 激活）才能在应用重启后继续访问，持久化权限保留至卸载或用户撤销。官方文档与多方实践一致。
  - 来源：官方 File Kit 指南（picker/授权持久化章节，入口 https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/user-file-overview ）；实践佐证：https://blog.csdn.net/maniuT/article/details/140687702 、https://zhuanlan.zhihu.com/p/2261046278
- **对「云盘同步文件夹」模型的含义**【推断】：即便用户通过 picker 把「坚果云同步文件夹」持久授权给本应用，本应用也**无法依赖「坚果云鸿蒙客户端在后台把文件同步进该文件夹」的联动**——两个 app 之间没有文件夹级实时同步契约，本应用对文件夹变更的感知只能靠自己的轮询/自己拉 WebDAV。**所以鸿蒙版的正确存储模型是：WebDAV 直连云为 source of truth + 应用沙箱为工作副本 + 进前台/定时全量比对**。这恰好就是 ADR-0003 的移动版 WebDAV 路线，架构上是收敛而非分叉。

---

## 四、云盘接入

### 4.1 坚果云（Nutstore）

- **鸿蒙原生客户端已上架**：坚果云官方知乎账号 2024-10 宣布适配 HarmonyOS NEXT 并上架华为应用市场（https://zhuanlan.zhihu.com/p/879357901 ，发布者为坚果云官方账号；华为应用市场可检索「坚果云」复核）。【文档明确（厂商一手公告）；功能完整度未逐项核验】
- **WebDAV 官方支持**【文档明确】：官方帮助中心 https://help.jianguoyun.com/?p=2064 ——网页端「账户信息 → 安全选项 → 第三方应用管理」生成**应用密码**（可长期使用、可分应用生成）；服务器地址 + 账号 + 应用密码即可接入。限制：上传单文件默认 500M；**访问频率免费用户 600 次请求/30 分钟、付费 1500 次/30 分钟**；单次目录列举最多 750 条、支持分页。
  - **对同步设计的直接影响**【推断】：便签高频小文件写入很容易撞限频，同步循环必须做批量比对（一次 PROPFIND depth 列举代替逐文件 HEAD）+ 退避重试 + 本地队列，这要排进 WebDAV 适配器工时（1.2 表中已含）。
- 官方帮助中心另有 FolderSync 等第三方 App 走 WebDAV 的教程，说明「第三方应用 + 坚果云 WebDAV」是其公开支持的用法。【文档明确】

### 4.2 Dropbox

【查证不到（负面结论）】未找到 Dropbox 上架 HarmonyOS NEXT 应用市场的任何公开信息；Dropbox 官方支持平台仅为 Windows/macOS/Linux/Android/iOS（官网系统要求页未提鸿蒙）。用户在鸿蒙上只能网页版。【推断】**鸿蒙版不可能默认 Dropbox 同步文件夹模型**，默认云必须是坚果云（或任意用户自填的 WebDAV 服务）。

### 4.3 网络权限模型

【文档明确】HarmonyOS NEXT 应用访问网络需声明 `ohos.permission.INTERNET`（normal 级权限，声明即可用，无需用户动态授权）；WebDAV 走 HTTPS 无额外限制。来源：HarmonyOS 权限列表（https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/permissions-for-all ）。【推断】注意华为审核对权限最小化有要求，凭据存储用系统安全能力（如 Asset Store Kit）而非明文 preferences，可降低审核风险。

---

## 五、分发与成本

### 5.1 账号、资质、签名、审核

| 项 | 现状（2026） | 标注/来源 |
|---|---|---|
| 开发者账号 | 注册 + 个人实名**免费**；无苹果式年费；AGC 分发服务官方确认免费 | 【文档明确】官方论坛回复：https://forums.developer.huawei.com/forumPortal/en/topic/0203488309220750050 、https://forums.developer.huawei.com/forumPortal/en/topic/0201188597263930012 |
| 软著/电子版权 | 官方《应用资质审核要求》：APP 软著证书为**非必选资质**，但建议提供；实践上个人开发者通常提供电子版权证书/软著/**《个人开发者承诺函》**三选一。电子版权代办市场价约 300 元（免费通道约 15 个工作日） | 【文档明确】https://developer.huawei.com/consumer/cn/doc/80301 ；承诺函实践：https://juejin.cn/post/7455252585861431332 |
| ICP/APP 备案 | 提供互联网信息服务的 APP 需完成 **APP 备案**（个人主体也可办，需身份证等；走云服务商备案流程）。MD 便签无自有服务器，但应用联网且面向大陆用户分发，**备案大概率仍是硬要求**，是日历时间上最不可控的一环（数天至数周） | 【文档明确（政策）/推断（适用性）】https://developer.huawei.com/consumer/cn/doc/app/50111-03 ；https://support.huaweicloud.com/prepare-icp/icp_02_0049.html |
| 签名体系 | DevEco Studio `Build > Generate Key and CSR` 生成 .p12/.csr → AGC 申请**发布证书（.cer，注意发布证书全局仅 1 张）** + **Profile（.p7b）** → 手动签名打包 .app 上传 AGC。调试/发布两套证书 + Profile | 【文档明确】https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/harmonyos-config-app-signing-0000001252142197 |
| 审核周期 | 官方 FAQ：正式版**一般 1–3 个工作日**（多数 24h 内），复杂应用可延长；提交前可用 AGC「上架自检」 | 【文档明确】https://developer.huawei.com/consumer/cn/doc/app/50106 |
| WebView/壳应用审核口径 | 《华为应用市场审核指南》要求应用有真实功能与体验价值；多方实践称「纯 H5 网页简单打包」会被拒。MD 便签属「原生壳 + 大量原生能力（文件、通知、后台任务）+ Web 渲染层」的混合应用，是鸿蒙生态常见形态，风险可控，但建议在审核备注中列明原生功能清单 | 【推断（政策方向明确，未逐字核验到具体条款）】https://developer.huawei.com/consumer/cn/doc/50104 ；实践：https://juejin.cn/post/7584987267267198986 |

### 5.2 HarmonyOS 4.x 曲线：能不能用 Tauri Android APK 覆盖一部分鸿蒙用户？

- **兼容性边界**【文档明确】：HarmonyOS 1.0–4.x 基于 AOSP、可运行 Android APK；HarmonyOS NEXT/5 移除 AOSP、完全不兼容 APK。华为官网 2026-09-14 宣布 HarmonyOS 1.0 停止技术支持；新机出厂以 NEXT 为主，4.x 存量仍在但属收缩中的存量。【推断】4.x 用户可被 APK 覆盖，NEXT 用户不能。
- **Tauri Android 覆盖 4.x 的代价**【文档明确/推断】：
  1. Tauri 2 官方支持 Android（2024-10 stable），但移动端成熟度公认落后桌面（社区反馈：https://github.com/orgs/tauri-apps/discussions/10197 ；生产部署仍见网络/构建类 issue）；
  2. 华为 4.x 设备的 Android WebView 是华为自研 fork——这正是 Tauri issue #7287 最初标题「Huawei WebView」的由来，历史上存在兼容性问题，需真机回归；
  3. APK 在华为 4.x 上的分发渠道是华为应用市场（安卓区）/第三方应用商店，**不含** NEXT 用户；
  4. 与 ADR-0003 的「移动版用 WebDAV 适配器」一致，Android 版可直接复用鸿蒙版规划中的 WebDAV 适配器。
- **结论**【推断】：「Tauri Android APK → 覆盖 HarmonyOS 4.x 存量」是移动版路线的**免费副产品**而非独立工作项；对 NEXT 用户无效。若未来华为 4.x 存量跌到可忽略（趋势如此），此项价值随之归零。

---

## 六、不确定性清单（查证不到 / 待真机验证）

1. 【查证不到】Eclipse Oniro Tauri 移植的**公开代码仓库**——官方通讯未给链接，GitHub 检索只见原型 demo；其 `cargo tauri ohos dev` 是否可复现、支持哪个 Tauri 版本，无法核实。
2. 【查证不到】坚果云鸿蒙版客户端是否**开放**「把同步文件夹暴露给其他 app 读取」的能力（应有沙箱限制，推断为不开放，未获官方文档）。
3. 【查证不到】`fs.createWatcher` 对「picker 持久化授权的外部文件夹 URI」是否可用（官方文档只明确沙箱路径场景）；若不可用，则外部目录变更只能靠轮询——进一步支持 WebDAV 直连模型。【推断】
4. 【查证不到】《审核指南》中「纯 H5 套壳拒审」的**具体条款编号与原文**（方向多方一致，条款未逐字核验）。
5. 【待验证】ArkWeb 上 Vite/React 19 + Tailwind 的实际兼容性（现代 WebView 内核大概率无碍，但 file:// CORS、localStorage 持久化、输入法与选区行为需真机回归）。【推断】风险低但不为零。
6. 【查证不到】HarmonyOS 4.x 与 NEXT 各自的精确市场份额（2026 年公开数据口径混乱，只确认趋势：新机全 NEXT、4.x 为存量、1.0 已 EOS）。

---

## 七、对 MD 便签的落地建议

### 7.1 值不值得现在投入？

**不值得单独立项，值得「顺路埋线」。** 三个理由：

1. **桌面双平台（mac 已发 + Windows 移植中）仍是当前唯一确定性收入/用户面**；鸿蒙 NEXT 用户面是华为国内新机存量，与 MD 便签「多设备知识工作者」目标人群有交集但需要重新获客。
2. **鸿蒙版的最大工作量（WebDAV 适配器 + 移动布局）正是 ADR-0003 移动版的必要件**——现在做的任何一步都不浪费，反之先做 Android/iOS 移动版，鸿蒙壳只是最后一层 2–3 周的移植。
3. **Tauri 鸿蒙生态不成熟且不受我们控制**，Route B 押注社区移植的风险收益比差；Route A 自建壳的 2–3 周成本只在决定上线鸿蒙时才需要付。

### 7.2 若做，按什么顺序（建议与 ADR-0003 合并后的路线）

1. **第 0 步（现在，随移动版规划做）**：把 StorageAdapter 的接口按「远端为 source of truth + 本地工作副本 + 全量比对同步」重新审视，确保 WebDAV 适配器写成**平台无关 TS**（不依赖 Tauri API、不依赖 Node API），凭据存取抽象成平台注入接口。这是唯一需要「现在」做的决定，成本≈0。
2. **第 1 步（移动版启动时）**：按 ADR-0003 做 WebDAV 适配器 + 移动布局，**以 Tauri Android 为第一个落地壳**（覆盖 Android + HarmonyOS 4.x 存量），iOS 第二。坚果云限频（600/1500 次 30 分钟）在适配器层做批量列举 + 退避。
3. **第 2 步（可选，鸿蒙 NEXT 壳移植）**：新开 ArkTS 壳工程（UIAbility + ArkWeb + JSBridge 对齐 Tauri 的 invoke 事件协议），复用同一套 React 前端与 WebDAV 适配器；系统能力按第三节映射表落（通知授权、picker 持久化、卡片入口、前台同步为主）。
4. **第 3 步（上架）**：华为账号实名 → APP 备案（最早启动，日历时间最长）→ 电子版权/承诺函 → 签名 → AGC 提审（1–3 工作日/轮，预留 2–3 轮）。
5. **持续观望项**：Tauri 上游 OHOS 支持（watch issue #7287）与 Oniro 移植的代码开放；若上游化且有生产案例，第 2 步的壳成本可大幅压缩，届时再评估切换。

### 7.3 决策口径建议

- **触发条件**（满足任一再启动第 2 步）：① 桌面双平台稳定且有鸿蒙用户的明确请求量；② ADR-0003 移动版（Android/iOS）已发布且 WebDAV 适配器经过实战；③ Tauri/Oniro 鸿蒙支持上游化。
- **明确不做**：把鸿蒙作为独立立项、为鸿蒙提前引入 Rust-on-OHOS 工具链、默认 Dropbox 鸿蒙同步。

---

## 附：本文引用来源汇总（均为 2026-10-23 查证）

**Tauri 官方/社区**
- Tauri 2.0 发布（含 Android/iOS 支持）：https://v2.tauri.app/blog/tauri-20
- Tauri 路线图（无鸿蒙）：https://v2.tauri.app/blog/roadmap-to-tauri-2-0
- Issue #7287（主跟踪，维护者表态）：https://github.com/tauri-apps/tauri/issues/7287
- Issue #11112 / #14397：https://github.com/tauri-apps/tauri/issues/11112 、https://github.com/tauri-apps/tauri/issues/14397
- 移动端成熟度社区反馈：https://github.com/orgs/tauri-apps/discussions/10197
- Eclipse Oniro 移植公告（2026-04）：https://newsroom.eclipse.org/eclipse-newsletter/2026/april/bridging-ecosystem-divide-bringing-ionic-and-tauri-openharmony
- Oniro 2026 年中更新：https://blogs.eclipse.org/post/ignacio-ahedo/frameworks-hardware-and-community-oniro%E2%80%99s-2026-mid-year-update
- 社区原型：https://github.com/richerfu/tauri-demo 、https://github.com/LeenHawk/tauri-harmony

**Rust / OpenHarmony**
- Rust 官方平台支持页（tier、配置、限制）：https://doc.rust-lang.org/rustc/platform-support/openharmony.html
- ohos-rs：https://github.com/ohos-rs/ohos-rs 、https://crates.io/crates/napi-ohos 、https://ohos.rs
- ohos-openssl：https://github.com/ohos-rs/ohos-openssl
- OpenHarmony TPC napi：https://gitee.com/openharmony-tpc/ohos_napi_rs
- Servo OHOS 报告：https://servo.org/files/2024-05-06-openharmony-os-for-next-gen-mobile.pdf

**华为官方（developer.huawei.com）**
- ArkWeb API（javaScriptProxy/registerJavaScriptProxy/runJavaScript）：https://developer.huawei.com/consumer/cn/doc/harmonyos-references/ts-basic-components-web
- 受限权限说明（用户目录访问仅 IDE 类场景）：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/restricted-permissions
- 用户文件访问/picker：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/user-file-overview
- fs 模块（含 createWatcher）：https://developer.huawei.com/consumer/en/doc/harmonyos-references/js-apis-file-fs
- 长时任务：https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/continuous-task
- 通知（push-send-alert）：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/push-send-alert
- 全部权限列表：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/permissions-for-all
- 应用签名配置：https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/harmonyos-config-app-signing-0000001252142197
- 审核指南：https://developer.huawei.com/consumer/cn/doc/50104 ；审核 FAQ（周期）：https://developer.huawei.com/consumer/cn/doc/app/50106 ；资质审核要求：https://developer.huawei.com/consumer/cn/doc/80301 ；备案法规依据：https://developer.huawei.com/consumer/cn/doc/app/50111-03
- 账号/分发免费官方回复：https://forums.developer.huawei.com/forumPortal/en/topic/0203488309220750050 、https://forums.developer.huawei.com/forumPortal/en/topic/0201188597263930012
- DevEco Studio 下载（macOS 支持）：https://cn.devecostudio.huawei.com

**云盘**
- 坚果云 WebDAV 官方帮助（应用密码/限频/750 条分页）：https://help.jianguoyun.com/?p=2064
- 坚果云鸿蒙版上架公告（官方知乎号，2024-10）：https://zhuanlan.zhihu.com/p/879357901
- 坚果云帮助中心：https://help.jianguoyun.com/

**其他实践佐证（非一手，仅作旁证）**
- Picker URI 持久化：https://blog.csdn.net/maniuT/article/details/140687702 、https://zhuanlan.zhihu.com/p/2261046278
- 鸿蒙 PC 全局快捷键限制实践：https://blog.csdn.net/TrisighT0/article/details/161237377
- 通知授权错误码 1600004：https://www.infoq.cn/zones/harmonyos/article/00eb643a9454180f4e53962d1
- 个人上架流程/承诺函：https://juejin.cn/post/7455252585861431332
- 上架避坑：https://juejin.cn/post/7584987267267198986
