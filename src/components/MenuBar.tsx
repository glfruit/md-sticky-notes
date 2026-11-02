import { useEffect, useState } from 'react'
import { Plus, Search, StickyNote as StickyIcon, PackageOpen, PanelLeft, LayoutGrid, Cloud, AlarmClock } from 'lucide-react'
import { formatMenuBar } from '@/lib/datetime'

interface Props {
  onNewNote: () => void
  onSearch: () => void
  onExportAll: () => void
  onTidy: () => void
  onToggleSidebar: () => void
  onOpenStorage: () => void
  sidebarPinned: boolean
  /** 逾期 / 今天到期的未完成任务数（0 不显示） */
  dueTaskCount: number
}

export function MenuBar({ onNewNote, onSearch, onExportAll, onTidy, onToggleSidebar, onOpenStorage, sidebarPinned, dueTaskCount }: Props) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 10)
    return () => clearInterval(t)
  }, [])

  const btn = 'flex items-center gap-1 px-1.5 h-5 rounded-md hover:bg-stone-900/8 shrink-0 transition-colors'
  const label = 'hidden md:inline'

  return (
    <div className="fixed top-0 left-0 right-0 h-7 z-[9999] flex items-center px-3 gap-2 bg-white/60 backdrop-blur-md border-b border-stone-900/10 text-[13px] text-stone-800 select-none whitespace-nowrap overflow-hidden">
      <StickyIcon size={14} className="text-amber-600 shrink-0" />
      <span className="font-semibold shrink-0">MD 便签</span>
      <button
        className={`${btn} ${sidebarPinned ? 'bg-stone-900/10' : ''}`}
        onClick={onToggleSidebar}
        title="固定 / 隐藏左侧导航栏（⌥B）"
      >
        <PanelLeft size={13} />
        <span className={label}>导航</span>
      </button>
      <button
        className="flex items-center gap-1 px-2 h-5 rounded-md bg-accent hover:bg-accent-hover text-white shrink-0 transition-colors"
        onClick={onNewNote}
        title="新建便签（⌥N）"
      >
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
      <span className="hidden lg:inline text-stone-400 truncate min-w-0">
        ⌥D 日期 · ⌥T 时间 · ⌥⇧T 日期+时间 · ⌘E 预览 · ⌘F 搜索 · ⌥B 导航
      </span>
      <div className="flex-1" />
      {dueTaskCount > 0 && (
        <button
          className="flex items-center gap-1 h-5 px-1.5 rounded-full bg-red-500/12 text-red-600 text-[11px] font-semibold shrink-0 hover:bg-red-500/20 transition-colors"
          onClick={onToggleSidebar}
          title="有逾期 / 今天到期的任务，点击打开任务列表"
        >
          <AlarmClock size={12} />
          {dueTaskCount}
        </button>
      )}
      <span className="tabular-nums text-stone-600 shrink-0">{formatMenuBar(now)}</span>
    </div>
  )
}
