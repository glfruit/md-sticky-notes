/** 便签集合的同步与治理（保存管线的纯函数半边）：
 *  合并仲裁、回收站 30 天分拣、z 序治理、补丁政策、种子内容。
 *  时序布线（600ms 防抖 / flush / 文件夹监听）留在 useNotes hook——本模块全部纯函数，
 *  稳定门槛最怕的「双机同步互相覆盖」类决策全部在此、直测可达。 */
import type { StickyNoteData } from '@/types/note'

/** 回收站保留 30 天（CONTEXT.md「回收站」词条） */
export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** z 超过该值后按现有层级整体归一化，防止长期使用后无限增长盖过应用级浮层 */
export const Z_NORMALIZE_THRESHOLD = 4000

// ---------- reload 合并仲裁 ----------

/** 合并磁盘重载（fresh）与本地状态（cur）：
 *  - 正在编辑（preview=false）的便签以本地为准，避免打断输入；
 *  - 其余便签本地不旧于磁盘时也以本地为准——自己的写入会触发 folder-changed 重载，
 *    落盘有 600ms 防抖，重载落在窗口内时磁盘还是旧版，无条件采磁盘会回滚（状态反复）；
 *  - 本地独有的便签追加保留：保护防抖窗口内新建的便签不被重载吞掉。
 *    代价：另一台机器删除的便签会在本地内存复活（无法区分「磁盘曾有」），
 *    ADR-0001 有意接受粗粒度同步。
 *  无变化（逐位同一对象且无追加）返回 cur 原引用，调用方以引用相等免重渲染。 */
export function mergeNotes(cur: StickyNoteData[], fresh: StickyNoteData[]): StickyNoteData[] {
  const editing = new Set(cur.filter((n) => !n.preview).map((n) => n.id))
  const freshIds = new Set(fresh.map((n) => n.id))
  const byDisk = fresh.map((n) => {
    const c = cur.find((c) => c.id === n.id)
    return c && (editing.has(n.id) || c.updatedAt >= n.updatedAt) ? c : n
  })
  const localOnly = cur.filter((c) => !freshIds.has(c.id))
  // 无变化短路：磁盘侧逐位同一对象，且本地独有项恰为 cur 尾部原对象
  //（防抖窗口内新建触发 folder-changed 重载的典型形态）→ 返回 cur 免重渲染，
  // 与旧 JSON.stringify 全量比较语义一致
  if (
    byDisk.every((n, i) => n === cur[i]) &&
    localOnly.every((n, i) => n === cur[byDisk.length + i])
  ) {
    return cur
  }
  return [...byDisk, ...localOnly]
}

// ---------- 回收站 30 天分拣 ----------

/** 按 TTL 把回收站分成「保留展示」与「可彻底删除」两堆（30 天边界当天保留）。
 *  全量加载与 replace 重载共用——原先两处手抄且不对称（replace 不删过期项）。 */
export function partitionTrash(
  trashed: StickyNoteData[],
  now = Date.now(),
): { kept: StickyNoteData[]; expired: StickyNoteData[] } {
  const cutoff = now - TRASH_TTL_MS
  const kept: StickyNoteData[] = []
  const expired: StickyNoteData[] = []
  for (const n of trashed) (n.updatedAt >= cutoff ? kept : expired).push(n)
  return { kept, expired }
}

// ---------- z 序治理 ----------

/** 全集合最高 z + 1（zTop 的单一计算源） */
export function nextZTop(notes: StickyNoteData[]): number {
  return notes.reduce((m, n) => Math.max(m, n.z), 0) + 1
}

/** z 序归一化：按现有层级压回 1..n、目标便签置顶；保持原数组顺序，
 *  z 未变的项返回原对象（调用方以此判定哪些便签需要写盘）。
 *  前置条件：topId ∈ notes（调用方 findIndex 已判定存在）。 */
export function normalizeZ(
  notes: StickyNoteData[],
  topId: string,
): { notes: StickyNoteData[]; nextTop: number } {
  const seq = [...notes].sort((a, b) => a.z - b.z).filter((n) => n.id !== topId)
  seq.push(notes.find((n) => n.id === topId)!)
  const rank = new Map(seq.map((n, i) => [n.id, i + 1]))
  const next = notes.map((n) => {
    const z = rank.get(n.id)!
    return n.z === z ? n : { ...n, z }
  })
  return { notes: next, nextTop: seq.length + 1 }
}

// ---------- 补丁政策 ----------

/** 应用便签补丁。updatedAt 政策（原为 useNotes 内未注解的隐式语义，显式化）：
 *  只有内容变更才 bump——几何 / 颜色 / 折叠不动 updatedAt，
 *  合并仲裁因此对纯移动「盲」（后写覆盖，ADR-0001 有意接受）。 */
export function patchNote(
  note: StickyNoteData,
  patch: Partial<StickyNoteData>,
  now = Date.now(),
): StickyNoteData {
  return { ...note, ...patch, updatedAt: patch.content !== undefined ? now : note.updatedAt }
}

// ---------- 种子内容 ----------

const WELCOME_CONTENT = `# 欢迎使用 MD 便签 📝

这是 Mac 便签的 Markdown 增强版。

## 快捷插入日期时间
- **⌥D** 插入日期 → 2026-10-20
- **⌥T** 插入时间 → 15:03
- **⌥⇧T** 插入日期+时间
- 也可以点标题栏上的 📅 🕐 按钮

## Markdown 支持
**加粗**、*斜体*、\`代码\`、~~删除线~~

- [x] 任务列表
- [ ] 待办事项

> 引用块也支持

\`\`\`js
// 代码高亮块
console.log('hello')
\`\`\`

## 其他技巧
- **⌘E** 切换 编辑 / 预览
- **⌥N** 新建便签
- **⌘F** 全局搜索，回车跳转并选中匹配
- **⌥B** 固定左侧导航栏；鼠标移到屏幕左边缘自动滑出
- 编辑模式底部工具条：**A 颜色** 给选中文字变色；**表情** 插入 emoji 😄；**表格** 拖选行列插入表格
- 直接**粘贴截图 / 拖入图片**会自动保存并显示；从 Excel 或网页**复制的表格**粘贴后自动转成 Markdown 表格
- **任务状态**：悬浮到任务项上点 **▾** 展开状态菜单（待办 / 进行中 / 等待 / 完成 / 废弃），或右键任务精确设置（对应标记 - [ ] 、- [/] 、- [?] 、- [x] 、- [-] ）；点任务前的复选框直接勾选完成
- 侧栏「任务」页签汇总所有未完成任务；任务文本里写了日期（如 2026-10-25）会按日期排序，今天和逾期的标红
- 便签里写 **＃标签**（如 ＃工作 ＃学习 这样的井号标签），侧栏「便签」页签顶部可按标签筛选
- 标题栏 📌 可**置顶显示**；菜单栏「整理」一键排列所有便签、消除重叠
- 便签可以**拖出窗口边缘**，桌面会出现滚动条，随时滚回来
- 删除便签：标题栏红点（点两次确认），或左侧导航栏悬停便签点 🗑
- 双击标题栏折叠；拖动右下角调整大小
- 内容自动保存`

const TODO_CONTENT = `# 今日待办

- [ ] 回复邮件
- [ ] 15:00 产品评审
- [ ] 写周报

---
创建于 2026-10-20 09:30`

/** 首次启动的种子便签（欢迎 + 今日待办） */
export function seedNotes(): StickyNoteData[] {
  const now = Date.now()
  return [
    {
      id: 'seed-welcome',
      content: WELCOME_CONTENT,
      color: 'yellow',
      x: 60,
      y: 42,
      width: 360,
      height: 460,
      collapsed: false,
      preview: true,
      z: 1,
      updatedAt: now,
    },
    {
      id: 'seed-todo',
      content: TODO_CONTENT,
      color: 'green',
      x: 460,
      y: 92,
      width: 280,
      height: 300,
      collapsed: false,
      preview: true,
      z: 2,
      updatedAt: now,
    },
  ]
}
