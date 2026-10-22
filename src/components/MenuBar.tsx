import { useEffect, useState } from 'react'
import { Plus, Search, StickyNote as StickyIcon, PackageOpen, PanelLeft, LayoutGrid, Cloud } from 'lucide-react'
import { formatMenuBar } from '@/lib/datetime'

interface Props {
  onNewNote: () => void
  onSearch: () => void
  onExportAll: () => void
  onTidy: () => void
  onToggleSidebar: () => void
  onOpenStorage: () => void
  sidebarPinned: boolean
}

export function MenuBar({ onNewNote, onSearch, onExportAll, onTidy, onToggleSidebar, onOpenStorage, sidebarPinned }: Props) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 10)
    return () => clearInterval(t)
  }, [])

  const btn = 'flex items-center gap-1 px-1.5 rounded hover:bg-black/10 shrink-0'
  const label = 'hidden md:inline'

  return (
    <div className="fixed top-0 left-0 right-0 h-7 z-[9999] flex items-center px-3 gap-2 bg-white/55 backdrop-blur-md border-b border-black/10 text-[13px] text-black/80 select-none whitespace-nowrap overflow-hidden">
      <StickyIcon size={14} className="text-black/70 shrink-0" />
      <span className="font-semibold shrink-0">MD 便签</span>
      <button
        className={`${btn} ${sidebarPinned ? 'bg-black/10' : ''}`}
        onClick={onToggleSidebar}
        title="固定 / 隐藏左侧导航栏（⌥B）"
      >
        <PanelLeft size={13} />
        <span className={label}>导航</span>
      </button>
      <button className={btn} onClick={onNewNote} title="新建便签（⌥N）">
        <Plus size={13} />
        <span className={label}>新建</span>
      </button>
      <button className={btn} onClick={onSearch} title="搜索所有便签（⌘F）">
        <Search size={13} />
        <span className={label}>搜索</span>
      </button>
      <button className={btn} onClick={onTidy} title="自动排列所有便签，消除重叠">
        <LayoutGrid size={13} />
        <span className={label}>整理</span>
      </button>
      <button className={btn} onClick={onExportAll} title="把全部便签打包导出为 zip">
        <PackageOpen size={13} />
        <span className={label}>导出</span>
      </button>
      <button className={btn} onClick={onOpenStorage} title="存储与多机同步设置">
        <Cloud size={13} />
        <span className={label}>同步</span>
      </button>
      <span className="hidden lg:inline text-black/40 truncate min-w-0">
        ⌥D 日期 · ⌥T 时间 · ⌥⇧T 日期+时间 · ⌘E 预览 · ⌘F 搜索 · ⌥B 导航
      </span>
      <div className="flex-1" />
      <span className="tabular-nums text-black/70 shrink-0">{formatMenuBar(now)}</span>
    </div>
  )
}
