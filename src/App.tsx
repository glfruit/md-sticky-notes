import { useCallback, useEffect, useState } from 'react'
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

export default function App() {
  const { notes, trash, addNote, updateNote, deleteNote, bringToFront, reload, restoreTrashNote, permanentlyDeleteTrash } = useNotes()
  const [searchOpen, setSearchOpen] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [reveal, setReveal] = useState<(RevealTarget & { noteId: string }) | null>(null)
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem(PIN_KEY) === '1')
  const [sidebarHover, setSidebarHover] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(PIN_KEY, sidebarPinned ? '1' : '0')
  }, [sidebarPinned])

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

  const handleJump = useCallback(
    (jump: SearchJump) => {
      bringToFront(jump.noteId)
      setReveal({ noteId: jump.noteId, start: jump.start, end: jump.end, nonce: Date.now() })
      setSearchOpen(false)
    },
    [bringToFront],
  )

  // 侧栏选中便签：置顶、展开并短暂高亮
  const selectNote = useCallback(
    (id: string) => {
      bringToFront(id)
      updateNote(id, { collapsed: false })
      setFlashId(id)
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500)
    },
    [bringToFront, updateNote],
  )

  // 自动整理：流式排列所有便签，消除重叠；放不下的错位层叠
  const tidyNotes = useCallback(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 16
    const gap = 12
    const top = 44 // 菜单栏下方
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

      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onFocus={bringToFront}
          reveal={reveal && reveal.noteId === note.id ? reveal : null}
          flashing={flashId === note.id}
          snapTargets={notes
            .filter((o) => o.id !== note.id)
            .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.collapsed ? 28 : o.height }))}
        />
      ))}
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
          onFolderChanged={() => void reload()}
        />
      )}
    </div>
  )
}
