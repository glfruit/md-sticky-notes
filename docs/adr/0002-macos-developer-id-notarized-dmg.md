# macOS 走 Developer ID 公证 DMG，不上 App Store

macOS 的分发方式为 Developer ID 签名 + 公证（notarization）的 DMG 直链下载，不进 Mac App Store。App Store 强制 App Sandbox，与「直接读写用户所选云盘同步文件夹」的产品前提冲突；security-scoped bookmark 改造推迟到确有商店诉求时再做。已查证（2026-10-22，Tauri 2.12）：该路线无需任何额外 entitlements，hardened runtime 默认开启；固定成本为 Apple Developer Program 会员 $99/年（免费账号无法公证，Developer ID 证书仅 Account Holder 可创建）。
