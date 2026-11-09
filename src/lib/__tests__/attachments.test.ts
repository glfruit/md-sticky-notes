import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanOrphanAttachments } from '../attachments'
import type { StickyNoteData } from '@/types/note'

// getFolderCapable 是 storage 模块单例（模块级 adapter 状态）——mock 掉以便
// 控制文件夹能力与附件清单（先例：folderAdapter.test.ts 的 fake Invoke）
const listAttachments = vi.fn()
const deleteAttachment = vi.fn()
vi.mock('@/lib/storage', () => ({
  getFolderCapable: () => ({ kind: 'folder', listAttachments, deleteAttachment }),
  getStorage: () => ({}),
}))

const note = (id: string, content: string): StickyNoteData => ({
  id,
  content,
  color: 'yellow',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  collapsed: false,
  preview: true,
  z: 1,
  updatedAt: 1,
})

beforeEach(() => {
  listAttachments.mockReset().mockResolvedValue([])
  deleteAttachment.mockReset().mockResolvedValue(undefined)
})

describe('cleanOrphanAttachments 孤儿清理（#44 空清单防护）', () => {
  it('notes 与 trash 都为空：不清理（加载异常的假象，防止误删全部附件）', async () => {
    listAttachments.mockResolvedValue(['a.png', 'b.png'])
    expect(await cleanOrphanAttachments([], [])).toBe(0)
    expect(deleteAttachment).not.toHaveBeenCalled()
  })

  it('正常路径：未被引用的删除、被引用（含回收站）的保留', async () => {
    listAttachments.mockResolvedValue(['keep.png', 'trash-keep.png', 'orphan.png'])
    const removed = await cleanOrphanAttachments(
      [note('n1', `![](attachment://keep.png)`)],
      [note('t1', `![](attachment://trash-keep.png)`)],
    )
    expect(removed).toBe(1)
    expect(deleteAttachment).toHaveBeenCalledTimes(1)
    expect(deleteAttachment).toHaveBeenCalledWith('orphan.png')
  })
})
