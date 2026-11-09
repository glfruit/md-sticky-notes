import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Menu, MenuItem } from './Menu'

/** 下拉筛选选择器的一项：key 为 null 表示「全部」；其余 key 语义由调用方定
 *  （分类维度里 '' = 无分类哨兵，见 lib/note filterByCategory） */
export interface FilterOption {
  key: string | null
  label: string
  count: number
}

interface Props {
  icon: React.ReactNode
  /** 维度名（未选中时按钮文案，如「分类」「标签」） */
  name: string
  /** 当前选中 key（null = 全部） */
  selected: string | null
  /** 选项清单（含「全部」；计数由调用方按另一维度筛选后派生，对称联动） */
  options: FilterOption[]
  onSelect: (key: string | null) => void
}

/** 侧栏筛选下拉选择器（#49）：紧凑按钮（未选中 = icon+维度名 ▾，选中 = icon+当前值+×清除）
 *  点击弹 Menu 原语（portal/互斥/Escape/钳制语义白拿），菜单项带计数、当前项打勾。 */
export function FilterMenuButton({ icon, name, selected, options, onSelect }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const current = selected === null ? null : (options.find((o) => o.key === selected) ?? null)

  return (
    <div className="relative">
      <button
        className={`flex items-center gap-1 px-2 h-[22px] rounded-full border text-[10.5px] whitespace-nowrap transition-colors ${
          current
            ? 'border-amber-400/60 bg-amber-500/10 text-amber-700'
            : 'border-black/10 text-black/55 hover:bg-black/5'
        }`}
        onClick={(e) => {
          // 菜单开着时 backdrop 盖住按钮（点击先关菜单），此处只在关闭态可达——恒设坐标
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <span className="shrink-0">{icon}</span>
        {current ? (
          <>
            <span className="max-w-24 truncate">{current.label}</span>
            <X
              size={11}
              aria-label="清除筛选"
              className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(null)
              }}
            />
          </>
        ) : (
          <>
            <span>{name}</span>
            <ChevronDown size={11} className="shrink-0 opacity-60" />
          </>
        )}
      </button>
      {pos && (
        <Menu
          x={pos.x}
          y={pos.y}
          onClose={() => setPos(null)}
        >
          {options.map((o) => (
            <MenuItem
              key={String(o.key)}
              onClick={() => {
                onSelect(o.key)
                setPos(null)
              }}
            >
              <span className="max-w-36 truncate">{o.label}</span>
              <span className="ml-2 text-black/35 text-[10px]">{o.count}</span>
              {selected === o.key && <Check size={12} className="ml-auto text-black/45" />}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}
