import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampMenuPosition } from '@/lib/menu'

/** 菜单原语：唯一属主（standards.md「架构分层」）。新菜单一律消费这里，
 *  不手写 backdrop / Escape / 钳制——此前 App noteMenu 与 StickyNote ctxMenu 两套平行样板即本票要消灭的病。
 *  语义：portal 到 body（不受便签树 overflow 裁切）、视口坐标 fixed、实测尺寸钳进视口、
 *  Escape / 点外部 / 右键外部关闭、全局互斥（同时至多一个）。 */

/** 全局互斥登记：开新菜单先关上一个（菜单状态分属不同组件，无共同父级可协调） */
let closeActiveMenu: (() => void) | null = null

interface MenuProps {
  /** 期望左上角（视口坐标，右键落点 / 触发元素位置） */
  x: number
  y: number
  onClose: () => void
  children: React.ReactNode
}

export function Menu({ x, y, onClose, children }: MenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // null = 尚未实测尺寸：先隐藏渲染量宽高，钳制定位后再显示（不闪跳）
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // 互斥：挂载时关掉上一个菜单；卸载时若是自己登记的则清空
  useEffect(() => {
    closeActiveMenu?.()
    closeActiveMenu = onClose
    return () => {
      if (closeActiveMenu === onClose) closeActiveMenu = null
    }
  }, [onClose])

  // Escape 关闭（window 级：菜单打开时焦点通常不在菜单上）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 渲染后实测面板尺寸，把左上角钳进视口（magic number 150/60/130/170 退役）
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight))
  }, [x, y])

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] cursor-default"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={panelRef}
        className="fixed z-[9999] rounded-lg bg-white/95 backdrop-blur shadow-xl border border-stone-200 p-1"
        style={{ left: pos?.x ?? x, top: pos?.y ?? y, visibility: pos ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

interface MenuItemProps {
  /** 左侧图标 / 色点（可选） */
  icon?: React.ReactNode
  /** 弱化样式（次要动作，如「转普通条目」） */
  muted?: boolean
  onClick: () => void
  children: React.ReactNode
}

export function MenuItem({ icon, muted, onClick, children }: MenuItemProps) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 rounded hover:bg-black/5 text-left whitespace-nowrap text-[12px] ${
        muted ? 'text-black/55' : 'text-black/75'
      }`}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 border-t border-black/10" />
}
