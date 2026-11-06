import { useCallback, useRef, useState } from 'react'
import type { StickyNoteData } from '@/types/note'
import { MIN_W, MIN_H } from '@/types/note'
import { snapValue, edgeCandidates, maximizedRect, CANVAS_PAD, SNAP_VIEW_MARGIN } from '@/lib/layout'

/** 边缘自动滚动手感参数（非几何域，不入 lib/layout）：指针距滚动层可视边缘
 *  28px 内开始滚动（与 MENU_BAR_H 同值巧合），每帧步进 14px */
const AUTO_SCROLL_EDGE = 28
const AUTO_SCROLL_SPEED = 14

/** 几何交互半边（自 StickyNote 拆出，#32）：拖动吸附 / 缩放 / 最大化。
 *  纯搬迁：拖动直写 DOM、pointerup 一次提交的既定模式不变，吸附与画布扩展的
 *  纯计算单源在 lib/layout。rootRef 由组件持有传入（窗外切预览判定也用它）。 */
export function useNoteDrag(opts: {
  note: StickyNoteData
  rootRef: React.RefObject<HTMLDivElement | null>
  /** 全部便签的几何信息（吸附候选，内部排除自身） */
  snapTargets?: { id: string; x: number; y: number; width: number; height: number }[]
  /** 桌面滚动层：拖动坐标换算 / 边缘自动滚动 */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  /** 滚动画布：便签拖出视口时撑大内容区 */
  canvasRef?: React.RefObject<HTMLDivElement | null>
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  onFocus: (id: string) => void
}) {
  const { note, rootRef, snapTargets, scrollRef, canvasRef, onUpdate, onFocus } = opts
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
        ...maximizedRect({ width: window.innerWidth, height: window.innerHeight }),
        collapsed: false,
      })
      setMaximized(true)
    }
  }, [maximized, note.id, note.x, note.y, note.width, note.height, onUpdate])

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
      let raf = 0
      const tick = () => {
        if (sc) {
          const dx = pointerX - layerLeft
          const dy = pointerY - layerTop
          if (dx < AUTO_SCROLL_EDGE) sc.scrollLeft -= AUTO_SCROLL_SPEED
          else if (dx > sc.clientWidth - AUTO_SCROLL_EDGE) sc.scrollLeft += AUTO_SCROLL_SPEED
          if (dy < AUTO_SCROLL_EDGE) sc.scrollTop -= AUTO_SCROLL_SPEED
          else if (dy > sc.clientHeight - AUTO_SCROLL_EDGE) sc.scrollTop += AUTO_SCROLL_SPEED
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
    [note.id, note.width, note.height, rootRef, onUpdate, onFocus],
  )

  return { maximized, toggleMaximize, startDrag, startResize }
}
