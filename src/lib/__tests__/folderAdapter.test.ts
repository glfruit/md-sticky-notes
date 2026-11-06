import { describe, expect, it, vi } from 'vitest'
import { makeFolderAdapter, type Invoke } from '../storage/folderAdapter'
import { serializeNote } from '../storage/noteFile'
import type { StickyNoteData } from '../../types/note'

// subscribeChanges 内部动态 import 的事件模块 → mock 掉（不依赖 Tauri 运行时）
const listenMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

const F = '/sync/MD 便签'

const note: StickyNoteData = {
  id: 'note-abc',
  content: '# hi',
  color: 'yellow',
  x: 1,
  y: 2,
  width: 100,
  height: 100,
  collapsed: false,
  preview: true,
  z: 3,
  updatedAt: 1234567890,
}

/** fake Invoke：记录每次调用的命令与参数，按命令名回放预设响应 */
function makeInvoke(responses: Record<string, unknown> = {}) {
  const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = []
  const invoke: Invoke = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ cmd, args })
    const r = responses[cmd]
    if (r instanceof Error) throw r
    return (r ?? null) as T
  }
  return { invoke, calls }
}

describe('folderAdapter 核心读写契约（fake Invoke）', () => {
  it('saveNote → write_note 带 folder/id 与 frontmatter 序列化文本', async () => {
    const { invoke, calls } = makeInvoke()
    await makeFolderAdapter(F, invoke).saveNote(note)
    expect(calls).toEqual([
      { cmd: 'write_note', args: { folder: F, id: note.id, text: serializeNote(note) } },
    ])
  })

  it('trashNote 两步：先写 .trash 再删主目录（trashFolder 单源路径）', async () => {
    const { invoke, calls } = makeInvoke()
    await makeFolderAdapter(F, invoke).trashNote(note)
    expect(calls.map((c) => c.cmd)).toEqual(['write_note', 'delete_note'])
    expect(calls[0].args).toMatchObject({ folder: `${F}/.trash`, id: note.id })
    expect(calls[1].args).toMatchObject({ folder: F, id: note.id })
  })

  it('restoreTrash 对称反向：先写主目录再删 .trash', async () => {
    const { invoke, calls } = makeInvoke()
    await makeFolderAdapter(F, invoke).restoreTrash(note)
    expect(calls.map((c) => c.cmd)).toEqual(['write_note', 'delete_note'])
    expect(calls[0].args).toMatchObject({ folder: F, id: note.id })
    expect(calls[1].args).toMatchObject({ folder: `${F}/.trash`, id: note.id })
  })

  it('listTrash 解析 [id, text] 对；失败（回收站目录尚不存在）返回空', async () => {
    const ok = makeInvoke({ list_notes: [[note.id, serializeNote(note)]] })
    const notes = await makeFolderAdapter(F, ok.invoke).listTrash()
    expect(notes[0]?.id).toBe(note.id)

    const broken = makeInvoke({ list_notes: new Error('no dir') })
    expect(await makeFolderAdapter(F, broken.invoke).listTrash()).toEqual([])
  })

  it('saveAttachment 走 base64 且字节可还原；getAttachment 缺失返回 null', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    const { invoke, calls } = makeInvoke()
    await makeFolderAdapter(F, invoke).saveAttachment(new Blob([bytes]), 'img-x.png')
    const args = calls[0].args as { dataB64: string }
    expect(Array.from(atob(args.dataB64), (ch) => ch.charCodeAt(0))).toEqual(Array.from(bytes))

    const reader = makeInvoke({ read_attachment: new Error('missing') })
    expect(await makeFolderAdapter(F, reader.invoke).getAttachment('img-x.png')).toBeNull()
  })
})

describe('folderAdapter 管理能力（FolderCapable）', () => {
  it('pickFolder / detectSyncRoot / migrateFolderData 透传命令与参数', async () => {
    const { invoke, calls } = makeInvoke({
      pick_folder: '/picked',
      detect_sync_root: 'Dropbox',
      copy_folder_contents: [3, 1, 2],
    })
    const adapter = makeFolderAdapter(F, invoke)
    expect(await adapter.pickFolder()).toBe('/picked')
    expect(await adapter.detectSyncRoot('/picked')).toBe('Dropbox')
    expect(await adapter.migrateFolderData('/a', '/b')).toEqual([3, 1, 2])
    expect(calls).toEqual([
      { cmd: 'pick_folder' },
      { cmd: 'detect_sync_root', args: { path: '/picked' } },
      { cmd: 'copy_folder_contents', args: { from: '/a', to: '/b' } },
    ])
  })

  it('syncRootLabel 映射已知同步服务，未知名原样返回', () => {
    const adapter = makeFolderAdapter(F, makeInvoke().invoke)
    expect(adapter.syncRootLabel('Nutstore Files')).toBe('坚果云')
    expect(adapter.syncRootLabel('我的坚果云')).toBe('坚果云')
    expect(adapter.syncRootLabel('iCloud Drive')).toBe('iCloud Drive')
    expect(adapter.syncRootLabel('SynologyDrive')).toBe('SynologyDrive')
  })

  it('listAttachments 失败返回空（目录尚不存在），deleteAttachment 透传', async () => {
    const broken = makeInvoke({ list_attachments: new Error('no dir') })
    expect(await makeFolderAdapter(F, broken.invoke).listAttachments()).toEqual([])

    const { invoke, calls } = makeInvoke()
    await makeFolderAdapter(F, invoke).deleteAttachment('img-x.png')
    expect(calls).toEqual([{ cmd: 'delete_attachment', args: { folder: F, name: 'img-x.png' } }])
  })
})

describe('folderAdapter.subscribeChanges', () => {
  it('事件到达触发回调；退订调用 unlisten', async () => {
    const unlisten = vi.fn()
    let handler: (() => void) | undefined
    listenMock.mockImplementationOnce(async (_evt: string, h: () => void) => {
      handler = h
      return unlisten
    })
    const adapter = makeFolderAdapter(F, makeInvoke().invoke)
    const cb = vi.fn()
    const unsubscribe = adapter.subscribeChanges(cb)
    await vi.waitFor(() => expect(handler).toBeDefined())
    handler!()
    expect(cb).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('退订先于 listen 完成：迟到的句柄立即释放；退订早于链启动则 listen 根本不发起', async () => {
    // 场景 A：listen 已发起、promise 未决时退订 → 迟到句柄被立即释放
    let listenStarted = false
    let resolveListen: (fn: () => void) => void = () => {}
    const lateUnlisten = vi.fn()
    listenMock.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          listenStarted = true
          resolveListen = resolve
        }),
    )
    const adapter = makeFolderAdapter(F, makeInvoke().invoke)
    const cb = vi.fn()
    const unsubscribe = adapter.subscribeChanges(cb)
    await vi.waitFor(() => expect(listenStarted).toBe(true))
    unsubscribe()
    resolveListen(lateUnlisten)
    await vi.waitFor(() => expect(lateUnlisten).toHaveBeenCalledTimes(1))
    expect(cb).not.toHaveBeenCalled()

    // 场景 B：退订发生在动态 import 链启动前 → listen 不发起
    const never = vi.fn()
    listenMock.mockImplementationOnce(async () => never)
    adapter.subscribeChanges(vi.fn())()
    await new Promise((r) => setTimeout(r, 10))
    expect(never).not.toHaveBeenCalled()
  })
})
