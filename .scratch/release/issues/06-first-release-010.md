# 06: 首发 0.1.0 发布

**What to build:** 按 runbook 执行首次公开发布：确认 version 0.1.0 → 打 tag v0.1.0 → CI draft → 校验清单全绿 → publish → 按渠道清单开始公告（第一个渠道发出即开始稳定门槛「反馈渠道开放」的计时）→ updater 演练：打一个演练版本 tag，真机走通「发现新版 → 更新 → 重启」闭环，然后删除演练 release 与 tag。

**人类步骤（届时 /wizard 或人工执行）：** draft 的最终 publish 点击、渠道公告发布、真机 updater 演练。其余（tag、校验、资产核对、说明填充）由 agent 按清单执行。

**Blocked by:** 01, 02, 03, 04, 05

**Status:** ready-for-agent

- [ ] 公开的 0.1.0 release：arm64/x64 DMG + latest.json + .sig，说明用模板
- [ ] 校验清单全绿并留档（陌生机器开箱即用）
- [ ] updater 演练闭环通过，演练 tag / release 已删除
- [ ] 至少一个公告渠道发出；反馈渠道开放计时起点记录到票 07

**参考：** docs/release/ 下的 runbook（05 产出）、.scratch/release/spec.md
