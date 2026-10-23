# macOS 走 Developer ID 公证 DMG，不上 App Store

macOS 的分发方式为 DMG 直链下载，不进 Mac App Store（App Store 强制 App Sandbox，与「直接读写用户所选云盘同步文件夹」的产品前提冲突；security-scoped bookmark 改造推迟到确有商店诉求时再做）。

**2026-10-23 修订（投入时点推迟）**：Developer ID 签名 + 公证仍是目标终态，但 $99/年的付费会员投入推迟到「真实用户反馈证明签名能显著降低安装流失」或开发者本人决定投入时——与 Windows 侧「不签名起步」（ADR-0006）同一逻辑。过渡期分发方式：CI 产 ad-hoc 签名的 DMG（避免 Apple Silicon 判「已损坏」），用户首次打开需在「系统设置 → 隐私与安全性」手动放行一次，README 提供指引。发布管线已做成双模式：`APPLE_CERTIFICATE` 等 secrets 配置后自动升级为签名 + 公证，无需改 workflow（见 `.scratch/release/wizard-03-apple-signing.sh`）。已查证（2026-10-22，Tauri 2.12）：Developer ID 路线无需 entitlements，hardened runtime 默认开启；免费账号无法公证，Developer ID 证书仅 Account Holder 可创建。
