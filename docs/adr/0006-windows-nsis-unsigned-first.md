# Windows 只出 NSIS 且首版不签名

Windows 分发只产 NSIS 安装包（默认 per-user 免管理员、单包多语言），不做 MSI（只能在 Windows 上构建、无 per-user 安装选项、每种语言一个安装包）；`bundle.targets` 显式列为 `dmg` / `nsis`，不用 `"all"`。首版不购买代码签名证书，接受 SmartScreen 首次运行警告；待有真实用户反馈再评估 Azure Artifact Signing（约 $9.99/月）或 Certum 开源证书（约 $29/年）。

## Consequences

- 已装用户形成后再换安装器技术或签名身份是有痛感的迁移（升级路径、卸载注册表），故此决策在 Windows 首发前定死。
- SmartScreen 警告需写进下载说明，降低用户流失。
