import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, Clock, CalendarClock, Eye, PencilLine, Check, Download, Pin } from 'lucide-react'
import type { StickyNoteData } from '@/types/note'
import { NOTE_COLORS, COLOR_ORDER, MIN_W, MIN_H } from '@/types/note'
import { formatDate, formatTime, formatDateTime, formatUpdatedAt } from '@/lib/datetime'
import { deriveTitle } from '@/lib/note'
import { exportNote } from '@/lib/export'
import { saveAttachment, attachmentUrl } from '@/lib/attachments'
import { htmlTableToMarkdown, tsvToMarkdown } from '@/lib/tablePaste'
import { handleEnter, handleTab, cycleTaskAtIndex, setTaskAtIndex, cleanupMarkdown, archiveCompletedTasks, convertListItemToTask, convertTaskToListItem, TASK_STATUS_META } from '@/lib/editor'
import type { TaskStatus } from '@/lib/editor'
import { Markdown } from './Markdown'
import { FormatBar } from './FormatBar'

export interface RevealTarget {
  start: number
  end: number
  nonce: number
}

interface Props {
  note: StickyNoteData
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  onDelete: (id: string) => void
  onFocus: (id: string) => void
  /** 搜索跳转：切到编辑模式并选中 [start, end) 区间 */
  reveal?: RevealTarget | null
  /** 侧栏选中后高亮闪烁 */
  flashing?: boolean
  /** 全部便签的几何信息（拖动吸附用，内部排除自身） */
  snapTargets?: { id: string; x: number; y: number; width: number; height: number }[]
  /** 桌面滚动层：拖动坐标换算 / 边缘自动滚动 */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  /** 滚动画布：便签拖出视口时撑大内容区 */
  canvasRef?: React.RefObject<HTMLDivElement | null>
}

/** memo 化：单张便签的重渲染只由自身 props 驱动（拖动 / 其他便签更新不再全树重绘） */
export const StickyNote = memo(function StickyNote({
  note,
  onUpdate,
  onDelete,
  onFocus,
  reveal,
  flashing,
  snapTargets,
  scrollRef,
  canvasRef,
}: Props) {
  const colors = NOTE_COLORS[note.color]
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const pendingCursor = useRef<number | null>(null)
  const pendingReveal = useRef<{ start: number; end: number } | null>(null)
  const [maximized, setMaximized] = useState(false)
  const prevGeometry = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  // 绿点：最大化 / 还原（macOS 语义）；坐标为滚动画布内容坐标（菜单栏下方）
  const toggleMaximize = useCallback(() => {
    if (maximized) {
      if (prevGeometry.current) onUpdate(note.id, { ...prevGeometry.current })
      setMaximized(false)
    } else {
      prevGeometry.current = { x: note.x, y: note.y, width: note.width, height: note.height }
      onUpdate(note.id, {
        x: 16,
        y: 16,
        width: window.innerWidth - 32,
        height: window.innerHeight - 60,
        collapsed: false,
      })
      setMaximized(true)
    }
  }, [maximized, note.id, note.x, note.y, note.width, note.height, onUpdate])

  // 关闭便签（切回预览）：先做一次 Markdown 语法检查与清理，有修复则短暂提示
  const [cleanupToast, setCleanupToast] = useState<string | null>(null)
  // 右键菜单：任务项 → 状态选择；普通列表项 → 转换为任务
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: 'status'; index: number }
    | { x: number; y: number; kind: 'convert'; listIndex: number }
    | null
  >(null)

  const setTaskStatus = useCallback(
    (index: number, status: TaskStatus) => {
      const next = setTaskAtIndex(note.content, index, status)
      if (next !== null) onUpdate(note.id, { content: next })
    },
    [note.id, note.content, onUpdate],
  )

  const convertToTask = useCallback(
    (listIndex: number) => {
      const next = convertListItemToTask(note.content, listIndex)
      if (next !== null) {
        onUpdate(note.id, { content: next })
        setCleanupToast('已转换为任务（待办）')
      }
    },
    [note.id, note.content, onUpdate],
  )

  // 任务转回普通条目
  const convertTaskBack = useCallback(
    (index: number) => {
      const next = convertTaskToListItem(note.content, index)
      if (next !== null) {
        onUpdate(note.id, { content: next })
        setCleanupToast('已转为普通条目')
      }
    },
    [note.id, note.content, onUpdate],
  )

  // 归档：把已完成 / 废弃的任务移到便签底部
  const archiveTasks = useCallback(() => {
    const next = archiveCompletedTasks(note.content)
    if (next === null) {
      setCleanupToast('没有可归档的任务')
      return
    }
    onUpdate(note.id, { content: next })
    setCleanupToast('已把完成 / 废弃的任务移到底部「归档」区')
  }, [note.id, note.content, onUpdate])
  const switchToPreview = useCallback(() => {
    if (note.preview) return
    const { text, fixes } = cleanupMarkdown(note.content)
    const patch: Partial<StickyNoteData> = { preview: true }
    if (text !== note.content) patch.content = text
    onUpdate(note.id, patch)
    if (fixes.length > 0) setCleanupToast(`已自动清理：${fixes.join('、')}`)
  }, [note.preview, note.content, note.id, onUpdate])

  useEffect(() => {
    if (!cleanupToast) return
    const t = setTimeout(() => setCleanupToast(null), 3500)
    return () => clearTimeout(t)
  }, [cleanupToast])

  // 编辑模式下自动聚焦
  useEffect(() => {
    if (!note.preview && !note.collapsed) textareaRef.current?.focus()
  }, [note.preview, note.collapsed])

  // 插入文本后恢复光标位置
  useEffect(() => {
    if (pendingCursor.current !== null && textareaRef.current) {
      const pos = pendingCursor.current
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
      pendingCursor.current = null
    }
  }, [note.content])

  // 搜索跳转：先切到编辑模式并展开
  const revealNonce = reveal?.nonce
  useEffect(() => {
    if (revealNonce === undefined || !reveal) return
    pendingReveal.current = { start: reveal.start, end: reveal.end }
    if (note.preview || note.collapsed) {
      onUpdate(note.id, { preview: false, collapsed: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce])

  // 编辑模式下执行选中 + 滚动到匹配位置
  useEffect(() => {
    if (note.preview || note.collapsed) return
    const target = pendingReveal.current
    if (!target || !textareaRef.current) return
    const ta = textareaRef.current
    ta.focus()
    ta.setSelectionRange(target.start, target.end)
    const lines = note.content.slice(0, target.start).split('\n').length
    ta.scrollTop = Math.max(0, (lines - 4) * 21)
    pendingReveal.current = null
  })

  // 预览区交互：
  // - 双击（dblclick + pointerup 时间戳双通道）进入编辑，兼容不派发 dblclick 的环境
  // - 点击任务项（checkbox 或状态徽章）：循环切换 待办→进行中→等待→完成→废弃
  // - 右键任务项：弹出状态选择菜单
  useEffect(() => {
    const el = previewRef.current
    if (!note.preview || !el) return
    const enterEdit = () => onUpdate(note.id, { preview: false })
    let lastUp = 0
    let lastToggle = 0
    const onDbl = () => enterEdit()
    const taskLi = (t: EventTarget | null): HTMLLIElement | null =>
      t instanceof HTMLElement ? (t.closest('li.task-item') as HTMLLIElement | null) : null
    // 用位移判定拖拽（拖选文字），比检查 selection 更可靠：
    // 有预存选区时单击任务不应被误拦截
    let downX = 0
    let downY = 0
    const onDownPos = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const cycleTask = (li: HTMLLIElement, e: PointerEvent) => {
      const now = Date.now()
      if (now - lastToggle < 300) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      lastToggle = now
      const items = Array.from(el.querySelectorAll('li.task-item'))
      const idx = items.indexOf(li)
      if (idx < 0) return
      const next = cycleTaskAtIndex(note.content, idx)
      if (next !== null) onUpdate(note.id, { content: next })
    }
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return
      const li = taskLi(e.target)
      if (li) {
        cycleTask(li, e)
        return
      }
      const now = Date.now()
      if (now - lastUp < 450) {
        lastUp = 0
        enterEdit()
      } else {
        lastUp = now
      }
    }
    const onClickCap = (e: MouseEvent) => {
      // 阻止原生 checkbox 默认翻转（状态由源码驱动，pointerup 已处理循环）
      if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
        e.preventDefault()
      }
    }
    const onContext = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const li = t.closest('li')
      if (!li || !el.contains(li)) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (li.classList.contains('task-item')) {
        const items = Array.from(el.querySelectorAll('li.task-item'))
        const idx = items.indexOf(li as HTMLLIElement)
        if (idx >= 0) setCtxMenu({ x, y, kind: 'status', index: idx })
      } else {
        const all = Array.from(el.querySelectorAll('li'))
        const listIdx = all.indexOf(li as HTMLLIElement)
        if (listIdx >= 0) setCtxMenu({ x, y, kind: 'convert', listIndex: listIdx })
      }
    }
    el.addEventListener('dblclick', onDbl, true)
    el.addEventListener('pointerdown', onDownPos, true)
    el.addEventListener('pointerup', onUp, true)
    el.addEventListener('click', onClickCap, true)
    el.addEventListener('contextmenu', onContext, true)
    return () => {
      el.removeEventListener('dblclick', onDbl, true)
      el.removeEventListener('pointerdown', onDownPos, true)
      el.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('click', onClickCap, true)
      el.removeEventListener('contextmenu', onContext, true)
    }
  }, [note.preview, note.id, note.content, onUpdate])

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 2500)
    return () => clearTimeout(t)
  }, [confirmDelete])

  // 编辑模式下点击窗口外（其它便签或空白区域）→ 自动切回预览（含语法清理）
  // 空白便签保持编辑模式，方便继续输入；点滚动条不算离开
  useEffect(() => {
    if (note.preview || note.collapsed) return
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current
      if (
        root &&
        !root.contains(e.target as Node) &&
        e.target !== scrollRef?.current &&
        note.content.trim()
      ) {
        switchToPreview()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [note.preview, note.collapsed, note.content, switchToPreview, scrollRef])

  const insertText = useCallback(
    (text: string, padSpaces = true) => {
      const ta = textareaRef.current
      if (!ta) {
        onUpdate(note.id, { content: note.content + text })
        return
      }
      const start = ta.selectionStart ?? note.content.length
      const end = ta.selectionEnd ?? start
      const before = note.content.slice(0, start)
      const after = note.content.slice(end)
      // 与上下文之间留一个空格，避免粘连
      const needLead = padSpaces && before && !/[\s\n]$/.test(before) ? ' ' : ''
      const needTail = padSpaces && after && !/^[\s\n]/.test(after) ? ' ' : ''
      const inserted = needLead + text + needTail
      pendingCursor.current = start + needLead.length + text.length
      onUpdate(note.id, { content: before + inserted + after })
    },
    [note.id, note.content, onUpdate],
  )

  const insertDate = useCallback(() => insertText(formatDate()), [insertText])
  const insertTime = useCallback(() => insertText(formatTime()), [insertText])
  const insertDateTime = useCallback(() => insertText(formatDateTime()), [insertText])
  const insertEmoji = useCallback((emoji: string) => insertText(emoji, false), [insertText])

  // 插入 Markdown 表格，光标落到第一个数据单元格
  const insertTable = useCallback(
    (rows: number, cols: number) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? note.content.length
      const end = ta.selectionEnd ?? start
      const before = note.content.slice(0, start)
      const after = note.content.slice(end)
      // 表格块前后保证空行
      const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
      const tail = after && !after.startsWith('\n') ? '\n' : ''
      const header = `| ${Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ')} |`
      const sep = `|${' --- |'.repeat(cols)}`
      const body = Array.from({ length: rows }, () => `|${'  |'.repeat(cols)}`).join('\n')
      const table = `${header}\n${sep}\n${body}\n`
      // 光标：第一行数据的第一个单元格内
      const cursor = start + lead.length + header.length + 1 + sep.length + 1 + 2
      pendingReveal.current = { start: cursor, end: cursor }
      onUpdate(note.id, { content: before + lead + table + tail + after })
    },
    [note.id, note.content, onUpdate],
  )

  // 在光标处插入一个块级内容（图片引用 / 表格），前后自动补空行
  const insertBlock = useCallback(
    (block: string) => {
      const ta = textareaRef.current
      const content = note.content
      const start = ta ? ta.selectionStart : content.length
      const end = ta ? ta.selectionEnd : start
      const before = content.slice(0, start)
      const after = content.slice(end)
      const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
      const tail = after && !after.startsWith('\n') ? '\n' : ''
      const pos = start + lead.length + block.length
      pendingReveal.current = { start: pos, end: pos }
      onUpdate(note.id, { content: before + lead + block + tail + after })
    },
    [note.id, note.content, onUpdate],
  )

  // 保存剪贴板 / 拖入的图片并插入 Markdown 引用
  const insertImages = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return false
      const ids: string[] = []
      for (const f of images) {
        try {
          ids.push(await saveAttachment(f))
        } catch {
          // IndexedDB 不可用时跳过该图片
        }
      }
      if (ids.length > 0) {
        insertBlock(ids.map((id) => `![图片](${attachmentUrl(id)})`).join('\n'))
      }
      return true
    },
    [insertBlock],
  )

  // 粘贴：图片 → 本地存储；HTML 表格 / TSV → Markdown 表格；其余走默认
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData
      const imageFiles = Array.from(cd.items)
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (imageFiles.length > 0) {
        e.preventDefault()
        void insertImages(imageFiles)
        return
      }
      const html = cd.getData('text/html')
      if (html) {
        const md = htmlTableToMarkdown(html)
        if (md) {
          e.preventDefault()
          insertBlock(md)
          return
        }
      }
      const text = cd.getData('text/plain')
      if (text && text.includes('\t')) {
        const md = tsvToMarkdown(text)
        if (md) {
          e.preventDefault()
          insertBlock(md)
        }
      }
    },
    [insertImages, insertBlock],
  )

  // 拖入图片文件
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      onFocus(note.id)
      if (note.preview || note.collapsed) {
        onUpdate(note.id, { preview: false, collapsed: false })
      }
      void insertImages(files)
    },
    [note.id, note.preview, note.collapsed, onFocus, onUpdate, insertImages],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
    }
  }, [])

  // 给选中文字包一层带颜色的 span（无选区时插入占位并选中占位文字）
  const applyTextColor = useCallback(
    (color: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? start
      const selected = note.content.slice(start, end)
      const open = `<span style="color:${color}">`
      const inner = selected || '文字'
      const wrapped = open + inner + '</span>'
      pendingReveal.current = selected
        ? { start: start + wrapped.length, end: start + wrapped.length }
        : { start: start + open.length, end: start + open.length + inner.length }
      onUpdate(note.id, { content: note.content.slice(0, start) + wrapped + note.content.slice(end) })
    },
    [note.id, note.content, onUpdate],
  )

  // 清除选中范围内的 span 颜色标记
  const clearTextColor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? start
    const selected = note.content.slice(start, end)
    const cleaned = selected.replace(/<\/?span[^>]*>/g, '')
    pendingReveal.current = { start, end: start + cleaned.length }
    onUpdate(note.id, { content: note.content.slice(0, start) + cleaned + note.content.slice(end) })
  }, [note.id, note.content, onUpdate])

  // 窗口内键盘快捷键
  const applyEdit = useCallback(
    (r: { text: string; selStart: number; selEnd: number }) => {
      pendingReveal.current = { start: r.selStart, end: r.selEnd }
      onUpdate(note.id, { content: r.text })
    },
    [note.id, onUpdate],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // textarea 内的编辑增强：回车续接列表、Tab 缩进
      if (e.target instanceof HTMLTextAreaElement) {
        const ta = e.target
        if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey) {
          const r = handleEnter(note.content, ta.selectionStart, ta.selectionEnd)
          if (r) {
            e.preventDefault()
            applyEdit(r)
            return
          }
        } else if (e.key === 'Tab' && !mod && !e.altKey) {
          e.preventDefault()
          applyEdit(handleTab(note.content, ta.selectionStart, ta.selectionEnd, e.shiftKey))
          return
        }
      }
      // ⌥D 日期 / ⌥T 时间 / ⌥⇧T 日期+时间 / ⌘E 预览切换
      if (e.altKey && !mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        insertDate()
      } else if (e.altKey && !mod && e.key.toLowerCase() === 't') {
        e.preventDefault()
        if (e.shiftKey) insertDateTime()
        else insertTime()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (note.preview) onUpdate(note.id, { preview: false })
        else switchToPreview()
      }
    },
    [insertDate, insertTime, insertDateTime, applyEdit, switchToPreview, note.id, note.content, note.preview, onUpdate],
  )

  // 拖动窗口（带吸附对齐：其他便签边缘 + 视口边缘）
  // 拖动过程直写 DOM 不走 React 渲染；坐标为滚动画布的内容坐标，
  // 便签拖出视口时撑大画布（滚动条出现），指针贴近边缘时自动滚动
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      onFocus(note.id)
      const root = rootRef.current
      const sc = scrollRef?.current
      if (!root) return
      const rect = sc?.getBoundingClientRect()
      const layerLeft = rect?.left ?? 0
      const layerTop = rect?.top ?? 0
      // 抓取点在便签内的偏移（内容坐标，拖动期间恒定）
      const offsetX = e.clientX - layerLeft + (sc?.scrollLeft ?? 0) - note.x
      const offsetY = e.clientY - layerTop + (sc?.scrollTop ?? 0) - note.y
      let pointerX = e.clientX
      let pointerY = e.clientY
      let x = note.x
      let y = note.y

      const SNAP = 8
      const snap = (v: number, candidates: number[]): number => {
        let best = v
        let bestDist = SNAP + 1
        for (const c of candidates) {
          const d = Math.abs(v - c)
          if (d < bestDist) {
            bestDist = d
            best = c
          }
        }
        return best
      }
      const targets = (snapTargets ?? []).filter((t) => t.id !== note.id)

      const apply = () => {
        if (sc) {
          x = pointerX - layerLeft + sc.scrollLeft - offsetX
          y = pointerY - layerTop + sc.scrollTop - offsetY
        } else {
          x = pointerX - offsetX
          y = pointerY - offsetY
        }
        x = Math.max(0, x)
        y = Math.max(0, y)
        if (targets.length > 0 && sc) {
          // 视口边缘（随滚动位置换算）+ 其他便签边缘
          const vw = sc.clientWidth
          const vh = sc.clientHeight
          const xs: number[] = [sc.scrollLeft + 16, sc.scrollLeft + vw - 16 - note.width]
          const ys: number[] = [sc.scrollTop + 16, sc.scrollTop + vh - 16 - note.height]
          for (const b of targets) {
            xs.push(b.x, b.x + b.width, b.x + b.width - note.width)
            ys.push(b.y, b.y + b.height, b.y + b.height - note.height)
          }
          x = snap(x, xs)
          y = snap(y, ys)
        }
        root.style.left = `${x}px`
        root.style.top = `${y}px`
        // 便签拖出当前画布时直接撑大（pointerup 后由 React 状态接管尺寸）
        const canvas = canvasRef?.current
        if (canvas) {
          const needW = x + note.width + 24
          const needH = y + note.height + 24
          if (needW > canvas.offsetWidth) canvas.style.width = `${needW}px`
          if (needH > canvas.offsetHeight) canvas.style.height = `${needH}px`
        }
      }

      // 边缘自动滚动：指针贴近可视边缘时持续滚动，便签跟随指针
      const EDGE = 28
      const SPEED = 14
      let raf = 0
      const tick = () => {
        if (sc) {
          const dx = pointerX - layerLeft
          const dy = pointerY - layerTop
          if (dx < EDGE) sc.scrollLeft -= SPEED
          else if (dx > sc.clientWidth - EDGE) sc.scrollLeft += SPEED
          if (dy < EDGE) sc.scrollTop -= SPEED
          else if (dy > sc.clientHeight - EDGE) sc.scrollTop += SPEED
        }
        apply()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      const onMove = (ev: PointerEvent) => {
        pointerX = ev.clientX
        pointerY = ev.clientY
        apply()
      }
      const onScroll = () => apply()
      const onUp = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        sc?.removeEventListener('scroll', onScroll)
        // 一次性提交最终位置（唯一一次状态更新 + 落盘）
        onUpdate(note.id, { x, y })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      sc?.addEventListener('scroll', onScroll)
    },
    // 故意不依赖 note.x/note.y：抓取偏移在拖动开始时锁定，拖动中不受便签位置更新影响
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id, note.width, note.height, snapTargets, scrollRef, canvasRef, onUpdate, onFocus],
  )

  // 调整大小（拖动过程直写 DOM，pointerup 一次提交）
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onFocus(note.id)
      const root = rootRef.current
      const startX = e.clientX
      const startY = e.clientY
      const startW = note.width
      const startH = note.height
      let w = startW
      let h = startH
      const onMove = (ev: PointerEvent) => {
        w = Math.max(MIN_W, startW + ev.clientX - startX)
        h = Math.max(MIN_H, startH + ev.clientY - startY)
        if (root) {
          root.style.width = `${w}px`
          root.style.height = `${h}px`
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onUpdate(note.id, { width: w, height: h })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [note.id, note.width, note.height, onUpdate, onFocus],
  )

  const iconBtn = 'p-1 rounded hover:bg-black/10 text-black/55 hover:text-black/80 transition-colors'

  return (
    <div
      ref={rootRef}
      className="absolute flex flex-col rounded-md overflow-hidden"
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.collapsed ? 'auto' : note.height,
        // 置顶段 9000+：浮在其他便签之上，但低于侧栏(9998)/菜单栏(9999)/弹层(10000)
        zIndex: note.pinned ? 9000 + note.z : note.z,
        backgroundColor: note.translucent ? `${colors.bg}b3` : colors.bg,
        backdropFilter: note.translucent ? 'blur(14px)' : undefined,
        border: `1px solid ${colors.border}`,
        boxShadow: flashing
          ? '0 12px 32px rgba(0,0,0,0.28), 0 0 0 3px rgba(59,130,246,0.85)'
          : '0 12px 32px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.15)',
        transition: 'box-shadow 0.3s ease',
      }}
      onPointerDown={() => onFocus(note.id)}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center gap-1 px-2 h-7 shrink-0 cursor-grab active:cursor-grabbing select-none"
        style={{ backgroundColor: note.translucent ? `${colors.bar}b3` : colors.bar }}
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          onUpdate(note.id, { collapsed: !note.collapsed })
        }}
        title="双击折叠 / 展开"
      >
        {/* 红绿灯 */}
        <div className="flex items-center gap-1.5 mr-1">
          {confirmDelete ? (
            <button
              className="flex items-center gap-1 text-[10px] font-medium px-1.5 h-4 rounded-full bg-red-500 text-white"
              onClick={() => {
                onDelete(note.id)
                setConfirmDelete(false)
              }}
            >
              <Check size={10} /> 删除?
            </button>
          ) : (
            <button
              className="group w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 flex items-center justify-center"
              onClick={() => setConfirmDelete(true)}
              title="关闭便签（点一下出现「删除?」，再点确认）"
            >
              <span className="hidden group-hover:block text-[8px] leading-none text-black/60 font-bold">
                ×
              </span>
            </button>
          )}
          <button
            className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] hover:brightness-90"
            onClick={() => onUpdate(note.id, { collapsed: !note.collapsed })}
            title={note.collapsed ? '展开' : '折叠'}
          />
          <button
            className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1dad2b] hover:brightness-90"
            onClick={toggleMaximize}
            title={maximized ? '还原窗口大小' : '最大化（再次点击还原）'}
          />
        </div>

        {/* 标题 */}
        <div className="flex-1 text-center text-[12px] font-medium text-black/60 truncate px-1">
          {deriveTitle(note.content)}
        </div>

        {/* 日期时间插入 */}
        <div className="flex items-center" onPointerDown={(e) => e.stopPropagation()}>
          <button className={iconBtn} onClick={insertDate} title="插入日期（⌥D）">
            <Calendar size={13} />
          </button>
          <button className={iconBtn} onClick={insertTime} title="插入时间（⌥T）">
            <Clock size={13} />
          </button>
          <button className={iconBtn} onClick={insertDateTime} title="插入日期+时间（⌥⇧T）">
            <CalendarClock size={13} />
          </button>
          <button
            className={iconBtn}
            onClick={() => {
              if (note.preview) onUpdate(note.id, { preview: false })
              else switchToPreview()
            }}
            title={note.preview ? '编辑 Markdown（⌘E）' : '预览渲染（⌘E）'}
          >
            {note.preview ? <PencilLine size={13} /> : <Eye size={13} />}
          </button>
          <button className={iconBtn} onClick={() => exportNote(note)} title="导出为 .md 文件">
            <Download size={13} />
          </button>
          <button
            className={`${iconBtn} ${note.pinned ? '!text-blue-600' : ''}`}
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
            title={note.pinned ? '取消置顶' : '置顶显示（浮在其他便签之上）'}
          >
            <Pin size={13} className={note.pinned ? 'fill-current' : ''} />
          </button>
          {/* 换色 */}
          <div className="relative">
            <button
              className={`${iconBtn} !p-[5px]`}
              onClick={() => setColorPickerOpen((v) => !v)}
              title="更换颜色"
            >
              <span
                className="block w-[11px] h-[11px] rounded-full border border-black/20"
                style={{ backgroundColor: colors.bg }}
              />
            </button>
            {colorPickerOpen && (
              <div
                className="absolute right-0 top-6 flex flex-col gap-1.5 p-1.5 rounded-md bg-white/95 shadow-lg border border-black/10 z-50"
                onPointerLeave={() => setColorPickerOpen(false)}
              >
                <div className="flex gap-1">
                  {COLOR_ORDER.map((c) => (
                    <button
                      key={c}
                      className="w-4 h-4 rounded-full border border-black/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: NOTE_COLORS[c].bg }}
                      onClick={() => {
                        onUpdate(note.id, { color: c })
                        setColorPickerOpen(false)
                      }}
                    />
                  ))}
                </div>
                <button
                  className={`flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] transition-colors ${
                    note.translucent ? 'text-blue-600 font-medium' : 'text-black/55 hover:bg-black/5'
                  }`}
                  onClick={() => {
                    onUpdate(note.id, { translucent: !note.translucent })
                    setColorPickerOpen(false)
                  }}
                  title="半透明磨砂效果（经典 Stickies Translucent）"
                >
                  <span
                    className={`w-3 h-3 rounded border ${
                      note.translucent ? 'bg-white/50 border-blue-500' : 'border-black/30'
                    }`}
                  />
                  半透明
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {!note.collapsed && (
        <div className="flex-1 min-h-0 relative flex flex-col">
          <div className="flex-1 min-h-0">
            {note.preview ? (
              <div
                ref={previewRef}
                className="h-full overflow-y-auto px-3 py-2 select-text"
                onDoubleClick={() => onUpdate(note.id, { preview: false })}
                title="双击切换到编辑"
              >
                <Markdown source={note.content} />
                <div className="mt-3 pt-1 border-t border-black/10 text-[10px] text-black/40">
                  更新于 {formatUpdatedAt(note.updatedAt)}
                </div>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                className="w-full h-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-black/80 outline-none placeholder:text-black/30"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                placeholder="用 Markdown 记录点什么…"
                value={note.content}
                onChange={(e) => onUpdate(note.id, { content: e.target.value })}
                onPaste={handlePaste}
                spellCheck={false}
              />
            )}
          </div>
          {!note.preview && (
            <FormatBar
              barColor={note.translucent ? `${colors.bar}b3` : colors.bar}
              onColor={applyTextColor}
              onClearColor={clearTextColor}
              onEmoji={insertEmoji}
              onTable={insertTable}
              onArchive={archiveTasks}
            />
          )}
          {/* 语法清理提示 */}
          {cleanupToast && (
            <div className="absolute left-2 bottom-2 z-20 max-w-[85%] rounded-full bg-black/70 text-white text-[11px] px-2.5 py-1 pointer-events-none">
              {cleanupToast}
            </div>
          )}
          {/* 右键菜单：任务状态 / 转换为任务 */}
          {ctxMenu && (
            <>
              <div
                className="fixed inset-0 z-30 cursor-default"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setCtxMenu(null)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setCtxMenu(null)
                }}
              />
              <div
                className="absolute z-40 rounded-lg bg-white/95 backdrop-blur shadow-xl border border-black/15 p-1"
                style={{
                  left: Math.min(ctxMenu.x, note.width - 130),
                  top: Math.min(ctxMenu.y, note.height - 170),
                }}
              >
                {ctxMenu.kind === 'status' ? (
                  <>
                    <div className="px-2.5 py-1 text-[10px] text-black/40">设置状态</div>
                    {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((s) => (
                      <button
                        key={s}
                        className="flex w-full items-center gap-2 px-2.5 py-1 rounded hover:bg-black/5 text-left whitespace-nowrap text-[12px] text-black/75"
                        onClick={() => {
                          setTaskStatus(ctxMenu.index, s)
                          setCtxMenu(null)
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: TASK_STATUS_META[s].color }}
                        />
                        {TASK_STATUS_META[s].label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-black/10" />
                    <button
                      className="flex w-full items-center gap-2 px-2.5 py-1 rounded hover:bg-black/5 text-left whitespace-nowrap text-[12px] text-black/55"
                      onClick={() => {
                        convertTaskBack(ctxMenu.index)
                        setCtxMenu(null)
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0 border border-black/30" />
                      转为普通条目
                    </button>
                  </>
                ) : (
                  <button
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded hover:bg-black/5 text-left whitespace-nowrap text-[12px] text-black/75"
                    onClick={() => {
                      convertToTask(ctxMenu.listIndex)
                      setCtxMenu(null)
                    }}
                  >
                    <span className="w-3.5 h-3.5 rounded-sm border border-black/40 shrink-0" />
                    转换为任务
                  </button>
                )}
              </div>
            </>
          )}
          {/* 缩放把手 */}
          <div
            className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize z-10"
            onPointerDown={startResize}
            style={{
              background:
                'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 60%, transparent 60%, transparent 70%, rgba(0,0,0,0.18) 70%, rgba(0,0,0,0.18) 80%, transparent 80%)',
            }}
          />
        </div>
      )}
    </div>
  )
})
