# 代码规范（code-review Standards 轴依据）

> `/code-review` 的 Standards 轴按本文逐条对照。每条规范都来自真实踩坑或既定架构决策（ADR 见 `docs/adr/`）。

## 架构分层

- **纯逻辑放 `src/lib/`**：可单测的纯函数（editor.ts、noteFile.ts 等），不 import React、不碰 DOM/IPC。组件里的逻辑要么是纯渲染，要么应该下沉到 lib。
- **组件是薄壳**：`StickyNote` 用 `memo`，重渲染只由自身 props 驱动；拖动/缩放过程直写 DOM，`pointerup` 一次性提交状态（唯一一次 setState + 落盘）。
- **状态镜像模式**：`useNotes` 的 `notesRef`/`trashRef` 是 state 的同步镜像，让操作函数在 updater 外读最新值；React updater 必须是纯函数，副作用（落盘、z 归一化）全部外移。
- **弹出菜单的单一属主是 `components/Menu`**：新菜单一律消费 `Menu`/`MenuItem`（portal 到 body、视口坐标、实测尺寸钳制、Escape / 点外部关闭、全局互斥），不手写 backdrop / Escape / 钳制样板；右键「落点 → 菜单」的路由规则单源在 `lib/contextMenu`（消费 #11 盖章，未盖章不响应）。按钮锚定的向上 popover（FormatBar 弹出）不塞进点定位模型，但 Escape 关闭语义必须具备。
- **画布几何的单一属主是 `lib/layout`**（#26）：菜单栏高 / 折叠条带高 / 画布扩展边距 / 吸附距离等几何常量与「折叠→矩形映射 `noteRect`」「画布尺寸 `canvasExtent`」「滚动 `revealScroll`/`centerScroll`」「吸附 `snapValue`/`edgeCandidates`」「负坐标裁剪」等纯计算一律 import 自 lib/layout，组件里不写几何魔数副本；出生定位（`findSpawnSpot`）、一屏收纳（`tidyLayout`）、置顶避让（`pinnedRects`）同源。CSS 侧 top-7 / h-7 与 MENU_BAR_H 跨语言手工同步。
- **Rust 命令薄**：文件操作命令里可测的纯逻辑抽成独立函数（如 `sync_root_for`、`copy_dir_files`）配 `#[cfg(test)]` 单测；写文件必须走 `atomic_write`（tmp + rename，半份文件会被云盘扩散）；用户输入的文件名先 `replace(['/', '\\'], "_")`。

## 任务与 Markdown（易错区，历史 bug 最多）

- **任务行序的单一属主是 `taskLines.scanListLines`**：源文半边（`extractTasks` / `setTaskAtIndex` / `cycleTaskAtIndex` / convert×2 / 归档）全部消费同一份行集扫描；DOM 半边（`decorateTasks`）按行集计数盖章 `data-task-idx` / `data-list-idx`，计数不齐不盖章 + warn（宁点不动，不改错行）。改任务行识别规则（围栏跳过、状态字符集）只改 `taskLines.ts` 一处；契约回归在 `markdownRender.test.ts`（jsdom 全链渲染）。
- **任务五态色与截止日期色只从 `TASK_STATUS_META` / `DUE_LEVEL_COLORS` 取**，组件里不写裸 hex。
- 预览交互事件目标判断用 `instanceof Element`（不是 `HTMLElement`——内联 svg 不是 HTMLElement，▾ 按钮点击失效的教训）；svg 内部加 `pointer-events: none` 让点击落在宿主元素。
- 重复任务（🔁）标记完成时走 `resetRecurringTaskLine` 重置，所有写状态的入口都要过这一步。

## 存储与同步

- **`updatedAt` 是合并仲裁**：reload 合并时本地不旧于磁盘就以本地为准（600ms 防抖窗口内磁盘可能是旧版，无条件采磁盘会回滚用户刚做的操作）。
- 切换同步文件夹前必须先 `flushPendingSaves`；迁移复制对目标已存在文件跳过不覆盖。
- 附件存同步文件夹 `attachments/` 子目录，迁移/清理逻辑都要把它算进去。

## 样式与视觉

- **`design-system/md-sticky-notes/MASTER.md` 是视觉宪法**：色板（stone 暖灰阶 + 琥珀 #D97706 强调）、字体（Plus Jakarta Sans 自托管，离线可用，禁网络字体加载）、任务五态语义色。改 MASTER.md 须用户显式授权。
- 组件优先用 Tailwind 语义类（`bg-accent`、`text-stone-*`）；结构性色值走 `NOTE_COLORS` / `TASK_STATUS_META`。
- 便签纸色键名（`yellow`…`gray`）是持久化数据契约，不可改名。

## 测试与验证

- 新增纯逻辑必须带单测：lib 层 vitest（先写用例复现 bug 再修，修完测试留下）；Rust 纯函数 cargo test。
- UI 改动必须浏览器视觉冒烟（截图对照 MASTER.md 的 Pre-Delivery Checklist）；演示数据只写网页版 localStorage，永远不碰真实同步文件夹。
- 提交前完整跑 `npx tsc -b && npm run lint && npm test`（动 Rust 加 `cargo test`）。

## 提交与发布

- **一票一分支一 PR（#13）**：实现工作在 `<type>/<issue>-<slug>` 短命分支上做，`main` 只进 squash merge 的 PR（ruleset 强制：必过 CI `frontend`、禁直推/force push/删分支）；分支上高频小 commit、只 add 显式路径，禁 `git add -A`；评审修正 squash 进对应 commit，不追加「修正」commit。生命周期详见 `docs/workflow.md`「Git 纪律」节。
- 提交信息：中文、动词开头、括号里给动机/根因（看 git log 现有风格）；一个提交一个主题。
- 发布走 `docs/release-runbook.md`：tag → CI → 校验 7 资产 + latest.json → 填说明 → publish；draft 重打 tag 仅限从未 publish（tag 推送不受 ruleset 影响）。
- 本地部署：`bash scripts/build-desktop.sh` 后 `ditto` 替换 `/Applications/MD Sticky Notes.app`（先 rm 旧的，替换前确认进程未运行或提醒重启）。

## Shell 坑（本机实证）

- zsh 通配符无匹配会让整条命令中止（`ls a* b*` 一个不匹配全炸），分开跑或 `2>/dev/null`；
- zsh 下 `HEAD^` 的 `^` 会被当通配符展开报 no matches found，写 `HEAD~1` 或加引号 `'HEAD^'`；
- 管道接 `tail` 会掩盖上游退出码，验证链路要看每段输出；
- 中文脚本 `set -u` 下 `$VAR` 后紧跟全角标点会被当成更长变量名，写 `${VAR}`。
