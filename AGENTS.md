# MD 便签（MD Sticky Notes）

Tauri 2 + React 19 桌面便签：每张便签 = 云盘同步文件夹里的一个纯 `.md` 文件（YAML frontmatter + Markdown 正文）。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 网页版开发（localStorage，不碰同步文件夹） |
| `npm test` / `npm run lint` / `npx tsc -b` | vitest / eslint / 类型检查 |
| `cd src-tauri && cargo test` | Rust 单元测试 |
| `bash scripts/build-desktop.sh` | 桌面打包（自动注入 .env 的 updater 签名密钥） |

## 开发流程

一切开发工作走 `docs/workflow.md` 的六步流水线（triage → grill → 设计 → spec/tickets → implement → review/发布）。代码规范见 `docs/standards.md`。

## Git 纪律（#13）

- `main` 受 ruleset 保护：只进 PR（必过 CI `frontend`），直推 / force push / 删分支均被拒——实现工作一律在票分支 `<type>/<issue>-<slug>` 上做（如 `fix/12-dup-task`），生命周期详见 `docs/workflow.md`「Git 纪律」节。
- **实现类指令（「实现 xxx」「修 #N」「继续推进候选 xxx」）的自动启动序列（#17），逐步执行不要跳步**：
  1. **定票**：指令未指向已有 issue 时，先 `gh issue create` 立票打 `ready-for-agent`（架构候选/TODO 项同此），纪律「无 ready-for-agent 不进实现」不变；
  2. **开现场**：`bash scripts/wt.sh new <type>/<issue>-<slug>`，然后 `cd ../md-sticky-notes-wt/<现场名>` 进去干活——**一律开现场，主仓常驻 main**，不要在主仓直接开分支；主仓若停在其他分支，在汇报里提醒一句即可，不要动它；
  3. **干活**：高频小 commit（只 add 显式路径）→ 验证三连 → 双轴评审对照 diff，细节见 `docs/workflow.md`；
  4. **收尾**：三连绿后直接 push 分支 + 开 PR（免确认，票分支不碰 main，#19）；merge 须用户确认；**squash 合并后回主仓 `bash scripts/wt.sh rm <现场>` 清现场**（分支已进 main，`-d` 无损删；不要在现场目录里删自己）。
- agent 须先获用户确认才可执行：`gh pr merge`（squash 进 main）、`git push origin main`、`push --force`、`git reset --hard`、`branch -D`、`clean -fd`（push 票分支免确认）。
- commit 只 add 显式路径，禁止 `git add -A` / `git add .`。

## Agent skills

### Issue tracker

Issues 与 specs 以 GitHub Issues 跟踪（`gh` CLI 操作）。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认 triage 标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context：根目录 `CONTEXT.md`（词汇表）+ `docs/adr/`（架构决策记录）。见 `docs/agents/domain.md`。
