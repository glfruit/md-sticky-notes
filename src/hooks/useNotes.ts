import { useCallback, useEffect, useRef, useState } from 'react'
import type { StickyNoteData, NoteColor } from '@/types/note'
import { COLOR_ORDER } from '@/types/note'
import { initStorage, getStorage, isTauri, setFolder } from '@/lib/storage'
import { clearAttachmentCache, cleanOrphanAttachments } from '@/lib/attachments'
import {
  findSpawnSpot,
  pinnedRects,
  clampIntoScrollArea,
  NEW_NOTE_SIZE,
} from '@/lib/layout'
import {
  mergeNotes,
  partitionTrash,
  nextZTop,
  normalizeZ,
  patchNote,
  seedNotes,
  Z_NORMALIZE_THRESHOLD,
} from '@/lib/notesSync'

/** 保存管线的时序布线层：防抖落盘 / flush / 文件夹监听 / 生命周期。
 *  合并仲裁、回收站 TTL、z 序治理、补丁政策、种子内容等纯决策在 lib/notesSync（可直测）；
 *  画布几何（出生定位/初始尺寸/负坐标裁剪）单源在 lib/layout。 */

const SEED_KEY = 'md-sticky-notes:seeded'

let idCounter = 0
const genId = () => `note-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export function useNotes() {
  const [notes, setNotes] = useState<StickyNoteData[]>([])
  const [trash, setTrash] = useState<StickyNoteData[]>([])
  const [loaded, setLoaded] = useState(false)
  const zTop = useRef(1)
  // state 的同步镜像：让各操作在 updater 外读取最新值、把副作用收敛到一处
  const notesRef = useRef<StickyNoteData[]>([])
  const trashRef = useRef<StickyNoteData[]>([])
  const saveTimers = useRef(new Map<string, { timer: number; note: StickyNoteData }>())

  const applyNotes = useCallback((next: StickyNoteData[]) => {
    notesRef.current = next
    setNotes(next)
  }, [])

  const applyTrash = useCallback((next: StickyNoteData[]) => {
    trashRef.current = next
    setTrash(next)
  }, [])

  // 初始加载（网页版读 localStorage；桌面版读同步文件夹）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await initStorage()
      let ns = (await getStorage().loadNotes()).map(clampIntoScrollArea)
      if (cancelled) return
      if (ns.length === 0 && !localStorage.getItem(SEED_KEY)) {
        ns = seedNotes()
        localStorage.setItem(SEED_KEY, '1')
        for (const n of ns) void getStorage().saveNote(n)
      }
      zTop.current = nextZTop(ns)
      applyNotes(ns)
      // 回收站：加载并清理 30 天前的条目
      const trashed = await getStorage().listTrash()
      if (cancelled) return
      const { kept, expired } = partitionTrash(trashed)
      for (const old of expired) void getStorage().deleteTrash(old.id)
      applyTrash(kept)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applyNotes, applyTrash])

  // 防抖落盘：连续输入时 600ms 后才写文件
  const scheduleSave = useCallback((note: StickyNoteData) => {
    const timers = saveTimers.current
    const old = timers.get(note.id)
    if (old !== undefined) window.clearTimeout(old.timer)
    const entry = { timer: 0, note }
    entry.timer = window.setTimeout(() => {
      timers.delete(note.id)
      void getStorage().saveNote(entry.note)
    }, 600)
    timers.set(note.id, entry)
  }, [])

  /** 立即写入所有未落盘的便签（退出 / 切换文件夹前调用），完成后 resolve */
  const flushPendingSaves = useCallback(async () => {
    const timers = saveTimers.current
    const pending = [...timers.values()]
    timers.clear()
    for (const entry of pending) window.clearTimeout(entry.timer)
    await Promise.all(pending.map((entry) => getStorage().saveNote(entry.note)))
  }, [])

  const addNote = useCallback(
    (content = '') => {
      const count = notesRef.current.length
      // 出生位置避开置顶便签（#8）：置顶层恒高于普通层，撞上会被盖死无法拖动；
      // 无空位由 findSpawnSpot 回退级联首项
      const spot = findSpawnSpot({
        occupied: pinnedRects(notesRef.current),
        size: NEW_NOTE_SIZE,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        start: count,
      })
      const note: StickyNoteData = {
        id: genId(),
        content,
        color: COLOR_ORDER[count % COLOR_ORDER.length] as NoteColor,
        x: spot.x,
        y: spot.y,
        width: NEW_NOTE_SIZE.width,
        height: NEW_NOTE_SIZE.height,
        collapsed: false,
        preview: false,
        z: zTop.current++,
        updatedAt: Date.now(),
      }
      applyNotes([...notesRef.current, note])
      void getStorage().saveNote(note)
      return note.id
    },
    [applyNotes],
  )

  const updateNote = useCallback(
    (id: string, patch: Partial<StickyNoteData>) => {
      const cur = notesRef.current
      const idx = cur.findIndex((n) => n.id === id)
      if (idx === -1) return
      const changed = patchNote(cur[idx], patch)
      const next = [...cur]
      next[idx] = changed
      applyNotes(next)
      scheduleSave(changed)
    },
    [applyNotes, scheduleSave],
  )

  // 删除 = 移入回收站（30 天内可恢复）
  const deleteNote = useCallback(
    (id: string) => {
      const cur = notesRef.current
      const target = cur.find((n) => n.id === id)
      if (!target) return
      // 取消未落盘的防抖，以回收站版本为准
      const pending = saveTimers.current.get(id)
      if (pending) {
        window.clearTimeout(pending.timer)
        saveTimers.current.delete(id)
      }
      applyNotes(cur.filter((n) => n.id !== id))
      const trashed = { ...target, updatedAt: Date.now() }
      applyTrash([trashed, ...trashRef.current])
      void getStorage().trashNote(trashed)
    },
    [applyNotes, applyTrash],
  )

  // 从回收站恢复
  const restoreTrashNote = useCallback(
    (id: string) => {
      const t = trashRef.current
      const target = t.find((n) => n.id === id)
      if (!target) return
      applyTrash(t.filter((n) => n.id !== id))
      const restored = clampIntoScrollArea({ ...target, z: zTop.current++ })
      applyNotes([...notesRef.current, restored])
      void getStorage().restoreTrash(restored)
    },
    [applyNotes, applyTrash],
  )

  // 彻底删除
  const permanentlyDeleteTrash = useCallback(
    (id: string) => {
      applyTrash(trashRef.current.filter((n) => n.id !== id))
      void getStorage().deleteTrash(id)
    },
    [applyTrash],
  )

  const bringToFront = useCallback(
    (id: string) => {
      const cur = notesRef.current
      const idx = cur.findIndex((n) => n.id === id)
      if (idx === -1) return
      if (cur[idx].z === zTop.current - 1) return // 已在最上层，避免重复写盘
      if (zTop.current >= Z_NORMALIZE_THRESHOLD) {
        // z 过大：按现有层级归一化为 1..n，目标便签置顶
        const { notes: normalized, nextTop } = normalizeZ(cur, id)
        zTop.current = nextTop
        applyNotes(normalized)
        for (let i = 0; i < normalized.length; i++) {
          if (normalized[i].z !== cur[i].z) scheduleSave(normalized[i])
        }
        return
      }
      const next = [...cur]
      next[idx] = { ...cur[idx], z: zTop.current++ }
      applyNotes(next)
      scheduleSave(next[idx])
    },
    [applyNotes, scheduleSave],
  )

  // 从存储层重载。
  // merge 模式（聚焦 / 文件夹变更通知）：正在编辑的便签以本地为准，避免打断输入；
  // replace 模式（切换文件夹）：先 flush 旧文件夹，再全量替换，避免旧便签漏进新文件夹
  const reload = useCallback(
    async (replace = false) => {
      if (replace) await flushPendingSaves()
      const fresh = (await getStorage().loadNotes()).map(clampIntoScrollArea)
      if (replace) {
        zTop.current = nextZTop(fresh)
        applyNotes(fresh)
        const trashed = await getStorage().listTrash()
        // 与全量加载一致：过期回收项一并彻底删除（原先 replace 只过滤不删）
        const { kept, expired } = partitionTrash(trashed)
        for (const old of expired) void getStorage().deleteTrash(old.id)
        applyTrash(kept)
        return
      }
      const cur = notesRef.current
      const merged = mergeNotes(cur, fresh)
      zTop.current = Math.max(zTop.current, nextZTop(merged))
      // mergeNotes 无变化返回 cur 原引用：引用相等就不重渲染（自己的写入也会触发监听事件）
      if (merged !== cur) applyNotes(merged)
    },
    [applyNotes, applyTrash, flushPendingSaves],
  )

  // 切换同步文件夹：flush → 换适配器（含重挂监听）→ 全量重载
  const switchFolder = useCallback(
    async (path: string) => {
      await flushPendingSaves()
      clearAttachmentCache()
      await setFolder(path)
      await reload(true)
    },
    [flushPendingSaves, reload],
  )

  /** 手动清理未被引用的附件，返回删除数量 */
  const cleanAttachments = useCallback(
    async () => cleanOrphanAttachments(notesRef.current, trashRef.current),
    [],
  )

  // 桌面版：窗口重新获得焦点时从文件夹拉一次（另一台机器的改动同步进来）
  useEffect(() => {
    if (!loaded) return
    const onFocus = () => {
      if (getStorage().kind === 'folder') void reload()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loaded, reload])

  // 桌面版：Rust 文件夹监听事件 → 去抖后增量重载（保持聚焦时也能同步另一台机器的改动）
  useEffect(() => {
    if (!loaded || !isTauri()) return
    let unlisten: (() => void) | undefined
    let timer = 0
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen('folder-changed', () => {
        if (getStorage().kind !== 'folder') return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void reload(), 300)
      }).then((fn) => {
        unlisten = fn
      }),
    )
    return () => {
      unlisten?.()
      window.clearTimeout(timer)
    }
  }, [loaded, reload])

  // 文件夹模式：启动 15 秒后清理孤儿附件（等云盘同步先拉全文件）
  useEffect(() => {
    if (!loaded || getStorage().kind !== 'folder') return
    const t = window.setTimeout(() => void cleanAttachments(), 15_000)
    return () => window.clearTimeout(t)
  }, [loaded, cleanAttachments])

  // 退出前把防抖中的内容立即落盘：
  // - pagehide / visibilitychange 兜底（尽力而为，无法等待完成）
  // - Tauri 关窗事件可等待写完后真正关闭
  useEffect(() => {
    const flushBestEffort = () => void flushPendingSaves()
    window.addEventListener('pagehide', flushBestEffort)
    const onVisibility = () => {
      if (document.hidden) flushBestEffort()
    }
    document.addEventListener('visibilitychange', onVisibility)
    let cleanupTauri: (() => void) | undefined
    if (isTauri()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        void win.onCloseRequested(async (e) => {
          e.preventDefault()
          await flushPendingSaves()
          await win.destroy()
        }).then((unlisten) => {
          cleanupTauri = unlisten
        })
      })
    }
    return () => {
      window.removeEventListener('pagehide', flushBestEffort)
      document.removeEventListener('visibilitychange', onVisibility)
      cleanupTauri?.()
    }
  }, [flushPendingSaves])

  return {
    notes,
    trash,
    loaded,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    reload,
    switchFolder,
    cleanAttachments,
    flushPendingSaves,
    restoreTrashNote,
    permanentlyDeleteTrash,
  }
}
