import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotes } from '@/hooks/useNotes'
import { StickyNote } from '@/components/StickyNote'
import type { RevealTarget } from '@/components/StickyNote'
import { MenuBar } from '@/components/MenuBar'
import { SearchPanel } from '@/components/SearchPanel'
import type { SearchJump } from '@/components/SearchPanel'
import { Sidebar } from '@/components/Sidebar'
import { StorageSettings } from '@/components/StorageSettings'
import { useReminders } from '@/hooks/useReminders'
import { isTauri } from '@/lib/storage'
import { exportAllNotes } from '@/lib/export'
import './App.css'

const PIN_KEY = 'md-sticky-notes:sidebar-pinned'
/** 菜单栏高度（滚动层起始 y） */
const MENU_H = 28

export default function App() {
  const { notes, trash, addNote, updateNote, deleteNote, bringToFront, switchFolder, cleanAttachments, restoreTrashNote, permanentlyDeleteTrash } = useNotes()
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [reveal, setReveal] = useState<(RevealTarget & { noteId: string }) | null>(null)
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem(PIN_KEY) === '1')
  const [sidebarHover, setSidebarHover] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    localStorage.setItem(PIN_KEY, sidebarPinned ? '1' : '0')
  }, [sidebarPinned])

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 到点系统通知（桌面版）
  useReminders(notes)

  // 全局热键 / 托盘「新建便签」：监听后端事件，剪贴板文本自动预填
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<string>('quick-new-note', (e) => {
        addNote(typeof e.payload === 'string' ? e.payload : '')
      }).then((fn) => {
        unlisten = fn
      }),
    )
    return () => unlisten?.()
  }, [addNote])

  // 全局快捷键：⌥N 新建；⌘F / ⌥F 搜索；⌥B 固定 / 隐藏侧栏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        addNote()
      } else if ((e.metaKey || e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarPinned((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addNote])

  // 所有便签的几何信息（吸附候选 + 画布尺寸）
  const geometries = useMemo(
    () =>
      notes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.collapsed ? 28 : n.height,
      })),
    [notes],
  )

  // 滚动画布尺寸：至少铺满滚动层，随最远便签边缘扩展（滚动条由此出现）
  const canvasSize = useMemo(() => {
    let w = viewport.w
    let h = viewport.h - MENU_H
    for (const g of geometries) {
      w = Math.max(w, g.x + g.width + 24)
      h = Math.max(h, g.y + g.height + 24)
    }
    return { w, h }
  }, [geometries, viewport])

  // 把指定便签滚进可视区（侧栏选中 / 搜索跳转用）
  const scrollToNote = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const sc = scrollRef.current
      if (!sc) return
      const vw = sc.clientWidth
      const vh = sc.clientHeight
      if (x - 8 < sc.scrollLeft || x + width + 8 > sc.scrollLeft + vw) {
        sc.scrollLeft = Math.max(0, x - Math.max(0, (vw - width) / 2))
      }
      if (y - 8 < sc.scrollTop || y + 40 > sc.scrollTop + vh) {
        sc.scrollTop = Math.max(0, y - Math.max(0, (vh - Math.min(height, vh)) / 2))
      }
    },
    [],
  )

  const handleJump = useCallback(
    (jump: SearchJump) => {
      const target = notes.find((n) => n.id === jump.noteId)
      bringToFront(jump.noteId)
      setReveal({ noteId: jump.noteId, start: jump.start, end: jump.end, nonce: Date.now() })
      setSearchOpen(false)
      if (target) {
        // 等展开 / 切编辑生效后再滚动
        requestAnimationFrame(() =>
          scrollToNote(target.x, target.y, target.width, target.collapsed ? 28 : target.height),
        )
      }
    },
    [notes, bringToFront, scrollToNote],
  )

  // 侧栏选中便签：置顶、展开并短暂高亮
  const selectNote = useCallback(
    (id: string) => {
      const target = notes.find((n) => n.id === id)
      bringToFront(id)
      updateNote(id, { collapsed: false })
      setFlashId(id)
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500)
      if (target && target.collapsed) {
        requestAnimationFrame(() => scrollToNote(target.x, target.y, target.width, target.height))
      }
    },
    [notes, bringToFront, updateNote, scrollToNote],
  )

  // 自动整理：流式排列所有便签，消除重叠；放不下的错位层叠
  const tidyNotes = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight - MENU_H // 滚动层高度
    const margin = 16
    const gap = 12
    const top = 16
    let x = margin
    let y = top
    let rowH = 0
    let overflow = 0
    const sorted = [...notes].sort((a, b) => a.z - b.z)
    for (const n of sorted) {
      const w = Math.min(n.width, vw - margin * 2)
      const h = n.collapsed ? 28 : Math.min(n.height, vh - top - margin)
      if (x > margin && x + w > vw - margin) {
        x = margin
        y += rowH + gap
        rowH = 0
      }
      if (y + h > vh - margin) {
        // 垂直方向放不下了：错位起一叠，尽量避免完全遮住
        overflow += 1
        x = margin + overflow * 28
        y = top + overflow * 28
        rowH = 0
      }
      if (n.x !== x || n.y !== y) updateNote(n.id, { x, y })
      x += w + gap
      rowH = Math.max(rowH, h)
    }
    // 整理完回到左上角
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
  }, [notes, updateNote])

  const sidebarVisible = sidebarPinned || sidebarHover

  return (
    <div className="desktop fixed inset-0 overflow-hidden">
      <MenuBar
        onNewNote={() => addNote()}
        onSearch={() => setSearchOpen(true)}
        onExportAll={() => void exportAllNotes(notes)}
        onTidy={tidyNotes}
        onToggleSidebar={() => setSidebarPinned((v) => !v)}
        onOpenStorage={() => setStorageOpen(true)}
        sidebarPinned={sidebarPinned}
      />

      {/* 左侧边缘热区：鼠标靠左滑出导航栏 */}
      {!sidebarVisible && (
        <div
          className="fixed left-0 top-7 bottom-0 w-2 z-[9997]"
          onPointerEnter={() => setSidebarHover(true)}
        />
      )}
      <Sidebar
        notes={notes}
        trash={trash}
        visible={sidebarVisible}
        pinned={sidebarPinned}
        onTogglePin={() => setSidebarPinned((v) => !v)}
        onSelect={selectNote}
        onDelete={deleteNote}
        onNewNote={() => addNote()}
        onHoverLeave={() => setSidebarHover(false)}
        onRestore={restoreTrashNote}
        onPermanentDelete={permanentlyDeleteTrash}
      />

      {/* 滚动桌面：便签拖出视口时画布扩展、出现滚动条 */}
      <div ref={scrollRef} className="desktop-scroll absolute inset-x-0 top-7 bottom-0 overflow-auto">
        <div ref={canvasRef} className="relative" style={{ width: canvasSize.w, height: canvasSize.h }}>
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onFocus={bringToFront}
              reveal={reveal && reveal.noteId === note.id ? reveal : null}
              flashing={flashId === note.id}
              snapTargets={geometries}
              scrollRef={scrollRef}
              canvasRef={canvasRef}
            />
          ))}
        </div>
      </div>

      {notes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white/80 text-sm bg-black/25 backdrop-blur px-4 py-2 rounded-lg">
            没有便签了 — 按 ⌥N 或点菜单栏「新建」
          </div>
        </div>
      )}
      {searchOpen && (
        <SearchPanel notes={notes} onJump={handleJump} onClose={() => setSearchOpen(false)} />
      )}
      {storageOpen && (
        <StorageSettings
          onClose={() => setStorageOpen(false)}
          onSwitchFolder={switchFolder}
          onCleanAttachments={cleanAttachments}
        />
      )}
    </div>
  )
}
