# 05: 发布门面与发布 runbook

**What to build:** 仓库成为外人能自解释的门面 + 发布者能照单执行的 runbook。README 重写为双语（中文为主 + English 摘要）：一句话定位主打「每张便签是你网盘里的一个 .md 文件」（市场调研建议话术，反面对照：Simplenote 停更、Windows 便签被绑进 OneNote）；功能亮点（五态任务 / 重复任务 / 逾期提醒是同类没有的）；截图或 GIF；下载表（arm64 DMG / x64 DMG / Windows NSIS，含 SmartScreen「仍要运行」指引）；反馈入口（Issues 报 bug、Discussions 交流）。发布 runbook（放 docs/）：打 tag → draft → 校验清单（签名/公证校验、资产清单齐全、latest.json 指向、双 DMG 开箱）→ 人工 publish → 公告渠道（按市场调研排序：HelloGitHub 提交 → V2EX 分享创造 → r/macapps → Show HN）→ updater 演练步骤；附 Release 说明模板（更新内容 / 下载资产对照 / SmartScreen 指引 / 反馈入口）。

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] README 双语，含定位话术、功能亮点、下载表与 SmartScreen 指引、反馈入口
- [ ] 下载表含 macOS「首次打开放行」指引（ad-hoc 模式期间：右键打开 / 系统设置 → 隐私与安全性 → 仍要打开，见 ADR-0002 修订段）
- [ ] runbook 覆盖 tag → publish → 公告 → updater 演练全流程，校验清单可逐项勾选（含当前签名模式的说明：ad-hoc 或 Developer ID，随 secrets 状态自动切换）
- [ ] Release 说明模板就绪
- [ ] 公告渠道清单含各渠道提交要点（标题 / 一句话介绍 / 链接）

**参考：** .scratch/release/research/market-analysis.md（话术与渠道排序依据）、.scratch/release/spec.md
