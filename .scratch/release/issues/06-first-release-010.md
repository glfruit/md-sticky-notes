# 06: 首发 0.1.0 发布

**What to build:** 按 runbook 执行首次公开发布：确认 version 0.1.0 → 打 tag v0.1.0 → CI draft → 校验清单全绿 → publish → 按渠道清单开始公告（第一个渠道发出即开始稳定门槛「反馈渠道开放」的计时）→ updater 演练：打一个演练版本 tag，真机走通「发现新版 → 更新 → 重启」闭环，然后删除演练 release 与 tag。

**人类步骤（届时 /wizard 或人工执行）：** draft 的最终 publish 点击、渠道公告发布、真机 updater 演练。其余（tag、校验、资产核对、说明填充）由 agent 按清单执行。

**Blocked by:** 01, 02, 03, 04, 05

**Status:** in-progress（2026-10-23：draft 已就绪并全部校验通过——7 资产齐全、latest.json 四平台条目、双 DMG 挂载验证 Signature=adhoc + identifier 正确、Release 说明已按模板填好。**待人类**：① 本机装 arm64 DMG 实际使用确认；② 点 Publish；③ 公告时机自定。之后执行 0.1.1 updater 演练（按 runbook §6，0.1.1 为正式 patch 版不删除；票文原「删除演练产物」作废）。draft：v0.1.0 / untagged-9388119b3a65c372dbf8）

- [ ] 公开的 0.1.0 release：arm64/x64 DMG + latest.json + .sig，说明用模板
- [ ] 校验清单全绿并留档（陌生机器开箱即用）
- [ ] updater 演练闭环通过，演练 tag / release 已删除
- [ ] 至少一个公告渠道发出；反馈渠道开放计时起点记录到票 07

**参考：** docs/release/ 下的 runbook（05 产出）、.scratch/release/spec.md
