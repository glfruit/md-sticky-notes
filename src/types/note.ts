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
  yellow: { bg: '#fff7ae', bar: '#f5e98c', border: '#e0cd6a' },
  blue: { bg: '#d7e7ff', bar: '#bcd4f7', border: '#9cbdea' },
  green: { bg: '#dbf7c5', bar: '#c3eaa6', border: '#a5d484' },
  pink: { bg: '#ffdbe4', bar: '#f7c2cf', border: '#e8a3b5' },
  purple: { bg: '#eadbff', bar: '#d6c2f5', border: '#bda3e8' },
  gray: { bg: '#ececea', bar: '#d9d9d5', border: '#bfbfba' },
}

export const COLOR_ORDER: NoteColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'gray']

export const MIN_W = 240
export const MIN_H = 180
