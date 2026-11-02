# 开发流程：从想法到发布

> 本流程由三套能力组成：**pstack**（Matt Pocock engineering skills：`triage` / `grill-me` / `to-spec` / `to-tickets` / `implement` / `tdd` / `code-review` / `wayfinder`）、**ui-ux-pro-max**（设计系统与 UI 准则）、既有**发布 runbook**。配置在 `docs/agents/`，入口 `AGENTS.md`。
> 流程的每一步都来自本仓库的真实经验——注释里的「教训」条目是实际踩过的坑。

## 总览

```
想法/Issue ──▶ ① triage ──▶ ② grill（模糊才上） ──▶ ③ 设计（UI 票才上）
                                                          │
                                                          ▼
发布 ◀── ⑥ runbook ◀── ⑤ 验证阶梯 + code-review ◀── ④ to-spec → to-tickets → implement(+tdd)
```

## ① 想法进入：`/triage`

任何工作项（用户 Issue、自己的想法、TODO.md 暂缓项）先进 triage 状态机，归入五个标签之一：

- `needs-triage` → `needs-info`（缺信息，问报告者）→ `ready-for-agent`（规格完整，可 AFK 执行）/ `ready-for-human`（需要人做）/ `wontfix`

纪律：**没有 `ready-for-agent` 标签的票不进实现**。triage 产出的 agent-ready brief 是 `/implement` 的直接输入。

## ② 需求拷问：`/grill-me` 或 `/grill-with-docs`

范围模糊的票上 grill：一次一个问题，把决策全部锁定后再动工。带领域术语争议的用 `/grill-with-docs`（联动 `CONTEXT.md` 词汇表）。

> 教训：0.1.0 发布规划两轮 grill 提前锁定了 updater/公证/双架构等全部决策，之后逐票执行零返工——grill 是本流程性价比最高的环节。特别大的雾区（如移动版）用 `/wayfinder` 走决策票，不要临时调研。

## ③ 设计：ui-ux-pro-max（仅 UI 票）

动 UI 的票，动手前：

1. 先读 `design-system/md-sticky-notes/MASTER.md`（视觉宪法；改它须用户显式授权）；
2. 组件级疑虑定点查询：`python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "<语义意图>" --domain ux|style|typography`；
3. 实现细节：`--stack react`。

> 教训：0.2.0 重设计按「生成 → 落库 MASTER.md → 按规范实施 → 浏览器截图冒烟」走通，样式回归（页签换行）就是冒烟截图抓的。非 UI 票跳过本步，不为用而用。

## ④ 规格与拆票：`/to-spec` → `/to-tickets` → `/implement`

- `/to-spec`：把讨论综合成 spec，发布到 GitHub Issues；
- `/to-tickets`：拆成**带 blocking 边的 tracer-bullet 票**（竖切片，每张可独立交付验证）；
- `/implement`：逐票实现，在预定接缝用 `/tdd`（本仓库接缝：`src/lib/` 纯函数层、Rust 命令的纯函数部分）。

纪律：**票间清上下文**（/clear 或 handoff），避免上一张票的细节污染下一张。

> 教训：发布票 01–12 的依赖边（01→02→(03∥04)→…）让执行从未迷路；「票 07 是人肉观察期票、禁止 implement」这类边界也要写进票里。

## ⑤ 验证阶梯 + `/code-review`

每张票合并前的固定阶梯，一层不过不进下一层：

| 层 | 命令/动作 | 说明 |
| --- | --- | --- |
| 1 静态 | `npx tsc -b && npm run lint` | |
| 2 单测 | `npm test`；动 Rust 则 `cd src-tauri && cargo test` | 新逻辑必须带测试 |
| 3 双轴评审 | `/code-review`（ Standards 轴 + Spec 轴） | Standards 依据 `docs/standards.md`；Spec 对照票面 |
| 4 视觉冒烟 | UI 改动：网页版 + 浏览器截图比对 MASTER.md 清单 | 演示数据只写浏览器 localStorage（key `md-sticky-notes:v1`），不碰同步文件夹 |
| 5 本地部署 | 桌面行为改动：`bash scripts/build-desktop.sh` + ditto 替换 /Applications | 退出重开验证 |

> 教训：围栏代码块索引错位、▾ 箭头 svg 点击无效、reload 回滚三个 bug 都不是测试抓住的，是事后人工发现的——双轴评审（第 3 层）就是为堵这个缺口设的；视觉冒烟（第 4 层）实际抓住过页签换行。

## ⑥ 发布：runbook 不变

tag → CI draft → 校验 7 资产 + latest.json → 填说明 → publish → 观察 updater 闭环。见 `docs/release-runbook.md`。

纪律：版本小步快跑（0.1.x 修补、0.2.x 换代）；draft 重打 tag 仅限「从未 publish 且无人装过」。

## 现有积压的入口

- TODO.md「暂缓的优化想法」：导入时逐条走 ① triage；
- Windows 票 08–12（`.scratch/release/issues/`）：继续受票 07 稳定门槛约束，解锁前不动。
