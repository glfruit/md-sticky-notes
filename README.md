# MD 便签

macOS 桌面便签应用的 Markdown 增强版：每张便签是一个可拖拽的小窗口，内容是纯 Markdown，
以 `.md` 文件落盘在本地（或云盘同步）文件夹，天然支持多机同步。

基于 Tauri 2 + React 19 + Vite + Tailwind CSS 构建。

## 功能特性

- **Markdown 编辑 / 预览**：加粗、斜体、代码（语法高亮）、表格、任务列表、引用、图片
- **任务管理**：五态任务（待办 → 进行中 → 等待 → 完成 → 废弃），预览中点击循环切换、右键精确设置；
  任务文本里写日期自动排序、临期/逾期标红；`🔁每天 / 🔁每3天 / 🔁每周五 / 🔁每月1号` 重复任务完成时自动滚到下一周期
- **桌面化交互**：拖动（边缘吸附对齐）、缩放、折叠、置顶、半透明磨砂、双击标题栏折叠、一键整理；
  便签拖出窗口边缘会出现滚动条，随时滚回来
- **图片与表格**：粘贴截图 / 拖入图片自动保存；Excel / 网页表格粘贴自动转 Markdown 表格
- **搜索**：⌘F 全局搜索，回车跳转便签并选中匹配文本
- **侧栏**：便签列表、未完成任务汇总、回收站（30 天可恢复）、#标签筛选
- **提醒**：任务里写了时间（`15:30` / `2026-10-25` / `2026-10-25 09:30`）到点弹系统通知
- **多机同步**：便签保存为 Markdown 文件放进同步文件夹（默认 Dropbox，可换 iCloud / 坚果云），
  文件夹变更实时监听，另一台机器的改动自动刷新进来

## 快捷键

| 快捷键 | 功能 | | 快捷键 | 功能 |
| --- | --- | --- | --- | --- |
| ⌥N | 新建便签 | | ⌘E | 编辑 / 预览切换 |
| ⌃⌥N | 全局新建（任意应用内，可预填剪贴板） | | ⌘F | 搜索 |
| ⌥D / ⌥T / ⌥⇧T | 插入日期 / 时间 / 日期+时间 | | ⌥B | 固定 / 隐藏侧栏 |

## 存储格式

桌面版每张便签一个 `<id>.md` 文件，元数据存放在 YAML frontmatter：

```markdown
---
color: yellow        # yellow | blue | green | pink | purple | gray
x: 60                # 画布内坐标（像素）
y: 42
width: 360
height: 460
collapsed: false     # 是否折叠为标题栏
preview: true        # true = Markdown 预览，false = 源码编辑
pinned: false        # 置顶显示
translucent: false   # 半透明磨砂
z: 1                 # 层级
updatedAt: 1760000000000
---

（Markdown 正文）
```

- 没有 frontmatter 的 `.md` 文件放进文件夹会被当作新便签导入（默认黄色、预览模式）
- 图片附件存放在 `attachments/` 子目录，正文用 `![图片](attachment://文件名)` 引用
- 回收站是 `.trash/` 子目录，条目保留 30 天
- 文件写入为原子写（临时文件 + rename），崩溃不会产生半份文件

## 开发

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 桌面版开发（自动起 vite + cargo）
npm run dev          # 仅网页版（localStorage / IndexedDB 存储）
npm test             # 单元测试（vitest）
npm run lint         # ESLint
npm run tauri build  # 打包 .app / .dmg
```

Rust 侧代码在 `src-tauri/`，主要负责文件 IO（便签读写、附件、原子写）、文件夹监听（notify）、
全局热键、系统托盘与剪贴板。

## 目录结构

```
src/
  App.tsx              # 桌面布局：菜单栏 / 侧栏 / 滚动画布 / 弹层
  components/          # StickyNote、Sidebar、SearchPanel、Markdown 等
  hooks/
    useNotes.ts        # 便签状态机：增删改、防抖落盘、z 层级、同步重载
    useReminders.ts    # 任务到点系统通知
  lib/
    editor.ts          # 纯函数：列表续接、任务状态机、重复任务、Markdown 清理
    note.ts            # deriveTitle 等内容派生
    storage/           # 存储适配器（localStorage / 同步文件夹）
    attachments.ts     # 附件保存、URL 缓存、孤儿清理
```
