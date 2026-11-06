import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, Clock, CalendarClock, Eye, PencilLine, Check, Download, Pin } from 'lucide-react'
import type { StickyNoteData, RevealTarget } from '@/types/note'
import { NOTE_COLORS, COLOR_ORDER, MIN_W, MIN_H } from '@/types/note'
import { formatUpdatedAt } from '@/lib/datetime'
import { deriveTitle } from '@/lib/note'
import { exportNote } from '@/lib/export'
import { highlightMatches } from '@/lib/highlight'
import { cleanupMarkdown } from '@/lib/editor'
import { setTaskAtIndex, archiveCompletedTasks, convertListItemToTask, convertTaskToListItem, extractTasks, taskProgress, TASK_STATUS_META } from '@/lib/taskLines'
import type { TaskStatus } from '@/lib/taskLines'
import { resolvePreviewContextMenu, stampIdx } from '@/lib/contextMenu'
import { snapValue, edgeCandidates, CANVAS_PAD, SNAP_VIEW_MARGIN } from '@/lib/layout'
import { useNoteEditor } from '@/hooks/useNoteEditor'
import { Markdown } from './Markdown'
import { FormatBar } from './FormatBar'
import { Menu, MenuItem, MenuDivider } from './Menu'

interface Props {
  note: StickyNoteData
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  onDelete: (id: string) => void
  onFocus: (id: string) => void
  /** 搜索跳转：切到编辑模式并选中 [start, end) 区间 */
  reveal?: RevealTarget | null
  /** 便签空白区/标题栏右键：请求 App 层弹出便签菜单（视口坐标 + 便签 id） */
  onRequestNoteMenu?: (x: number, y: number, noteId: string) => void
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
  onRequestNoteMenu,
  reveal,
  flashing,
  snapTargets,
  scrollRef,
  canvasRef,
}: Props) {
  const colors = NOTE_COLORS[note.color]
  // 预览模式任务进度（无任务为 null）：标题栏徽标数据源，与 extractTasks 同源（跳过围栏代码块、归档区计入）
  const progress = note.preview ? taskProgress(note.content) : null
  const rootRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
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
  // 右键菜单（任务状态 / 列表转任务）：状态属主在便签（操作本便签内容），
  // 坐标为视口系，渲染 / Escape / 钳制 / 互斥语义全在 Menu 原语
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: 'status'; index: number }
    | { x: number; y: number; kind: 'convert'; listIndex: number }
    | null
  >(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // 便签根节点右键（标题栏/折叠条/编辑区等预览区之外）：请求 App 层便签菜单。
  // 预览区内部由上方预览监听按 resolvePreviewContextMenu 单源路由（任务/列表项菜单优先）
  const onRootContextMenu = (e: React.MouseEvent) => {
    const t = e.target
    if (t instanceof Element && previewRef.current?.contains(t)) return
    e.preventDefault()
    onRequestNoteMenu?.(e.clientX, e.clientY, note.id)
  }

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

  // 编辑器机制半边（插入 / 粘贴拖入 / 颜色 / 键盘 / 光标与搜索选中）：hooks/useNoteEditor
  const {
    textareaRef,
    insertDate,
    insertTime,
    insertDateTime,
    insertEmoji,
    insertTable,
    handlePaste,
    handleDrop,
    handleDragOver,
    applyTextColor,
    clearTextColor,
    handleKeyDown,
  } = useNoteEditor({ note, onUpdate, onFocus, switchToPreview, reveal })

  // 预览区交互：
  // - 双击（dblclick + pointerup 时间戳双通道）进入编辑，兼容不派发 dblclick 的环境
  // - 任务项不再点击循环切换状态（易误触）：点复选框 = 直接标记完成（再点回待办）；
  //   悬浮出现的 ▾ 展开状态菜单；右键任务项也可精确设置状态
  useEffect(() => {
    const el = previewRef.current
    if (!note.preview || !el) return
    const enterEdit = () => onUpdate(note.id, { preview: false })
    let lastUp = 0
    let lastToggle = 0
    const onDbl = (e: MouseEvent) => {
      // ▾ 箭头用于打开状态菜单，其上的双击不进编辑
      if (e.target instanceof Element && e.target.closest('.task-status-trigger')) return
      enterEdit()
    }
    // 用位移判定拖拽（拖选文字）：拖动超过阈值不当作点击
    let downX = 0
    let downY = 0
    const onDownPos = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    // 任务项序号：读 decorateTasks 盖的 data-task-idx（与源文任务行序对齐；未盖章 → -1 不响应）
    const taskIndexOf = (node: Element | null): number => {
      const li = node?.closest('li.task-item') as HTMLLIElement | null
      if (!li || !el.contains(li)) return -1
      return stampIdx(li, 'taskIdx')
    }
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return
      // 注意必须是 Element 而非 HTMLElement：▾ 按钮里的内联 svg 不是 HTMLElement
      const t = e.target
      if (!(t instanceof Element)) return
      // 悬浮 ▾ 箭头：在箭头处展开状态菜单
      if (t.closest('.task-status-trigger')) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
        const idx = taskIndexOf(t)
        if (idx >= 0) setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'status', index: idx })
        return
      }
      // 复选框：点击直接标记完成；已完成再点回待办
      if (t instanceof HTMLInputElement && t.type === 'checkbox') {
        const now = Date.now()
        if (now - lastToggle < 300) return
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
        lastToggle = now
        const li = t.closest('li.task-item') as HTMLLIElement | null
        const idx = taskIndexOf(t)
        if (!li || idx < 0) return
        const status: TaskStatus = li.dataset.status === 'done' ? 'todo' : 'done'
        const next = setTaskAtIndex(note.content, idx, status)
        if (next !== null) onUpdate(note.id, { content: next })
        return
      }
      // 其余区域（含任务项文本）：双击进编辑
      const now = Date.now()
      if (now - lastUp < 450) {
        lastUp = 0
        enterEdit()
      } else {
        lastUp = now
      }
    }
    const onClickCap = (e: MouseEvent) => {
      // 阻止原生 checkbox 默认翻转（勾选状态由源码驱动，pointerup 已处理）
      if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
        e.preventDefault()
      }
    }
    // 右键路由单源在 lib/contextMenu：盖章任务项 → 状态菜单；盖章列表项 → 转换；
    // 预览空白 → App 便签菜单；未盖章 li → 不响应（仍吞掉原生菜单）
    const onContext = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const routed = resolvePreviewContextMenu(t, el)
      e.preventDefault()
      if (routed === null) return
      if (routed.kind === 'noteMenu') {
        onRequestNoteMenu?.(e.clientX, e.clientY, note.id)
        return
      }
      if (routed.kind === 'task') {
        setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'status', index: routed.index })
      } else {
        setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'convert', listIndex: routed.listIndex })
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
  }, [note.preview, note.id, note.content, onUpdate, onRequestNoteMenu])

  // 搜索跳转：预览模式下高亮便签内全部匹配（编辑模式由上方 effect 选中第一处）
  useEffect(() => {
    const root = previewRef.current
    if (!note.preview || note.collapsed || !root) return
    if (!reveal?.query) return
    highlightMatches(root, reveal.query)
    // 内容重渲染会重建 innerHTML（高亮丢失），因此依赖 note.content 重新高亮
  }, [reveal, note.preview, note.collapsed, note.content])

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
          // 视口边缘（随滚动位置换算）+ 其他便签边缘（对齐候选线 lib/layout）
          const vw = sc.clientWidth
          const vh = sc.clientHeight
          const xs: number[] = [
            sc.scrollLeft + SNAP_VIEW_MARGIN,
            sc.scrollLeft + vw - SNAP_VIEW_MARGIN - note.width,
          ]
          const ys: number[] = [
            sc.scrollTop + SNAP_VIEW_MARGIN,
            sc.scrollTop + vh - SNAP_VIEW_MARGIN - note.height,
          ]
          for (const b of targets) {
            const edges = edgeCandidates(b, { width: note.width, height: note.height })
            xs.push(...edges.xs)
            ys.push(...edges.ys)
          }
          x = snapValue(x, xs)
          y = snapValue(y, ys)
        }
        root.style.left = `${x}px`
        root.style.top = `${y}px`
        // 便签拖出当前画布时直接撑大（pointerup 后由 React 状态接管尺寸）
        const canvas = canvasRef?.current
        if (canvas) {
          const needW = x + note.width + CANVAS_PAD
          const needH = y + note.height + CANVAS_PAD
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

  const iconBtn = 'p-1 rounded hover:bg-stone-900/8 text-stone-500 hover:text-stone-800 transition-colors'

  // 状态菜单对应的任务当前状态（菜单里打勾标示）
  const ctxTaskStatus =
    ctxMenu?.kind === 'status'
      ? extractTasks(note.content).find((t) => t.index === ctxMenu.index)?.status
      : undefined

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
          ? '0 1px 2px rgba(28,25,23,0.10), 0 10px 28px rgba(28,25,23,0.16), 0 0 0 3px rgba(217,119,6,0.75)'
          : '0 1px 2px rgba(28,25,23,0.10), 0 10px 28px rgba(28,25,23,0.16)',
        transition: 'box-shadow 0.3s ease',
      }}
      onPointerDown={() => onFocus(note.id)}
      onKeyDown={handleKeyDown}
      onContextMenu={onRootContextMenu}
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

        {/* 标题 + 预览模式任务进度（无任务不显示，编辑模式不渲染） */}
        <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0 px-1">
          <span className="text-[12px] font-medium text-black/60 truncate">
            {deriveTitle(note.content)}
          </span>
          {progress && (
            <span
              className="shrink-0 whitespace-nowrap text-[10px] leading-none font-medium tabular-nums"
              style={{
                color:
                  progress.done === progress.total
                    ? TASK_STATUS_META.done.color
                    : TASK_STATUS_META.todo.color,
              }}
              title={`已完成 ${progress.done}/${progress.total} 个任务`}
              aria-label={`已完成 ${progress.done}/${progress.total} 个任务`}
            >
              {progress.done}/{progress.total}
            </span>
          )}
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
            className={`${iconBtn} ${note.pinned ? '!text-amber-600' : ''}`}
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
                className="absolute right-0 top-6 flex flex-col gap-1.5 p-1.5 rounded-md bg-white/95 shadow-lg border border-stone-200 z-50"
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
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('.task-status-trigger')) return
                  onUpdate(note.id, { preview: false })
                }}
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
          {/* 右键菜单：任务状态 / 转换为任务（Menu 原语，便签菜单由 App 持有） */}
          {ctxMenu && (
            <Menu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtxMenu}>
              {ctxMenu.kind === 'status' ? (
                <>
                  <div className="px-2.5 py-1 text-[10px] text-black/40">设置状态</div>
                  {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((s) => (
                    <MenuItem
                      key={s}
                      icon={
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: TASK_STATUS_META[s].color }}
                        />
                      }
                      onClick={() => {
                        setTaskStatus(ctxMenu.index, s)
                        closeCtxMenu()
                      }}
                    >
                      {TASK_STATUS_META[s].label}
                      {s === ctxTaskStatus && <Check size={12} className="ml-auto text-black/45" />}
                    </MenuItem>
                  ))}
                  <MenuDivider />
                  <MenuItem
                    muted
                    icon={<span className="w-2 h-2 rounded-full shrink-0 border border-black/30" />}
                    onClick={() => {
                      convertTaskBack(ctxMenu.index)
                      closeCtxMenu()
                    }}
                  >
                    转为普通条目
                  </MenuItem>
                </>
              ) : (
                <MenuItem
                  icon={<span className="w-3.5 h-3.5 rounded-sm border border-black/40 shrink-0" />}
                  onClick={() => {
                    convertToTask(ctxMenu.listIndex)
                    closeCtxMenu()
                  }}
                >
                  转换为任务
                </MenuItem>
              )}
            </Menu>
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
