# 12: Windows 真机验收 + 0.2.0 发布

**What to build:** 在 Windows 真机过验收清单并留档：安装（含 SmartScreen 首次警告与 README 指引有效性）、卸载干净、托盘驻留 / 退出、快捷键、任务到点通知、截图粘贴 / 表格转换抽查、双机（Mac + Win）同文件夹互通、双开防护。随后按 runbook 发布 0.2.0（version bump → tag → draft → 校验清单 → 人工 publish）；确认 latest.json 同时覆盖 macOS 与 Windows 更新载体，Mac 存量 0.1.0 用户应能收到 0.2.0 更新。发布后向曾询问 Windows 版的人回访公告。1.0 的准入（双平台各过稳定门槛）另立 spec，本票不含。

**人类步骤（届时 /wizard 或人工执行）：** 真机验收执行、publish 点击、回访公告。

**Blocked by:** 09, 10, 11

**Status:** ready-for-agent

- [ ] 验收清单逐项通过并留档（含 SmartScreen 截图）
- [ ] 0.2.0 公开发布；Mac 存量用户 updater 能收到 0.2.0
- [ ] latest.json 覆盖双平台更新载体
- [ ] 卸载干净；回访公告发出

**参考：** runbook（05 产出）、.scratch/release/spec.md
