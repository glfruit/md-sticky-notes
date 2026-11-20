import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Pin, PinOff, Plus, Trash2, StickyNote, ListChecks, FolderOpen, Hash } from 'lucide-react'
import { FilterMenuButton } from './FilterMenuButton'
import { Menu, MenuItem } from './Menu'
import type { StickyNoteData } from '@/types/note'
import { NOTE_COLORS } from '@/types/note'
import { deriveTitle, extractTags, collectCategories, filterByCategory, categoryFilterOptions } from '@/lib/note'
import { formatUpdatedAt } from '@/lib/datetime'
import {
  extractTasks,
  TASK_STATUS_META,
  dueUrgency,
  DUE_LEVEL_COLORS,
  cycleTaskAtIndex,
  setTaskPriority,
  stripPriority,
  PRIORITY_META,
  type TaskEntry,
} from '@/lib/taskLines'
import { groupTasks, TASK_GROUP_META } from '@/lib/taskGroups'
import { SIDEBAR_W } from '@/lib/layout'

interface Props {
  notes: StickyNoteData[]
  trash: StickyNoteData[]
  visible: boolean
  pinned: boolean
  onTogglePin: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewNote: () => void
  onHoverLeave: () => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  /** 任务行直改（#53）：状态循环 / 优先级设置，与便签同一条保存管线（updateNote） */
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  /** 分类筛选（#41）：选中属主在 App（同时驱动画布过滤），null=全部、''=无分类 */
  selectedCategory: string | null
  onSelectCategory: (c: string | null) => void
}

/** 去掉 markdown 符号的纯文本摘要（保留正文标点，如日期里的连字符） */
function snippet(content: string): string {
  const text = content
    .replace(/<\/?span[^>]*>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*[-*+]\s+)?(\[[ xX/?-]\]\s*)?/gm, '')
    .replace(/[*_`~>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 40) || '空白便签'
}

function NoteRow({
  note,
  onSelect,
  onDelete,
}: {
  note: StickyNoteData
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 2500)
    return () => clearTimeout(t)
  }, [confirming])

  return (
    <div className="group relative">
      <button
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-black/5 transition-colors"
        onClick={() => onSelect(note.id)}
      >
        <span
          className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
          style={{ backgroundColor: NOTE_COLORS[note.color].bg }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-black/75 truncate">
            {note.pinned && <Pin size={10} className="inline mr-1 -mt-0.5 text-amber-600" />}
            {deriveTitle(note.content)}
          </span>
          <span className="block text-[11px] text-black/45 truncate">{snippet(note.content)}</span>
          <span className="block text-[10px] text-black/30 mt-0.5">
            {formatUpdatedAt(note.updatedAt)}
          </span>
        </span>
      </button>
      {confirming ? (
        <button
          className="absolute right-2 top-2.5 text-[10px] font-medium px-1.5 h-4 rounded bg-red-500 text-white"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(note.id)
          }}
        >
          删除?
        </button>
      ) : (
        <button
          className="absolute right-2 top-2 p-1 rounded hover:bg-red-500/15 text-black/35 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(true)
          }}
          title="删除便签"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

/** 侧栏任务行（#53）：状态圆点点击循环五态（与预览 checkbox 同序 CYCLE）、
 *  行尾优先级 chip 开 Menu（🔥/⚡/🐢/清除，与便签内 ▾ 菜单同款选项）；
 *  行主体点击仍跳便签。行是容器 + 内嵌按钮结构（嵌套 button 非法）。
 *  状态/优先级写回走 onUpdate 同一条保存管线（cycleTaskAtIndex / setTaskPriority 纯函数，
 *  🔁 重复任务完成重置已在函数内处理）；置完成/废弃后行随过滤即时消失（票面确认）。 */
function TaskRow({
  note,
  task,
  onSelect,
  onUpdate,
}: {
  note: StickyNoteData
  task: TaskEntry
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
}) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const urgency = task.due ? dueUrgency(task.due) : null
  const applyContent = (next: string | null) => {
    if (next !== null) onUpdate(note.id, { content: next })
  }

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-black/5 transition-colors">
      <button
        className="p-0.5 -m-0.5 rounded shrink-0 hover:bg-black/10"
        onClick={() => applyContent(cycleTaskAtIndex(note.content, task.index))}
        title={`状态：${TASK_STATUS_META[task.status].label}（点击切换）`}
        aria-label={`切换任务状态，当前${TASK_STATUS_META[task.status].label}`}
      >
        <span
          className="block w-2 h-2 rounded-full"
          style={{ backgroundColor: TASK_STATUS_META[task.status].color }}
        />
      </button>
      <button
        className="min-w-0 flex-1 text-left text-[12px] text-black/70 truncate"
        onClick={() => onSelect(note.id)}
        title={`${deriveTitle(note.content)} · ${TASK_STATUS_META[task.status].label}`}
      >
        {task.text.includes('🔁') && <span title="重复任务">🔁 </span>}
        {stripPriority(task.text) || '（空任务）'}
      </button>
      {urgency && (
        <span
          className="shrink-0 text-[10px] font-medium px-1 rounded"
          style={{
            color: DUE_LEVEL_COLORS[urgency.level],
            backgroundColor: DUE_LEVEL_COLORS[urgency.level] + '1a',
          }}
        >
          {urgency.label}
        </span>
      )}
      <button
        // 菜单开着时也保持可见（backdrop 盖住按钮，此处只在关闭态可达——FilterMenuButton 同款）
        className={`shrink-0 w-4 h-4 rounded text-[11px] leading-none text-black/60 hover:bg-black/10 transition-opacity ${
          task.priority || menuPos ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenuPos({ x: r.left, y: r.bottom + 4 })
        }}
        title="设置优先级"
        aria-label="设置优先级"
      >
        {task.priority ?? <ChevronDown size={11} className="mx-auto" />}
      </button>
      {menuPos && (
        <Menu x={menuPos.x} y={menuPos.y} onClose={() => setMenuPos(null)}>
          {PRIORITY_META.map((p) => (
            <MenuItem
              key={p.mark}
              icon={<span className="text-[12px] leading-none w-3.5 text-center shrink-0">{p.mark}</span>}
              onClick={() => {
                applyContent(setTaskPriority(note.content, task.index, p.mark))
                setMenuPos(null)
              }}
            >
              {p.label}
              {task.priority === p.mark && <Check size={12} className="ml-auto text-black/45" />}
            </MenuItem>
          ))}
          <MenuItem
            muted
            icon={
              <span className="text-[10px] leading-none w-3.5 text-center shrink-0 text-black/30">—</span>
            }
            onClick={() => {
              applyContent(setTaskPriority(note.content, task.index, null))
              setMenuPos(null)
            }}
          >
            无优先级
          </MenuItem>
        </Menu>
      )}
    </div>
  )
}

/** 侧栏任务：按 进行中 → 快过期/逾期 → 等待 → 待办 分组，组内按截止日期升序，临期标红 */
function TaskList({
  notes,
  onSelect,
  onUpdate,
}: {
  notes: StickyNoteData[]
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
}) {
  const groups = useMemo(
    () =>
      groupTasks(
        notes.flatMap((note) =>
          extractTasks(note.content)
            .filter((t) => t.status === 'todo' || t.status === 'progress' || t.status === 'waiting')
            .map((task) => ({ note, task })),
        ),
      ),
    [notes],
  )

  if (groups.length === 0) {
    return <div className="px-3 py-6 text-center text-[12px] text-black/40">没有待办任务 🎉</div>
  }

  return (
    <>
      {groups.map(({ group, rows }) => (
        <div key={group}>
          <div className="px-3 pt-2.5 pb-0.5 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-black/45">{TASK_GROUP_META[group].label}</span>
            <span className="text-[10px] text-black/30">{rows.length}</span>
          </div>
          {rows.map(({ note, task }) => (
            <TaskRow
              key={`${note.id}-${task.index}`}
              note={note}
              task={task}
              onSelect={onSelect}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      ))}
    </>
  )
}

/** 回收站列表：恢复 / 彻底删除 */
function TrashList({
  trash,
  onRestore,
  onPermanentDelete,
}: {
  trash: StickyNoteData[]
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmId) return
    const t = setTimeout(() => setConfirmId(null), 2500)
    return () => clearTimeout(t)
  }, [confirmId])

  if (trash.length === 0) {
    return <div className="px-3 py-6 text-center text-[12px] text-black/40">回收站是空的（保留 30 天）</div>
  }
  return (
    <>
      {[...trash]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((note) => (
          <div key={note.id} className="group relative flex items-start gap-2 px-3 py-2 hover:bg-black/5">
            <span
              className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
              style={{ backgroundColor: NOTE_COLORS[note.color].bg }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-black/60 truncate">
                {deriveTitle(note.content)}
              </span>
              <span className="block text-[10px] text-black/30 mt-0.5">
                删除于 {formatUpdatedAt(note.updatedAt)}
              </span>
            </span>
            <span className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="text-[10px] px-1.5 h-4.5 h-[18px] rounded bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"
                onClick={() => onRestore(note.id)}
              >
                恢复
              </button>
              {confirmId === note.id ? (
                <button
                  className="text-[10px] px-1.5 h-[18px] rounded bg-red-500 text-white"
                  onClick={() => onPermanentDelete(note.id)}
                >
                  确认?
                </button>
              ) : (
                <button
                  className="text-[10px] px-1.5 h-[18px] rounded bg-black/8 bg-black/10 text-black/50 hover:text-red-600"
                  onClick={() => setConfirmId(note.id)}
                >
                  删除
                </button>
              )}
            </span>
          </div>
        ))}
    </>
  )
}

export function Sidebar({
  notes,
  trash,
  visible,
  pinned,
  onTogglePin,
  onSelect,
  onDelete,
  onNewNote,
  onHoverLeave,
  onRestore,
  onPermanentDelete,
  onUpdate,
  selectedCategory,
  onSelectCategory,
}: Props) {
  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes])
  const [tab, setTab] = useState<'notes' | 'tasks' | 'trash'>('notes')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const categories = useMemo(() => collectCategories(notes), [notes])
  // 两维筛选的中间集（对称联动计数的依据，#49）：分类筛选后的集合（标签菜单的基）/
  // 标签筛选后的集合（分类菜单的基）——各自分布对另一维可见，数字永远与列表一致。
  // 两处选中项分布为 0 时都保留（#41 卡死态守卫，对称）——否则按钮回基态但过滤仍生效（隐身筛选）
  const byCategory = useMemo(() => filterByCategory(notes, selectedCategory), [notes, selectedCategory])
  const byTag = useMemo(
    () => (tagFilter === null ? sorted : sorted.filter((n) => extractTags(n.content).includes(tagFilter))),
    [sorted, tagFilter],
  )
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of byCategory) {
      for (const t of extractTags(n.content)) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    const items = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ key: tag, label: `#${tag}`, count }))
    if (tagFilter !== null && !counts.has(tagFilter)) {
      items.push({ key: tagFilter, label: `#${tagFilter}`, count: 0 })
    }
    return [{ key: null, label: '全部', count: byCategory.length }, ...items]
  }, [byCategory, tagFilter])
  const categoryOptions = useMemo(
    () => categoryFilterOptions(byTag, categories, selectedCategory),
    [byTag, categories, selectedCategory],
  )
  // 列表过滤 = 分类（App 属主，画布同源）∩ 标签（侧栏内部态）；byTag 已按标签筛过，
  // 再过分类即交集（评审修正：与 byTag 单遍派生，消同形双算）
  const visibleNotes = useMemo(
    () => filterByCategory(byTag, selectedCategory),
    [byTag, selectedCategory],
  )
  const openTaskCount = useMemo(
    () =>
      notes.reduce(
        (sum, n) =>
          sum +
          extractTasks(n.content).filter(
            (t) => t.status === 'todo' || t.status === 'progress' || t.status === 'waiting',
          ).length,
        0,
      ),
    [notes],
  )

  // 页签计数 >99 显「99+」：三页签 + 图标在 232px 侧栏内空间紧，三位数必溢出（评审实测）
  const fmtCount = (n: number) => (n > 99 ? '99+' : String(n))

  const tabBtn = (active: boolean) =>
    `px-1.5 py-0.5 rounded-full text-[11px] whitespace-nowrap shrink-0 transition-colors ${
      active ? 'bg-amber-500/15 font-semibold text-amber-700' : 'text-stone-500 hover:bg-stone-900/5'
    }`

  return (
    <div
      className="fixed left-0 top-7 bottom-0 z-[9998] flex flex-col bg-white/70 backdrop-blur-xl border-r border-stone-900/10 shadow-xl transition-transform duration-200 ease-out"
      style={{ width: SIDEBAR_W, transform: visible ? 'translateX(0)' : 'translateX(-100%)' }}
      onPointerLeave={onHoverLeave}
    >
      <div className="flex items-center px-3 h-9 border-b border-stone-900/10 shrink-0">
        {/* 页签区：正常一排放下；极端计数（99+ 压顶）下允许横向滚动兜底，右侧操作按钮恒可达 */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button className={tabBtn(tab === 'notes')} onClick={() => setTab('notes')}>
          <StickyNote size={11} className="mr-0.5 inline-block align-[-1px]" />
          便签 {fmtCount(notes.length)}
        </button>
        <button className={tabBtn(tab === 'tasks')} onClick={() => setTab('tasks')}>
          <ListChecks size={11} className="mr-0.5 inline-block align-[-1px]" />
          任务 {fmtCount(openTaskCount)}
        </button>
        <button className={tabBtn(tab === 'trash')} onClick={() => setTab('trash')}>
          <Trash2 size={11} className="mr-0.5 inline-block align-[-1px]" />
          回收 {fmtCount(trash.length)}
        </button>
        </div>
        <div className="shrink-0" />
        <button
          className="p-1 rounded hover:bg-black/10 text-black/50 hover:text-black/80"
          onClick={onNewNote}
          title="新建便签（⌥N）"
        >
          <Plus size={14} />
        </button>
        <button
          className="p-1 rounded hover:bg-black/10 text-black/50 hover:text-black/80"
          onClick={onTogglePin}
          title={pinned ? '取消固定（⌥B）' : '固定导航栏（⌥B）'}
        >
          {pinned ? <Pin size={14} className="rotate-45" /> : <PinOff size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {tab === 'notes' && (
          <>
            {/* 筛选下拉选择器（#49）：替代两行筛选 chip（一多难浏览）。
                计数对称联动：分类菜单按标签筛选后分布、标签菜单按分类筛选后分布，
                不再出现「数字说有、列表说无」。有选中时选择器恒渲染（#41 卡死态教训）。 */}
            <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1 border-b border-black/5">
              {(categories.length > 0 || selectedCategory !== null) && (
                <FilterMenuButton
                  icon={<FolderOpen size={11} />}
                  name="分类"
                  selected={selectedCategory}
                  options={categoryOptions}
                  onSelect={onSelectCategory}
                />
              )}
              {(tagOptions.length > 1 || tagFilter !== null) && (
                <FilterMenuButton
                  icon={<Hash size={11} />}
                  name="标签"
                  selected={tagFilter}
                  options={tagOptions}
                  onSelect={setTagFilter}
                />
              )}
            </div>
            {visibleNotes.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-black/40">
                {tagFilter !== null ? `没有带 #${tagFilter} 标签的便签` : '还没有便签'}
              </div>
            )}
            {visibleNotes.map((note) => (
              <NoteRow key={note.id} note={note} onSelect={onSelect} onDelete={onDelete} />
            ))}
          </>
        )}
        {tab === 'tasks' && <TaskList notes={notes} onSelect={onSelect} onUpdate={onUpdate} />}
        {tab === 'trash' && (
          <TrashList trash={trash} onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
        )}
      </div>
    </div>
  )
}
