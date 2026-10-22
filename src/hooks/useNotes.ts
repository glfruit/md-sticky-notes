import { useCallback, useEffect, useRef, useState } from 'react'
import type { StickyNoteData, NoteColor } from '@/types/note'
import { COLOR_ORDER } from '@/types/note'
import { initStorage, getStorage, isTauri } from '@/lib/storage'

const SEED_KEY = 'md-sticky-notes:seeded'
/** 回收站保留 30 天 */
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** z 超过该值后按现有层级整体归一化，防止长期使用后无限增长盖过应用级浮层 */
const Z_NORMALIZE_THRESHOLD = 4000

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

function seedNotes(): StickyNoteData[] {
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

let idCounter = 0
const genId = () => `note-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

/** 历史数据可能存在负坐标：滚动桌面下裁剪到 ≥ 0，保证便签都能滚动到达 */
function clampIntoScrollArea(n: StickyNoteData): StickyNoteData {
  return n.x < 0 || n.y < 0 ? { ...n, x: Math.max(0, n.x), y: Math.max(0, n.y) } : n
}

export function useNotes() {
  const [notes, setNotes] = useState<StickyNoteData[]>([])
  const [trash, setTrash] = useState<StickyNoteData[]>([])
  const [loaded, setLoaded] = useState(false)
  const zTop = useRef(1)
  // state 的同步镜像：让各操作在 updater 外读取最新值、把副作用收敛到一处
  const notesRef = useRef<StickyNoteData[]>([])
  const trashRef = useRef<StickyNoteData[]>([])
  const saveTimers = useRef(new Map<string, { timer: number; note: StickyNoteData }>())

  const applyNotes = useCallback((next: StickyNoteData[]) => {
    notesRef.current = next
    setNotes(next)
  }, [])

  const applyTrash = useCallback((next: StickyNoteData[]) => {
    trashRef.current = next
    setTrash(next)
  }, [])

  // 初始加载（网页版读 localStorage；桌面版读同步文件夹）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await initStorage()
      let ns = (await getStorage().loadNotes()).map(clampIntoScrollArea)
      if (cancelled) return
      if (ns.length === 0 && !localStorage.getItem(SEED_KEY)) {
        ns = seedNotes()
        localStorage.setItem(SEED_KEY, '1')
        for (const n of ns) void getStorage().saveNote(n)
      }
      zTop.current = ns.reduce((m, n) => Math.max(m, n.z), 0) + 1
      applyNotes(ns)
      // 回收站：加载并清理 30 天前的条目
      const trashed = await getStorage().listTrash()
      if (cancelled) return
      const cutoff = Date.now() - TRASH_TTL_MS
      const fresh = trashed.filter((n) => n.updatedAt >= cutoff)
      for (const old of trashed.filter((n) => n.updatedAt < cutoff)) {
        void getStorage().deleteTrash(old.id)
      }
      applyTrash(fresh)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applyNotes, applyTrash])

  // 防抖落盘：连续输入时 600ms 后才写文件
  const scheduleSave = useCallback((note: StickyNoteData) => {
    const timers = saveTimers.current
    const old = timers.get(note.id)
    if (old !== undefined) window.clearTimeout(old.timer)
    const entry = { timer: 0, note }
    entry.timer = window.setTimeout(() => {
      timers.delete(note.id)
      void getStorage().saveNote(entry.note)
    }, 600)
    timers.set(note.id, entry)
  }, [])

  /** 立即写入所有未落盘的便签（退出 / 切换文件夹前调用），完成后 resolve */
  const flushPendingSaves = useCallback(async () => {
    const timers = saveTimers.current
    const pending = [...timers.values()]
    timers.clear()
    for (const entry of pending) window.clearTimeout(entry.timer)
    await Promise.all(pending.map((entry) => getStorage().saveNote(entry.note)))
  }, [])

  const addNote = useCallback(
    (content = '') => {
      const count = notesRef.current.length
      const note: StickyNoteData = {
        id: genId(),
        content,
        color: COLOR_ORDER[count % COLOR_ORDER.length] as NoteColor,
        x: 60 + ((count * 36) % 320),
        y: 16 + ((count * 36) % 240),
        width: 300,
        height: 320,
        collapsed: false,
        preview: false,
        z: zTop.current++,
        updatedAt: Date.now(),
      }
      applyNotes([...notesRef.current, note])
      void getStorage().saveNote(note)
      return note.id
    },
    [applyNotes],
  )

  const updateNote = useCallback(
    (id: string, patch: Partial<StickyNoteData>) => {
      const cur = notesRef.current
      const idx = cur.findIndex((n) => n.id === id)
      if (idx === -1) return
      const changed: StickyNoteData = {
        ...cur[idx],
        ...patch,
        updatedAt: patch.content !== undefined ? Date.now() : cur[idx].updatedAt,
      }
      const next = [...cur]
      next[idx] = changed
      applyNotes(next)
      scheduleSave(changed)
    },
    [applyNotes, scheduleSave],
  )

  // 删除 = 移入回收站（30 天内可恢复）
  const deleteNote = useCallback(
    (id: string) => {
      const cur = notesRef.current
      const target = cur.find((n) => n.id === id)
      if (!target) return
      // 取消未落盘的防抖，以回收站版本为准
      const pending = saveTimers.current.get(id)
      if (pending) {
        window.clearTimeout(pending.timer)
        saveTimers.current.delete(id)
      }
      applyNotes(cur.filter((n) => n.id !== id))
      const trashed = { ...target, updatedAt: Date.now() }
      applyTrash([trashed, ...trashRef.current])
      void getStorage().trashNote(trashed)
    },
    [applyNotes, applyTrash],
  )

  // 从回收站恢复
  const restoreTrashNote = useCallback(
    (id: string) => {
      const t = trashRef.current
      const target = t.find((n) => n.id === id)
      if (!target) return
      applyTrash(t.filter((n) => n.id !== id))
      const restored = clampIntoScrollArea({ ...target, z: zTop.current++ })
      applyNotes([...notesRef.current, restored])
      void getStorage().restoreTrash(restored)
    },
    [applyNotes, applyTrash],
  )

  // 彻底删除
  const permanentlyDeleteTrash = useCallback(
    (id: string) => {
      applyTrash(trashRef.current.filter((n) => n.id !== id))
      void getStorage().deleteTrash(id)
    },
    [applyTrash],
  )

  const bringToFront = useCallback(
    (id: string) => {
      const cur = notesRef.current
      const idx = cur.findIndex((n) => n.id === id)
      if (idx === -1) return
      if (cur[idx].z === zTop.current - 1) return // 已在最上层，避免重复写盘
      let next: StickyNoteData[]
      if (zTop.current >= Z_NORMALIZE_THRESHOLD) {
        // z 过大：按现有层级归一化为 1..n，目标便签置顶
        const seq = [...cur].sort((a, b) => a.z - b.z).filter((n) => n.id !== id)
        seq.push(cur[idx])
        const rank = new Map(seq.map((n, i) => [n.id, i + 1]))
        next = cur.map((n) => {
          const z = rank.get(n.id)!
          return n.z === z ? n : { ...n, z }
        })
        zTop.current = seq.length + 1
        applyNotes(next)
        for (let i = 0; i < next.length; i++) {
          if (next[i].z !== cur[i].z) scheduleSave(next[i])
        }
        return
      }
      next = [...cur]
      next[idx] = { ...cur[idx], z: zTop.current++ }
      applyNotes(next)
      scheduleSave(next[idx])
    },
    [applyNotes, scheduleSave],
  )

  // 从存储层整体重载（切换文件夹 / 聚焦同步用）
  const reload = useCallback(async () => {
    const fresh = (await getStorage().loadNotes()).map(clampIntoScrollArea)
    const cur = notesRef.current
    // 正在编辑的便签以本地为准，避免打断输入
    const editing = new Set(cur.filter((n) => !n.preview).map((n) => n.id))
    const freshIds = new Set(fresh.map((n) => n.id))
    const merged = fresh.map((n) => (editing.has(n.id) ? (cur.find((c) => c.id === n.id) ?? n) : n))
    for (const c of cur) if (!freshIds.has(c.id)) merged.push(c)
    zTop.current = Math.max(
      zTop.current,
      merged.reduce((m, n) => Math.max(m, n.z), 0) + 1,
    )
    applyNotes(merged)
  }, [applyNotes])

  // 桌面版：窗口重新获得焦点时从文件夹拉一次（另一台机器的改动同步进来）
  useEffect(() => {
    if (!loaded) return
    const onFocus = () => {
      if (getStorage().kind === 'folder') void reload()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loaded, reload])

  // 退出前把防抖中的内容立即落盘：
  // - pagehide / visibilitychange 兜底（尽力而为，无法等待完成）
  // - Tauri 关窗事件可等待写完后真正关闭
  useEffect(() => {
    const flushBestEffort = () => void flushPendingSaves()
    window.addEventListener('pagehide', flushBestEffort)
    const onVisibility = () => {
      if (document.hidden) flushBestEffort()
    }
    document.addEventListener('visibilitychange', onVisibility)
    let cleanupTauri: (() => void) | undefined
    if (isTauri()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        void win.onCloseRequested(async (e) => {
          e.preventDefault()
          await flushPendingSaves()
          await win.destroy()
        }).then((unlisten) => {
          cleanupTauri = unlisten
        })
      })
    }
    return () => {
      window.removeEventListener('pagehide', flushBestEffort)
      document.removeEventListener('visibilitychange', onVisibility)
      cleanupTauri?.()
    }
  }, [flushPendingSaves])

  return {
    notes,
    trash,
    loaded,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    reload,
    flushPendingSaves,
    restoreTrashNote,
    permanentlyDeleteTrash,
  }
}
