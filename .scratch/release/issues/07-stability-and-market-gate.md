# 07: 稳定门槛 + 市场验证观察期（人肉票，勿 /implement）

**What to build:** 这不是工程票，是 Mac 与 Windows 之间的 blocking 边。发布后观察 ≥4–6 周，两线信号都过才解锁票 08：

- **工程线（三条全过）**：① 本人日常真实使用公证版 ≥14 天；② 反馈渠道（Issues + Discussions）开放 ≥1 周；③ 零 P0（数据丢失 / 启动崩溃 / 双机同步互相覆盖）。P1 及以下修复照常。
- **市场线（参考阈值，依据 market-analysis.md）**：GitHub 星数 ≥150–300、实质反馈 ≥20 条、有人主动问 Windows 版。
- **结论分支**：双线过 → 08 解锁；工程过、市场不过 → Windows 留 roadmap（ADR-0003 不变），先迭代 Mac，另行拆票；出现 P0 → 修复优先，观察期重算。

**Blocked by:** 06

**Status:** human-checkpoint（禁止 /implement）

- [ ] 自用天数、反馈条数、P0/P1 清单记录在案
- [ ] 星数 / 实质反馈 / Windows 询问数记录（截图或数据）
- [ ] 明确书面结论：进入 08 或留 roadmap，含理由与日期

**参考：** .scratch/release/research/market-analysis.md、CONTEXT.md（稳定门槛词条）
