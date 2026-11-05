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
- 并行多票用 worktree：`bash scripts/wt.sh new <分支>`（仓外 sibling 目录，一票一现场），边界/合并/清理纪律见 `docs/workflow.md`「并行：worktree」节。
- agent 须先获用户确认才可执行：`git push`、`gh pr merge`、`git reset --hard`、`push --force`、`branch -D`、`clean -fd`。
- commit 只 add 显式路径，禁止 `git add -A` / `git add .`。

## Agent skills

### Issue tracker

Issues 与 specs 以 GitHub Issues 跟踪（`gh` CLI 操作）。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认 triage 标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context：根目录 `CONTEXT.md`（词汇表）+ `docs/adr/`（架构决策记录）。见 `docs/agents/domain.md`。
