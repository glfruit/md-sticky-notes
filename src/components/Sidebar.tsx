import { useEffect, useMemo, useState } from 'react'
import { Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { StickyNoteData } from '@/types/note'
import { NOTE_COLORS } from '@/types/note'
import { deriveTitle, extractTags } from '@/lib/note'
import { formatUpdatedAt } from '@/lib/datetime'
import { extractTasks, TASK_STATUS_META, dueUrgency, DUE_LEVEL_COLORS, groupTasks, TASK_GROUP_META } from '@/lib/editor'

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
            {note.pinned && <Pin size={10} className="inline mr-1 -mt-0.5 text-blue-600" />}
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

/** 侧栏任务：按 进行中 → 快过期/逾期 → 等待 → 待办 分组，组内按截止日期升序，临期标红 */
function TaskList({
  notes,
  onSelect,
}: {
  notes: StickyNoteData[]
  onSelect: (id: string) => void
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
          {rows.map(({ note, task }) => {
            const urgency = task.due ? dueUrgency(task.due) : null
            return (
              <button
                key={`${note.id}-${task.index}`}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 transition-colors"
                onClick={() => onSelect(note.id)}
                title={`${deriveTitle(note.content)} · ${TASK_STATUS_META[task.status].label}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: TASK_STATUS_META[task.status].color }}
                />
                <span className="min-w-0 flex-1 text-[12px] text-black/70 truncate">
                  {task.text.includes('🔁') && <span title="重复任务">🔁 </span>}
                  {task.text || '（空任务）'}
                </span>
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
              </button>
            )
          })}
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
                className="text-[10px] px-1.5 h-4.5 h-[18px] rounded bg-blue-500/15 text-blue-700 hover:bg-blue-500/25"
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
}: Props) {
  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes])
  const [tab, setTab] = useState<'notes' | 'tasks' | 'trash'>('notes')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // 标签 → 便签数（用于「便签」页签顶部的筛选 chip 行）
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of notes) {
      for (const t of extractTags(n.content)) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])
  const visibleNotes = useMemo(
    () =>
      tagFilter === null
        ? sorted
        : sorted.filter((n) => extractTags(n.content).includes(tagFilter)),
    [sorted, tagFilter],
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

  const tabBtn = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] transition-colors ${
      active ? 'bg-black/10 font-semibold text-black/75' : 'text-black/45 hover:bg-black/5'
    }`

  return (
    <div
      className="fixed left-0 top-7 bottom-0 w-[232px] z-[9998] flex flex-col bg-white/70 backdrop-blur-xl border-r border-black/10 shadow-xl transition-transform duration-200 ease-out"
      style={{ transform: visible ? 'translateX(0)' : 'translateX(-100%)' }}
      onPointerLeave={onHoverLeave}
    >
      <div className="flex items-center gap-1 px-3 h-9 border-b border-black/10 shrink-0">
        <button className={tabBtn(tab === 'notes')} onClick={() => setTab('notes')}>
          便签 {notes.length}
        </button>
        <button className={tabBtn(tab === 'tasks')} onClick={() => setTab('tasks')}>
          任务 {openTaskCount}
        </button>
        <button className={tabBtn(tab === 'trash')} onClick={() => setTab('trash')}>
          回收 {trash.length}
        </button>
        <div className="flex-1" />
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
            {tagCounts.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1 border-b border-black/5">
                <button
                  className={`px-1.5 h-[19px] rounded-full text-[10.5px] transition-colors ${
                    tagFilter === null
                      ? 'bg-blue-500/15 text-blue-700 font-medium'
                      : 'text-black/45 hover:bg-black/5'
                  }`}
                  onClick={() => setTagFilter(null)}
                >
                  全部 {notes.length}
                </button>
                {tagCounts.map(([tag, count]) => (
                  <button
                    key={tag}
                    className={`px-1.5 h-[19px] rounded-full text-[10.5px] transition-colors ${
                      tagFilter === tag
                        ? 'bg-blue-500/15 text-blue-700 font-medium'
                        : 'text-black/45 hover:bg-black/5'
                    }`}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  >
                    #{tag} {count}
                  </button>
                ))}
              </div>
            )}
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
        {tab === 'tasks' && <TaskList notes={notes} onSelect={onSelect} />}
        {tab === 'trash' && (
          <TrashList trash={trash} onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
        )}
      </div>
    </div>
  )
}
