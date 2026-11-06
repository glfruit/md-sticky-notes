import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { StickyNote } from '@/components/StickyNote'
import type { RevealTarget } from '@/types/note'
import { Menu, MenuItem } from '@/components/Menu'
import { MenuBar } from '@/components/MenuBar'
import { SearchPanel } from '@/components/SearchPanel'
import type { SearchJump } from '@/components/SearchPanel'
import { Sidebar } from '@/components/Sidebar'
import { StorageSettings } from '@/components/StorageSettings'
import { UpdateBanner } from '@/components/UpdateBanner'
import { useReminders } from '@/hooks/useReminders'
import { isTauri } from '@/lib/storage'
import { exportAllNotes } from '@/lib/export'
import { extractTasks, dueUrgency } from '@/lib/taskLines'
import {
  tidyLayout,
  noteRect,
  canvasExtent,
  revealScroll,
  centerScroll,
  type NoteGeometry,
} from '@/lib/layout'
import './App.css'

const PIN_KEY = 'md-sticky-notes:sidebar-pinned'

export default function App() {
  const { notes, trash, addNote, updateNote, deleteNote, bringToFront, switchFolder, cleanAttachments, flushPendingSaves, restoreTrashNote, permanentlyDeleteTrash } = useNotes()
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [reveal, setReveal] = useState<(RevealTarget & { noteId: string }) | null>(null)
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem(PIN_KEY) === '1')
  const [sidebarHover, setSidebarHover] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    localStorage.setItem(PIN_KEY, sidebarPinned ? '1' : '0')
  }, [sidebarPinned])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 到点系统通知（桌面版）
  useReminders(notes)

  // 全局热键 / 托盘「新建便签」：监听后端事件，剪贴板文本自动预填
  // （可在「同步」设置里关闭——剪贴板可能刚复制过密码，不希望落进同步文件）
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<string>('quick-new-note', (e) => {
        const prefill =
          localStorage.getItem('md-sticky-notes:clipboard-prefill') !== '0' &&
          typeof e.payload === 'string'
        addNote(prefill ? (e.payload as string) : '')
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

  // 所有便签的几何信息（吸附候选 + 画布尺寸）；折叠→条带映射单源 noteRect
  const geometries = useMemo<NoteGeometry[]>(
    () => notes.map((n) => ({ id: n.id, ...noteRect(n) })),
    [notes],
  )

  // 滚动画布尺寸：至少铺满滚动层，随最远便签边缘扩展（滚动条由此出现）
  const canvasSize = useMemo(() => canvasExtent(geometries, viewport), [geometries, viewport])

  // 把指定便签滚进可视区（侧栏选中 / 搜索跳转用）：计算在 lib/layout revealScroll
  const scrollToNote = useCallback((x: number, y: number, width: number, height: number) => {
    const sc = scrollRef.current
    if (!sc) return
    const next = revealScroll(
      { x, y, width, height },
      { left: sc.scrollLeft, top: sc.scrollTop },
      { width: sc.clientWidth, height: sc.clientHeight },
    )
    sc.scrollLeft = next.left
    sc.scrollTop = next.top
  }, [])

  // 便签居中完整显示（右键菜单）：无论当前在哪都滚到正中；计算在 lib/layout centerScroll
  const scrollNoteCenter = useCallback((x: number, y: number, width: number, height: number) => {
    const sc = scrollRef.current
    if (!sc) return
    const next = centerScroll(
      { x, y, width, height },
      { width: sc.clientWidth, height: sc.clientHeight },
      { width: sc.scrollWidth, height: sc.scrollHeight },
    )
    sc.scrollLeft = next.left
    sc.scrollTop = next.top
  }, [])

  const centerNote = useCallback(
    (id: string) => {
      const target = notes.find((n) => n.id === id)
      if (!target) return
      bringToFront(id)
      if (target.collapsed) updateNote(id, { collapsed: false })
      requestAnimationFrame(() =>
        scrollNoteCenter(target.x, target.y, target.width, target.height),
      )
    },
    [notes, bringToFront, updateNote, scrollNoteCenter],
  )

  // 便签右键菜单：状态属主在 App（「居中完整显示」是跨便签操作），
  // 渲染 / Escape / 钳制 / 互斥语义全在 Menu 原语
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; noteId: string } | null>(null)
  const openNoteMenu = useCallback((x: number, y: number, noteId: string) => {
    setNoteMenu({ x, y, noteId })
  }, [])
  const closeNoteMenu = useCallback(() => setNoteMenu(null), [])

  const handleJump = useCallback(
    (jump: SearchJump) => {
      const target = notes.find((n) => n.id === jump.noteId)
      bringToFront(jump.noteId)
      setReveal({ noteId: jump.noteId, start: jump.start, end: jump.end, query: jump.query, nonce: Date.now() })
      setSearchOpen(false)
      if (target) {
        // 等展开 / 切编辑生效后再滚动（折叠便签按标题栏条带算可见性）
        requestAnimationFrame(() =>
          scrollToNote(target.x, target.y, target.width, noteRect(target).height),
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

  // 自动整理：一屏收纳（lib 布局纯函数产补丁）——原尺寸放不下时等比缩小，
  // 触宽度下限回退续排；画布放不下仍可滚动（现状回退行为）
  const tidyNotes = useCallback(() => {
    const patches = tidyLayout(
      notes.map((n) => ({ id: n.id, width: n.width, height: n.height, collapsed: n.collapsed, z: n.z })),
      { width: window.innerWidth, height: window.innerHeight },
    )
    for (const p of patches) updateNote(p.id, p)
    // 整理完回到左上角
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
  }, [notes, updateNote])

  // 菜单栏逾期/今天到期的任务数（点击打开侧栏任务页）
  const dueTaskCount = useMemo(
    () =>
      notes.reduce(
        (sum, n) =>
          sum +
          extractTasks(n.content).filter((t) => {
            if (!t.due || t.status === 'done' || t.status === 'cancelled') return false
            return dueUrgency(t.due).level === 'overdue' || dueUrgency(t.due).level === 'today'
          }).length,
        0,
      ),
    [notes],
  )

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
        dueTaskCount={dueTaskCount}
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
        <div ref={canvasRef} className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onFocus={bringToFront}
              onRequestNoteMenu={openNoteMenu}
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
          <div className="text-stone-600 text-sm bg-white/70 border border-stone-900/10 backdrop-blur px-4 py-2 rounded-lg">
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
          onFlushPending={flushPendingSaves}
          onCleanAttachments={cleanAttachments}
        />
      )}
      <UpdateBanner />

      {/* 便签右键菜单（Menu 原语：视口坐标 fixed，贴住真实点击位置） */}
      {noteMenu && (
        <Menu x={noteMenu.x} y={noteMenu.y} onClose={closeNoteMenu}>
          <MenuItem
            icon={<LocateFixed size={12} className="text-black/45 shrink-0" />}
            onClick={() => {
              centerNote(noteMenu.noteId)
              closeNoteMenu()
            }}
          >
            居中完整显示
          </MenuItem>
        </Menu>
      )}
    </div>
  )
}
