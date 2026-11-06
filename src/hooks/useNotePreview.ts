import { useCallback, useEffect, useState } from 'react'
import type { StickyNoteData, RevealTarget } from '@/types/note'
import { setTaskAtIndex } from '@/lib/taskLines'
import type { TaskStatus } from '@/lib/taskLines'
import { resolvePreviewContextMenu, stampIdx } from '@/lib/contextMenu'
import { highlightMatches } from '@/lib/highlight'

/** 预览区交互半边（自 StickyNote 拆出，#32）：双通道进编辑、复选框直标完成、
 *  ▾ 状态菜单、右键路由（单源 lib/contextMenu）与搜索高亮 effects；任务状态 /
 *  列表转换菜单的状态也迁入（属主语义不变：本便签内容操作）。纯搬迁。 */
export function useNotePreview(opts: {
  previewRef: React.RefObject<HTMLDivElement | null>
  note: StickyNoteData
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  /** 便签空白区/标题栏右键：请求 App 层弹出便签菜单（视口坐标 + 便签 id） */
  onRequestNoteMenu?: (x: number, y: number, noteId: string) => void
  /** 搜索跳转：预览模式下高亮便签内全部匹配 */
  reveal?: RevealTarget | null
}) {
  const { previewRef, note, onUpdate, onRequestNoteMenu, reveal } = opts
  // 右键菜单（任务状态 / 列表转任务）：坐标为视口系，
  // 渲染 / Escape / 钳制 / 互斥语义全在 Menu 原语（组件 JSX 持有）
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: 'status'; index: number }
    | { x: number; y: number; kind: 'convert'; listIndex: number }
    | null
  >(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

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
  }, [note.preview, note.id, note.content, previewRef, onUpdate, onRequestNoteMenu])

  // 搜索跳转：预览模式下高亮便签内全部匹配（编辑模式由 useNoteEditor 选中第一处）
  useEffect(() => {
    const root = previewRef.current
    if (!note.preview || !note.collapsed || !root) return
    if (!reveal?.query) return
    highlightMatches(root, reveal.query)
    // 内容重渲染会重建 innerHTML（高亮丢失），因此依赖 note.content 重新高亮
  }, [reveal, note.preview, note.collapsed, note.content, previewRef])

  return { ctxMenu, closeCtxMenu }
}
