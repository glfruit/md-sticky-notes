import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, Clock, CalendarClock, Eye, PencilLine, Check, Download, Pin, Tag } from 'lucide-react'
import type { StickyNoteData, RevealTarget } from '@/types/note'
import { NOTE_COLORS, COLOR_ORDER } from '@/types/note'
import { formatUpdatedAt } from '@/lib/datetime'
import { deriveTitle } from '@/lib/note'
import { exportNote } from '@/lib/export'
import { cleanupMarkdown } from '@/lib/editor'
import { setTaskAtIndex, archiveCompletedTasks, convertListItemToTask, convertTaskToListItem, extractTasks, taskProgress, TASK_STATUS_META } from '@/lib/taskLines'
import type { TaskStatus } from '@/lib/taskLines'
import type { NoteGeometry } from '@/lib/layout'
import { useNoteEditor } from '@/hooks/useNoteEditor'
import { useNoteDrag } from '@/hooks/useNoteDrag'
import { useNotePreview } from '@/hooks/useNotePreview'
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
  snapTargets?: NoteGeometry[]
  /** 全库分类清单（指定分类 popover 的候选 chips） */
  categories?: string[]
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
  categories,
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
  // 指定分类 popover（换色同款模式：便签内 absolute + 指针离开关闭）
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryInput, setCategoryInput] = useState('')
  const applyCategory = (c: string | undefined) => {
    onUpdate(note.id, { category: c })
    setCategoryOpen(false)
    setCategoryInput('')
  }

  // 预览区交互半边（双通道进编辑 / 复选框 / ▾ 菜单 / 右键路由 / 搜索高亮 +
  // 任务状态·列表转换菜单状态）：hooks/useNotePreview
  const { ctxMenu, closeCtxMenu } = useNotePreview({
    previewRef,
    note,
    onUpdate,
    onRequestNoteMenu,
    reveal,
  })

  // 几何交互半边（拖动吸附 / 缩放 / 最大化）：hooks/useNoteDrag
  const { maximized, toggleMaximize, startDrag, startResize } = useNoteDrag({
    note,
    rootRef,
    snapTargets,
    scrollRef,
    canvasRef,
    onUpdate,
    onFocus,
  })
  // 关闭便签（切回预览）：先做一次 Markdown 语法检查与清理，有修复则短暂提示
  const [cleanupToast, setCleanupToast] = useState<string | null>(null)
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
          {/* 指定分类（#41）：Tag 图标，有分类时高亮琥珀 */}
          <div className="relative">
            <button
              className={`${iconBtn} ${note.category ? 'text-amber-600' : ''}`}
              onClick={() => setCategoryOpen((v) => !v)}
              title={note.category ? `分类：${note.category}（点击更改）` : '设置分类'}
            >
              <Tag size={12} />
            </button>
            {categoryOpen && (
              <div
                className="absolute right-0 top-6 flex flex-col gap-1.5 p-2 rounded-md bg-white/95 shadow-lg border border-stone-200 z-50 w-36"
                onPointerLeave={() => setCategoryOpen(false)}
              >
                <input
                  className="w-full px-1.5 py-1 text-[11px] rounded border border-stone-200 focus:outline-none focus:border-amber-500"
                  placeholder="新分类名，回车确认"
                  maxLength={24}
                  // 打开即聚焦：可直接输入，Escape 关闭语义在任意焦点状态下可达（standards）
                  autoFocus
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const c = categoryInput.trim()
                      if (c) applyCategory(c)
                    } else if (e.key === 'Escape') {
                      setCategoryOpen(false)
                    }
                  }}
                />
                {(categories ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(categories ?? []).map((c) => (
                      <button
                        key={c}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                          c === note.category
                            ? 'bg-amber-100 border-amber-400 text-amber-800'
                            : 'border-stone-200 text-black/60 hover:bg-black/5'
                        }`}
                        onClick={() => applyCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {note.category && (
                  <button
                    className="px-1 py-0.5 rounded text-[10px] text-black/50 hover:bg-black/5 text-left"
                    onClick={() => applyCategory(undefined)}
                  >
                    × 清除分类
                  </button>
                )}
              </div>
            )}
          </div>

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
