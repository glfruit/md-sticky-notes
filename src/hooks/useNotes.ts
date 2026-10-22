import { useCallback, useEffect, useRef, useState } from 'react'
import type { StickyNoteData, NoteColor } from '@/types/note'
import { COLOR_ORDER } from '@/types/note'
import { initStorage, getStorage } from '@/lib/storage'

const SEED_KEY = 'md-sticky-notes:seeded'
/** 回收站保留 30 天 */
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000

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
- **任务状态**：预览里点击任务循环切换 待办→进行中→等待→完成→废弃（不同状态不同字体颜色）；右键任务可精确设置（对应标记 - [ ] 、- [/] 、- [?] 、- [x] 、- [-] ）
- 侧栏「任务」页签汇总所有未完成任务；任务文本里写了日期（如 2026-10-25）会按日期排序，今天和逾期的标红
- 标题栏 📌 可**置顶显示**；菜单栏「整理」一键排列所有便签、消除重叠
- 删除便签：标题栏红点（点两次确认），或左侧导航栏悬停便签点 🗑
- 双击标题栏折叠；拖动右下角调整大小
- 内容自动保存`

const TODO_CONTENT = `# 今日待办

- [ ] 回复邮件
- [ ] 15:00 产品评审
- [ ] 写周报

---
创建于 2026-10-20 09:30`

function seedNotes(): StickyNoteData[] {
  const now = Date.now()
  return [
    {
      id: 'seed-welcome',
      content: WELCOME_CONTENT,
      color: 'yellow',
      x: 60,
      y: 70,
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
      y: 120,
      width: 280,
      height: 300,
      collapsed: false,
      preview: true,
      z: 2,
      updatedAt: now,
    },
  ]
}

let idCounter = 0
const genId = () => `note-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export function useNotes() {
  const [notes, setNotes] = useState<StickyNoteData[]>([])
  const [trash, setTrash] = useState<StickyNoteData[]>([])
  const [loaded, setLoaded] = useState(false)
  const zTop = useRef(1)
  const saveTimers = useRef(new Map<string, number>())

  // 初始加载（网页版读 localStorage；桌面版读同步文件夹）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await initStorage()
      let ns = await getStorage().loadNotes()
      if (cancelled) return
      if (ns.length === 0 && !localStorage.getItem(SEED_KEY)) {
        ns = seedNotes()
        localStorage.setItem(SEED_KEY, '1')
        for (const n of ns) void getStorage().saveNote(n)
      }
      zTop.current = ns.reduce((m, n) => Math.max(m, n.z), 0) + 1
      setNotes(ns)
      // 回收站：加载并清理 30 天前的条目
      const trashed = await getStorage().listTrash()
      if (cancelled) return
      const cutoff = Date.now() - TRASH_TTL_MS
      const fresh = trashed.filter((n) => n.updatedAt >= cutoff)
      for (const old of trashed.filter((n) => n.updatedAt < cutoff)) {
        void getStorage().deleteTrash(old.id)
      }
      setTrash(fresh)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 防抖落盘：连续输入时 600ms 后才写文件
  const scheduleSave = useCallback((note: StickyNoteData) => {
    const timers = saveTimers.current
    const old = timers.get(note.id)
    if (old !== undefined) window.clearTimeout(old)
    timers.set(
      note.id,
      window.setTimeout(() => {
        timers.delete(note.id)
        void getStorage().saveNote(note)
      }, 600),
    )
  }, [])

  const addNote = useCallback(
    (content = '') => {
      const note: StickyNoteData = {
        id: genId(),
        content,
        color: COLOR_ORDER[notes.length % COLOR_ORDER.length] as NoteColor,
        x: 60 + ((notes.length * 36) % 320),
        y: 80 + ((notes.length * 36) % 240),
        width: 300,
        height: 320,
        collapsed: false,
        preview: false,
        z: zTop.current++,
        updatedAt: Date.now(),
      }
      setNotes((ns) => [...ns, note])
      void getStorage().saveNote(note)
      return note.id
    },
    [notes.length],
  )

  const updateNote = useCallback(
    (id: string, patch: Partial<StickyNoteData>) => {
      setNotes((ns) => {
        const next = ns.map((n) =>
          n.id === id
            ? { ...n, ...patch, updatedAt: patch.content !== undefined ? Date.now() : n.updatedAt }
            : n,
        )
        const changed = next.find((n) => n.id === id)
        if (changed) scheduleSave(changed)
        return next
      })
    },
    [scheduleSave],
  )

  // 删除 = 移入回收站（30 天内可恢复）
  const deleteNote = useCallback((id: string) => {
    setNotes((ns) => {
      const target = ns.find((n) => n.id === id)
      if (target) {
        const trashed = { ...target, updatedAt: Date.now() }
        setTrash((t) => [trashed, ...t])
        void getStorage().trashNote(trashed)
      }
      return ns.filter((n) => n.id !== id)
    })
    const timers = saveTimers.current
    const t = timers.get(id)
    if (t !== undefined) {
      window.clearTimeout(t)
      timers.delete(id)
    }
  }, [])

  // 从回收站恢复
  const restoreTrashNote = useCallback((id: string) => {
    setTrash((t) => {
      const target = t.find((n) => n.id === id)
      if (target) {
        const restored = { ...target, z: zTop.current++ }
        setNotes((ns) => [...ns, restored])
        void getStorage().restoreTrash(restored)
      }
      return t.filter((n) => n.id !== id)
    })
  }, [])

  // 彻底删除
  const permanentlyDeleteTrash = useCallback((id: string) => {
    setTrash((t) => t.filter((n) => n.id !== id))
    void getStorage().deleteTrash(id)
  }, [])

  const bringToFront = useCallback(
    (id: string) => {
      setNotes((ns) => {
        const next = ns.map((n) => (n.id === id ? { ...n, z: zTop.current++ } : n))
        const changed = next.find((n) => n.id === id)
        if (changed) scheduleSave(changed)
        return next
      })
    },
    [scheduleSave],
  )

  // 从存储层整体重载（切换文件夹 / 聚焦同步用）
  const reload = useCallback(async () => {
    const fresh = await getStorage().loadNotes()
    setNotes((cur) => {
      // 正在编辑的便签以本地为准，避免打断输入
      const editing = new Set(cur.filter((n) => !n.preview).map((n) => n.id))
      const freshIds = new Set(fresh.map((n) => n.id))
      const merged = fresh.map((n) => (editing.has(n.id) ? cur.find((c) => c.id === n.id)! : n))
      for (const c of cur) if (!freshIds.has(c.id)) merged.push(c)
      zTop.current = Math.max(
        zTop.current,
        merged.reduce((m, n) => Math.max(m, n.z), 0) + 1,
      )
      return merged
    })
  }, [])

  // 桌面版：窗口重新获得焦点时从文件夹拉一次（另一台机器的改动同步进来）
  useEffect(() => {
    if (!loaded) return
    const onFocus = () => {
      if (getStorage().kind === 'folder') void reload()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loaded, reload])

  return { notes, trash, loaded, addNote, updateNote, deleteNote, bringToFront, reload, restoreTrashNote, permanentlyDeleteTrash }
}
