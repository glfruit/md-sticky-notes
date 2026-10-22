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
