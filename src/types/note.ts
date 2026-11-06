export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'gray'

export interface StickyNoteData {
  id: string
  /** Markdown 源码 */
  content: string
  color: NoteColor
  x: number
  y: number
  width: number
  height: number
  /** 折叠成只有标题栏 */
  collapsed: boolean
  /** true = 渲染 Markdown 预览；false = 编辑源码 */
  preview: boolean
  /** 置顶显示：始终浮在其他便签之上 */
  pinned?: boolean
  /** 半透明（磨砂玻璃效果） */
  translucent?: boolean
  z: number
  updatedAt: number
}

export const NOTE_COLORS: Record<NoteColor, { bg: string; bar: string; border: string }> = {
  yellow: { bg: '#FFF5A6', bar: '#F4E88C', border: '#DFC964' },
  blue: { bg: '#D8E9FF', bar: '#BFD6F8', border: '#9BBEE8' },
  green: { bg: '#DCF5C9', bar: '#C3EAAA', border: '#A2D485' },
  pink: { bg: '#FFDCE6', bar: '#F7C4D1', border: '#E6A3B5' },
  purple: { bg: '#EBDDFF', bar: '#D8C6F7', border: '#BFA4E8' },
  gray: { bg: '#EFEDE8', bar: '#DCDAD3', border: '#BEBBB2' },
}

export const COLOR_ORDER: NoteColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'gray']

export const MIN_W = 240
export const MIN_H = 180

/** 搜索跳转目标：切到编辑模式并选中 [start, end) 区间 */
export interface RevealTarget {
  start: number
  end: number
  /** 查询词：预览模式下高亮全部匹配（编辑模式仅选中 [start,end)） */
  query?: string
  nonce: number
}
