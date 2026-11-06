import type { StickyNoteData } from '@/types/note'
import type { FolderCapable } from './types'
import { serializeNote, parseNoteFile } from './noteFile'

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

/** 同步服务显示名（detectSyncRoot 返回的目录名 → 展示名；无法识别原样返回） */
const SYNC_ROOT_LABELS: Record<string, string> = {
  'Nutstore Files': '坚果云',
  '我的坚果云': '坚果云',
  'iCloud Drive': 'iCloud Drive',
  Dropbox: 'Dropbox',
}

/**
 * 文件夹存储（Tauri 桌面版）：
 * - 每张便签一个 <id>.md（frontmatter 存元数据；文件名规则单源在 Rust note_path）
 * - 图片存 attachments/ 子目录，文件名即 attachment id
 * - 回收站 = .trash/ 子目录（与 Rust TRASH_DIR 同名契约）
 * - FolderCapable 管理能力（选目录 / 探测 / 迁移 / 附件管理 / 变更订阅）全部在此实现
 */
export function makeFolderAdapter(folder: string, invoke: Invoke): FolderCapable {
  const trashFolder = () => `${folder}/.trash`
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

    // 回收站 = 同步文件夹下的 .trash 子目录，复用现有命令
    async trashNote(note) {
      await invoke('write_note', {
        folder: trashFolder(),
        id: note.id,
        text: serializeNote(note),
      })
      await invoke('delete_note', { folder, id: note.id })
    },

    async listTrash() {
      try {
        const files = await invoke<[string, string][]>('list_notes', { folder: trashFolder() })
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
      await invoke('delete_note', { folder: trashFolder(), id: note.id })
    },

    async deleteTrash(id) {
      await invoke('delete_note', { folder: trashFolder(), id })
    },

    // ---------- FolderCapable 管理能力 ----------

    async pickFolder() {
      return invoke<string | null>('pick_folder')
    },

    async detectSyncRoot(path: string) {
      return invoke<string>('detect_sync_root', { path })
    },

    async migrateFolderData(from: string, to: string) {
      return invoke<[number, number, number]>('copy_folder_contents', { from, to })
    },

    syncRootLabel(root: string) {
      return SYNC_ROOT_LABELS[root] ?? root
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

    // 外部变更订阅：封装 Tauri 事件（消费方对「变更怎么来的」零知识）。
    // 订阅只在 capable 存在时建立，无需再防御 adapter 被换回 local（非 Tauri 不会到这）
    subscribeChanges(cb: () => void): () => void {
      let unlisten: (() => void) | undefined
      let active = true
      void import('@tauri-apps/api/event').then(({ listen }) => {
        if (!active) return
        void listen('folder-changed', () => cb()).then((fn) => {
          // 订阅期间已退订：迟到的 listen 结果立即释放
          if (active) unlisten = fn
          else fn()
        })
      })
      return () => {
        active = false
        unlisten?.()
      }
    },
  }
}
