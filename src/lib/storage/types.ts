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

/** 文件夹存储的管理能力（Tauri 桌面版实现，localAdapter 不实现）。
 *  能力即类型：消费方经 getFolderCapable() 单点收窄，不写 kind 字符串判断、不做 optional 探测。 */
export interface FolderCapable extends StorageAdapter {
  /** 系统文件夹选择器，取消返回 null */
  pickFolder(): Promise<string | null>
  /** 检测路径所在的云盘同步服务，不在任何同步目录内返回空串 */
  detectSyncRoot(path: string): Promise<string>
  /** 迁移旧文件夹数据（便签 / 回收站 / 附件，同名跳过不覆盖），返回三类数量 */
  migrateFolderData(from: string, to: string): Promise<[number, number, number]>
  /** 同步服务显示名（无法识别的目录名原样返回） */
  syncRootLabel(root: string): string
  /** 附件管理（孤儿清理用） */
  listAttachments(): Promise<string[]>
  deleteAttachment(name: string): Promise<void>
  /** 订阅外部变更（另一台机器 / 云盘客户端改动同步文件夹 → 回调）；返回退订函数 */
  subscribeChanges(cb: () => void): () => void
}
