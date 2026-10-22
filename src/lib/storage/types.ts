import type { StickyNoteData } from '@/types/note'

/** 存储适配器：网页版用浏览器本地，桌面版用同步文件夹 */
export interface StorageAdapter {
  kind: 'local' | 'folder'
  /** 展示给用户的存储位置描述 */
  describe(): string
  loadNotes(): Promise<StickyNoteData[]>
  saveNote(note: StickyNoteData): Promise<void>
  deleteNote(id: string): Promise<void>
  saveAttachment(blob: Blob, id: string): Promise<void>
  getAttachment(id: string): Promise<Blob | null>
  /** 回收站：移入 / 列出 / 恢复 / 彻底删除 */
  trashNote(note: StickyNoteData): Promise<void>
  listTrash(): Promise<StickyNoteData[]>
  restoreTrash(note: StickyNoteData): Promise<void>
  deleteTrash(id: string): Promise<void>
}
