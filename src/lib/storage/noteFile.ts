import type { StickyNoteData, NoteColor } from '@/types/note'
import { COLOR_ORDER } from '@/types/note'

/** 便签 → 带 frontmatter 的 Markdown 文件文本 */
export function serializeNote(note: StickyNoteData): string {
  const fm = [
    '---',
    `color: ${note.color}`,
    `x: ${Math.round(note.x)}`,
    `y: ${Math.round(note.y)}`,
    `width: ${Math.round(note.width)}`,
    `height: ${Math.round(note.height)}`,
    `collapsed: ${note.collapsed}`,
    `preview: ${note.preview}`,
    `pinned: ${!!note.pinned}`,
    `translucent: ${!!note.translucent}`,
    `z: ${note.z}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
    '',
  ].join('\n')
  return fm + note.content
}

/** Markdown 文件文本 → 便签（无 frontmatter 时整个文件视为内容） */
export function parseNoteFile(id: string, text: string): StickyNoteData | null {
  const fallback: StickyNoteData = {
    id,
    content: text,
    color: 'yellow',
    x: 60,
    y: 80,
    width: 300,
    height: 320,
    collapsed: false,
    preview: true,
    z: 1,
    updatedAt: Date.now(),
  }
  if (!text.startsWith('---\n')) return fallback
  const end = text.indexOf('\n---\n', 4)
  if (end === -1) return fallback
  const meta = text.slice(4, end)
  const content = text.slice(end + 5)
  const m: Record<string, string> = {}
  for (const line of meta.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) m[line.slice(0, i)] = line.slice(i + 2)
  }
  const num = (k: string, d: number) => {
    const v = Number(m[k])
    return Number.isFinite(v) ? v : d
  }
  return {
    id,
    content,
    color: (COLOR_ORDER as string[]).includes(m.color) ? (m.color as NoteColor) : 'yellow',
    x: num('x', 60),
    y: num('y', 80),
    width: num('width', 300),
    height: num('height', 320),
    collapsed: m.collapsed === 'true',
    preview: m.preview !== 'false',
    pinned: m.pinned === 'true' || undefined,
    translucent: m.translucent === 'true' || undefined,
    z: num('z', 1),
    updatedAt: num('updatedAt', Date.now()),
  }
}
