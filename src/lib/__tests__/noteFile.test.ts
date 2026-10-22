import { describe, it, expect } from 'vitest'
import { serializeNote, parseNoteFile } from '../storage/noteFile'
import type { StickyNoteData } from '@/types/note'

const base: StickyNoteData = {
  id: 'note-test',
  content: '# 标题\n\n正文内容',
  color: 'pink',
  x: 12.6,
  y: -0.2,
  width: 320,
  height: 410,
  collapsed: true,
  preview: false,
  pinned: true,
  translucent: true,
  z: 42,
  updatedAt: 1760000000000,
}

describe('noteFile 序列化往返', () => {
  it('序列化 → 解析还原全部字段（坐标取整，可选项还原）', () => {
    const text = serializeNote(base)
    const parsed = parseNoteFile('note-test', text)
    expect(parsed).toEqual({
      id: 'note-test',
      content: '# 标题\n\n正文内容',
      color: 'pink',
      x: 13,
      y: 0,
      width: 320,
      height: 410,
      collapsed: true,
      preview: false,
      pinned: true,
      translucent: true,
      z: 42,
      updatedAt: 1760000000000,
    })
  })

  it('无 frontmatter 的文件整体视为内容（外部 .md 导入）', () => {
    const parsed = parseNoteFile('external', '# 外部笔记\n内容')
    expect(parsed?.content).toBe('# 外部笔记\n内容')
    expect(parsed?.preview).toBe(true)
    expect(parsed?.color).toBe('yellow')
  })

  it('损坏的 frontmatter 字段回退默认值', () => {
    const parsed = parseNoteFile(
      'x',
      '---\ncolor: rainbow\nx: not-a-number\nunknown: 1\n---\n正文',
    )
    expect(parsed?.color).toBe('yellow')
    expect(parsed?.x).toBe(60)
    expect(parsed?.content).toBe('正文')
  })

  it('正文里包含 --- 分割线不受影响', () => {
    const content = '上文\n\n---\n\n下文'
    const parsed = parseNoteFile('n', serializeNote({ ...base, content }))
    expect(parsed?.content).toBe(content)
  })
})
