import JSZip from 'jszip'
import type { StickyNoteData } from '@/types/note'
import { deriveTitle } from '@/lib/note'
import { formatDate, formatDateTime } from './datetime'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 文件名安全化，空标题回退到 note */
function safeName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
  return clean || 'note'
}

function noteFileName(note: StickyNoteData, used: Set<string>): string {
  const base = safeName(deriveTitle(note.content))
  let name = `${base}.md`
  let i = 2
  while (used.has(name)) {
    name = `${base}-${i}.md`
    i++
  }
  used.add(name)
  return name
}

/** 导出单张便签为 .md */
export function exportNote(note: StickyNoteData) {
  const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(noteFileName(note, new Set()), blob)
}

/** 全部便签打包为 zip（每张一个 .md，附清单 README） */
export async function exportAllNotes(notes: StickyNoteData[]) {
  const zip = new JSZip()
  const used = new Set<string>()
  const manifest: string[] = ['# MD 便签导出清单', '']
  for (const note of notes) {
    const name = noteFileName(note, used)
    zip.file(name, note.content)
    manifest.push(
      `- **${name}** — ${note.color}，更新于 ${formatDateTime(new Date(note.updatedAt))}`,
    )
  }
  manifest.push('', `共 ${notes.length} 张便签`)
  zip.file('README.md', manifest.join('\n'))
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`md-sticky-notes-${formatDate()}.zip`, blob)
}
