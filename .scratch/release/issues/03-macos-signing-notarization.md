# 03: macOS 签名 + 公证接入

**What to build:** tag 构建的 macOS 产物为 Developer ID 签名 + 公证 + staple（ADR-0002）。CI 构建后强制校验步（codesign -dv / spctl -a -vv / stapler validate），缺凭据或校验不过时 workflow 显式失败——研究已证实：无凭据时 Tauri 会**静默产出未签名产物且不报错**，必须防呆。下载的 draft DMG 在真机开箱直接运行、无 Gatekeeper 拦截。凭据走 App Store Connect API key 路线（APPLE_API_ISSUER / APPLE_API_KEY / APPLE_API_KEY_PATH），签名 + 公证的完整环境变量集按研究笔记「落地清单」配置。本路线无需任何 entitlements，hardened runtime 默认开启。

**人类步骤（实现到此票时用 /wizard 生成引导）：** ① Apple Developer Program 注册（$99/年；免费账号无法公证）；② 创建 Developer ID Application 证书（仅 Account Holder 可操作）并导出 .p12 备份；③ App Store Connect 创建 API key（.p8）；④ 签名 + 公证 secrets 填入 GitHub。

**Blocked by:** 02

**Status:** deferred（2026-10-23：$99 投入推迟到真实反馈支持时，见 ADR-0002 修订段。工程已全部备好、零浪费——release.yml 双模式已验证：v0.0.2 红灯实证防呆（无 secrets 快速失败+明确报错）、v0.0.4 绿灯实证 ad-hoc 模式（挂载 DMG 校验内部 app 签名，双 DMG 资产齐全）。付费当天：跑 wizard-03 → 推冒烟 tag → 验收下方四项）

**Blocked by:** 02 ~~；付费决策（人肉门槛）~~

**工程注记：** Tauri 打完 DMG 会清掉 .app 目录（bundler 的 Cleaning 步骤），CI 签名校验必须挂载 DMG 检查内部 app，不能查磁盘上的 .app（b1ddb2e 修复）。

- [ ] 本地（证书在钥匙串）构建的 .app：codesign 显示 Developer ID、spctl 通过、stapler validate 通过
- [ ] CI 构建的 DMG 真机开箱无拦截
- [ ] 故意移除签名 secret 时 workflow 红灯（校验步生效），不产出看似正常的未签名包
- [ ] secrets 不出现在构建日志

**参考：** docs/adr/0002、.scratch/release/research/tauri-macos-signing-notarization.md、.scratch/release/spec.md
