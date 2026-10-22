import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileText } from 'lucide-react'
import type { StickyNoteData } from '@/types/note'
import { NOTE_COLORS } from '@/types/note'
import { deriveTitle } from '@/lib/note'

export interface SearchJump {
  noteId: string
  start: number
  end: number
}

interface Props {
  notes: StickyNoteData[]
  onJump: (jump: SearchJump) => void
  onClose: () => void
}

interface NoteMatch {
  note: StickyNoteData
  count: number
  firstStart: number
  firstEnd: number
  snippet: { pre: string; hit: string; post: string }
}

const CTX = 26

function findMatches(notes: StickyNoteData[], query: string): NoteMatch[] {
  const q = query.toLowerCase()
  const out: NoteMatch[] = []
  for (const note of notes) {
    const hay = note.content.toLowerCase()
    let count = 0
    let idx = hay.indexOf(q)
    const firstIdx = idx
    while (idx !== -1) {
      count++
      idx = hay.indexOf(q, idx + q.length)
    }
    if (count === 0) continue
    const start = Math.max(0, firstIdx - CTX)
    out.push({
      note,
      count,
      firstStart: firstIdx,
      firstEnd: firstIdx + query.length,
      snippet: {
        pre: (start > 0 ? '…' : '') + note.content.slice(start, firstIdx).replace(/\n/g, ' '),
        hit: note.content.slice(firstIdx, firstIdx + query.length),
        post: note.content.slice(firstIdx + query.length, firstIdx + query.length + CTX).replace(/\n/g, ' ') + '…',
      },
    })
  }
  return out.sort((a, b) => b.note.z - a.note.z)
}

export function SearchPanel({ notes, onJump, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(
    () => (query.trim() ? findMatches(notes, query.trim()) : []),
    [notes, query],
  )

  const jump = (m: NoteMatch) => {
    onJump({ noteId: m.note.id, start: m.firstStart, end: m.firstEnd })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[active]) jump(matches[active])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-20 bg-black/20"
      onPointerDown={onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] rounded-xl bg-white/95 backdrop-blur-xl shadow-2xl border border-black/10 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-black/10">
          <Search size={16} className="text-black/40 shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-black/30"
            placeholder="搜索所有便签…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={handleKey}
          />
          <kbd className="text-[10px] text-black/35 border border-black/15 rounded px-1 py-0.5">Esc</kbd>
        </div>

        {query.trim() && (
          <div className="max-h-[50vh] overflow-y-auto">
            {matches.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-black/40">
                没有找到「{query.trim()}」
              </div>
            ) : (
              matches.map((m, i) => (
                <button
                  key={m.note.id}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === active ? 'bg-blue-500/10' : 'hover:bg-black/5'
                  }`}
                  onClick={() => jump(m)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span
                    className="mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 border border-black/15"
                    style={{ backgroundColor: NOTE_COLORS[m.note.color].bg }}
                  >
                    <FileText size={13} className="text-black/55" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium text-black/80 truncate">
                        {deriveTitle(m.note.content)}
                      </span>
                      <span className="text-[11px] text-black/35 shrink-0">{m.count} 处匹配</span>
                    </span>
                    <span className="block text-[12px] text-black/50 truncate mt-0.5">
                      {m.snippet.pre}
                      <mark className="bg-yellow-300/90 text-black/85 rounded-sm px-0.5">
                        {m.snippet.hit}
                      </mark>
                      {m.snippet.post}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
