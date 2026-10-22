import { useState } from 'react'
import { Smile, Eraser, Table, Archive } from 'lucide-react'
import { EmojiPicker } from './EmojiPicker'

const TEXT_COLORS = [
  { name: '默认黑', value: '#1a202c' },
  { name: '红', value: '#e53e3e' },
  { name: '橙', value: '#dd6b20' },
  { name: '黄', value: '#b7791f' },
  { name: '绿', value: '#2f855a' },
  { name: '蓝', value: '#2b6cb0' },
  { name: '紫', value: '#6b46c1' },
  { name: '粉', value: '#d53f8c' },
]

interface Props {
  barColor: string
  onColor: (color: string) => void
  onClearColor: () => void
  onEmoji: (emoji: string) => void
  onTable: (rows: number, cols: number) => void
  onArchive: () => void
}

/** 编辑模式底部格式工具条：字体颜色 + emoji + 表格 + 归档 */
export function FormatBar({ barColor, onColor, onClearColor, onEmoji, onTable, onArchive }: Props) {
  const [open, setOpen] = useState<'color' | 'emoji' | 'table' | null>(null)
  const [grid, setGrid] = useState({ r: 3, c: 3 })

  const btn = 'flex items-center gap-1 px-1.5 h-5 rounded text-[11px] text-black/55 hover:bg-black/10 hover:text-black/80 transition-colors'

  return (
    <div
      className="relative h-7 shrink-0 flex items-center gap-1 px-2 pr-5 border-t border-black/10 select-none"
      style={{ backgroundColor: barColor }}
    >
      {open && (
        <div
          className="fixed inset-0 z-40 cursor-default"
          onPointerDown={(e) => {
            e.stopPropagation()
            setOpen(null)
          }}
        />
      )}

      <button
        className={btn}
        onClick={() => setOpen(open === 'color' ? null : 'color')}
        title="设置选中文字的颜色"
      >
        <span className="font-bold text-[12px] leading-none" style={{ color: '#e53e3e' }}>
          A
        </span>
        <span className="hidden min-[300px]:inline">颜色</span>
      </button>
      <button
        className={btn}
        onClick={() => setOpen(open === 'emoji' ? null : 'emoji')}
        title="插入 emoji 表情"
      >
        <Smile size={13} />
        <span className="hidden min-[300px]:inline">表情</span>
      </button>
      <button
        className={btn}
        onClick={() => setOpen(open === 'table' ? null : 'table')}
        title="插入表格（拖选行列）"
      >
        <Table size={13} />
        <span className="hidden min-[300px]:inline">表格</span>
      </button>
      <button
        className={btn}
        onClick={onArchive}
        title="把已完成 / 废弃的任务移到便签底部「归档」区"
      >
        <Archive size={13} />
        <span className="hidden min-[300px]:inline">归档</span>
      </button>

      {open === 'color' && (
        <div className="absolute left-1 bottom-8 z-50 flex items-center gap-1 p-1.5 rounded-lg bg-white/95 backdrop-blur shadow-xl border border-black/15">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              className="w-[18px] h-[18px] rounded-full border border-black/20 hover:scale-110 transition-transform"
              style={{ backgroundColor: c.value }}
              title={c.name}
              onClick={() => {
                onColor(c.value)
                setOpen(null)
              }}
            />
          ))}
          <button
            className={`${btn} !h-[18px] ml-0.5 border-l border-black/15 pl-1.5`}
            title="清除选中文字的颜色标记"
            onClick={() => {
              onClearColor()
              setOpen(null)
            }}
          >
            <Eraser size={12} />
          </button>
        </div>
      )}

      {open === 'emoji' && (
        <div className="absolute left-1 right-1 bottom-8 z-50">
          <EmojiPicker
            onPick={(e) => {
              onEmoji(e)
              setOpen(null)
            }}
          />
        </div>
      )}

      {open === 'table' && (
        <div className="absolute left-1 bottom-8 z-50 p-2 rounded-lg bg-white/95 backdrop-blur shadow-xl border border-black/15">
          <div className="text-[10px] text-black/50 mb-1.5 text-center tabular-nums">
            {grid.r} 行 × {grid.c} 列
          </div>
          <div className="grid grid-cols-6 gap-[3px]">
            {Array.from({ length: 36 }).map((_, i) => {
              const r = Math.floor(i / 6) + 1
              const c = (i % 6) + 1
              const active = r <= grid.r && c <= grid.c
              return (
                <button
                  key={i}
                  className={`w-[16px] h-[16px] rounded-[3px] border transition-colors ${
                    active ? 'bg-blue-500/70 border-blue-600' : 'bg-black/5 border-black/15'
                  }`}
                  onMouseEnter={() => setGrid({ r, c })}
                  onClick={() => {
                    onTable(r, c)
                    setOpen(null)
                  }}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
