import type { StickyNoteData } from '@/types/note'
import type { StorageAdapter } from './types'
import { serializeNote, parseNoteFile } from './noteFile'

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

/**
 * 文件夹存储（Tauri 桌面版）：
 * - 每张便签一个 <id>.md（frontmatter 存元数据）
 * - 图片存 attachments/ 子目录，文件名即 attachment id
 */
export function makeFolderAdapter(folder: string, invoke: Invoke): StorageAdapter {
  return {
    kind: 'folder',
    describe: () => folder,

    async loadNotes() {
      const files = await invoke<[string, string][]>('list_notes', { folder })
      const notes: StickyNoteData[] = []
      for (const [id, text] of files) {
        const n = parseNoteFile(id, text)
        if (n) notes.push(n)
      }
      return notes
    },

    async saveNote(note) {
      await invoke('write_note', { folder, id: note.id, text: serializeNote(note) })
    },

    async deleteNote(id) {
      await invoke('delete_note', { folder, id })
    },

    async saveAttachment(blob, id) {
      // base64 传输：大图走 JSON 数字数组会产生百万元素数组，极慢
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      const CHUNK = 0x8000
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
      }
      await invoke('write_attachment', { folder, name: id, dataB64: btoa(bin) })
    },

    async getAttachment(id) {
      try {
        // 后端返回原始二进制（tauri::ipc::Response），前端拿到 ArrayBuffer
        const buf = await invoke<ArrayBuffer>('read_attachment', { folder, name: id })
        return new Blob([buf])
      } catch {
        return null
      }
    },

    async listAttachments() {
      try {
        return await invoke<string[]>('list_attachments', { folder })
      } catch {
        return []
      }
    },

    async deleteAttachment(name) {
      await invoke('delete_attachment', { folder, name })
    },

    // 回收站 = 同步文件夹下的 .trash 子目录，复用现有命令
    async trashNote(note) {
      await invoke('write_note', {
        folder: `${folder}/.trash`,
        id: note.id,
        text: serializeNote(note),
      })
      await invoke('delete_note', { folder, id: note.id })
    },

    async listTrash() {
      try {
        const files = await invoke<[string, string][]>('list_notes', { folder: `${folder}/.trash` })
        const notes: StickyNoteData[] = []
        for (const [id, text] of files) {
          const n = parseNoteFile(id, text)
          if (n) notes.push(n)
        }
        return notes
      } catch {
        return []
      }
    },

    async restoreTrash(note) {
      await invoke('write_note', { folder, id: note.id, text: serializeNote(note) })
      await invoke('delete_note', { folder: `${folder}/.trash`, id: note.id })
    },

    async deleteTrash(id) {
      await invoke('delete_note', { folder: `${folder}/.trash`, id })
    },
  }
}
