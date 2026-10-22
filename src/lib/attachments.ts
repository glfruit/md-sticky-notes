import type { StickyNoteData } from '@/types/note'
import { getStorage } from './storage'

/** 生成带扩展名的附件 id（扩展名取自 MIME 类型，文件夹模式下直接用作文件名） */
function makeAttachmentId(blob: Blob): string {
  const subtype = blob.type.split('/')[1] ?? 'png'
  const ext = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/g, '') || 'png'
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

/** 保存图片 Blob，返回 attachment:// 引用的 id */
export async function saveAttachment(blob: Blob): Promise<string> {
  const id = makeAttachmentId(blob)
  await getStorage().saveAttachment(blob, id)
  return id
}

export async function getAttachment(id: string): Promise<Blob | null> {
  return getStorage().getAttachment(id)
}

export const ATTACHMENT_SCHEME = 'attachment://'

export function attachmentUrl(id: string): string {
  return `${ATTACHMENT_SCHEME}${id}`
}

export function attachmentId(src: string): string | null {
  return src.startsWith(ATTACHMENT_SCHEME) ? src.slice(ATTACHMENT_SCHEME.length) : null
}

// ---------- Object URL 缓存 ----------

const blobUrlCache = new Map<string, Promise<string | null>>()

/** 取附件的 Object URL（应用生命周期内每个附件只走一次 IPC；缺失也缓存住，避免反复探测） */
export function getAttachmentUrl(id: string): Promise<string | null> {
  let entry = blobUrlCache.get(id)
  if (!entry) {
    entry = getAttachment(id).then((blob) => (blob ? URL.createObjectURL(blob) : null))
    blobUrlCache.set(id, entry)
  }
  return entry
}

/** 切换同步文件夹后调用：旧文件夹的缓存 URL 全部失效 */
export function clearAttachmentCache(): void {
  blobUrlCache.clear()
}

// ---------- 孤儿附件清理 ----------

const ATTACHMENT_REF_RE = /attachment:\/\/([^\s)]+)/g

/**
 * 删除未被任何便签（含回收站）引用的附件文件，返回删除数量。
 * 仅文件夹存储支持；云盘同步可能尚未拉全文件，适合延迟 / 手动触发。
 */
export async function cleanOrphanAttachments(
  notes: StickyNoteData[],
  trash: StickyNoteData[],
): Promise<number> {
  const storage = getStorage()
  if (!storage.listAttachments || !storage.deleteAttachment) return 0
  const referenced = new Set<string>()
  for (const n of [...notes, ...trash]) {
    for (const m of n.content.matchAll(ATTACHMENT_REF_RE)) referenced.add(m[1])
  }
  let removed = 0
  const files = await storage.listAttachments()
  for (const f of files) {
    if (referenced.has(f)) continue
    try {
      await storage.deleteAttachment(f)
      blobUrlCache.delete(f)
      removed++
    } catch {
      // 删除失败（被占用等）跳过，下次再试
    }
  }
  return removed
}
