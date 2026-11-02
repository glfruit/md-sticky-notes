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

## Agent skills

### Issue tracker

Issues 与 specs 以 GitHub Issues 跟踪（`gh` CLI 操作）。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认 triage 标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context：根目录 `CONTEXT.md`（词汇表）+ `docs/adr/`（架构决策记录）。见 `docs/agents/domain.md`。
