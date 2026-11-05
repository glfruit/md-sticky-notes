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

## Git 纪律：票分支 → PR → squash（#13，2026-11-05 起）

`main` 受 ruleset 保护（只进 PR、必过 CI、禁直推/force push/删分支）。每张票的 git 生命周期横跨 ④⑤ 两步：

1. **开分支**：④ implement 开始时从最新 `main` 拉 `<type>/<issue>-<slug>`（`fix/12-dup-task`、`refactor/14-menu-owner`）；一票一分支，寿命以「一张票」为限，不跨票攒活。
2. **高频小 commit**：agent 每完成一个可验证的小步就 commit（WIP 也 commit——commit 是 agent 的 checkpoint，出错 revert 一步即回）；只 add 显式路径，**禁止 `git add -A` / `git add .`**（防扫进无关改动）。评审发现的修正 squash 进对应 commit，不追加「修正」commit。
3. **⑤ 验证阶梯在分支上走**：本地静态+单测 → `git push -u origin HEAD && gh pr create`（push 票分支免确认，#19）→ CI 在 PR 上跑同一套命令 → 双轴评审**对照 PR diff 做**（AI 写的代码没有人类读过，PR diff 是唯一强制的人类阅读点）→ 视觉冒烟/本地部署在分支本地照旧。
4. **squash merge**（用户确认后）：一票一提交、线性历史，详尽中文 message 风格不变；merge 后自动删分支。tag 推送不受 ruleset 影响，⑥ runbook 流程不变，「main 干净已推送 CI 绿」的前置检查从此自动成立。
5. **回滚**：出问题 `git revert <squash hash>` 整票撤销，bisect 粒度 = 票。

> 教训：#8–#11 共 8 个提交攒在本地 `main` 未推，CI（push: main）从未覆盖过它们——验证门没有机制兜底就只是自律。ruleset 生效后 main 只进 PR，CI 门自动成立（已实证直推被拒）。
> 依据（2026-11 三路调研）：五家 AI 编码工具厂商全部默认 agent 不直接落 main；DORA 2025 证明 AI 默认推大批次、稀释审查、伤稳定性，处方是小批次+快速反馈；社区共识是「机制化门禁（ruleset/CI）而非提示词」——agent 每个新 session 不记得约定，prompt 挡不住幻觉破坏性命令。
> Solo 场景 PR 不是审批门（ruleset 不开 required approvals，自批自合被 GitHub 禁止），它是「强制读 diff + CI 门 + 整票回滚单元」三合一。

### 并行：worktree，一票一现场（#15，#17 起 agent 自动开）

实现类指令（「实现 xxx」「修 #N」「继续推进候选 xxx」）由 agent 自动走启动序列：**立票（缺则补 `ready-for-agent`）→ `bash scripts/wt.sh new <分支>` 开现场 → `cd` 进去干活 → 三连绿后直接 push 分支 + 开 PR（免确认，#19）→ squash 合并（须用户确认）后回主仓 `wt.sh rm` 清现场**。主仓常驻 `main` 只作收尾/合并用；多张票并行 = 多个现场（典型：功能票 × improve-codebase-architecture 重构票），会话各自在现场目录里起，互不踩工作区。

- **并行边界**：两张票触碰同一模块不并行（triage/grill 时用 blocked_by 边声明）；动 Rust 的票避免并行（cargo `target/` 4.7G/份，确需并行 `export CARGO_TARGET_DIR` 共享主仓 target，cargo 目录锁自动排队）。
- **合并纪律**：一次只 squash 合一个 PR；合后其余现场 `git rebase main` + 重跑三连再走 PR；冲突大就 `wt.sh rm` 弃现场重开（已完成的小 commit 可 cherry-pick 捞回）。
- **环境**：`.env` 不进 git，现场里跑 `build-desktop.sh` 前先从主仓 cp；dev/preview 端口自动递增（3000→3001…）、localStorage 按端口隔离——演示数据天然不互踩，是 feature 不是 bug。
- **清理**：`bash scripts/wt.sh rm <现场>`；未合并分支会保留并提示（`branch -d` 语义=内容可达才删，无信息丢失），确认丢弃手动 `-D`（须用户确认）；**在现场里收尾时先 `cd` 回主仓再 rm**（git 拒绝删除当前所在的 worktree）。

> 依据（2026-11 调研）：Claude Code（`claude -w`）与 Codex 桌面（managed worktree）均把 worktree 做成一等公民并行方案；社区坑=环境复制成本（node_modules/端口/共享数据库），本项目无共享后端、DB 漂移坑不存在，其余两个均有对策（脚本封 npm ci、端口自动递增）。
> #17 两个决策点未获用户作答，按推荐/保守默认执行：落点=总是开现场（贴合「说一声自动开」意图、规则无判断分支）；push 分支前仍请确认——**#19 用户显式放开：push 票分支免确认**（push main/force push 仍须确认且被 ruleset 拦，merge 始终须确认）。

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
