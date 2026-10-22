import type { StickyNoteData } from '@/types/note'
import type { StorageAdapter } from './types'

const STORAGE_KEY = 'md-sticky-notes:v1'
const TRASH_KEY = 'md-sticky-notes:trash'

// ---------- IndexedDB（图片附件） ----------
const DB_NAME = 'md-sticky-notes'
const STORE = 'attachments'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function readAll(): StickyNoteData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StickyNoteData[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(notes: StickyNoteData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

/** 浏览器本地存储（localStorage + IndexedDB），网页版使用 */
export const localAdapter: StorageAdapter = {
  kind: 'local',
  describe: () => '浏览器本地存储',

  async loadNotes() {
    return readAll()
  },

  async saveNote(note) {
    const all = readAll()
    const i = all.findIndex((n) => n.id === note.id)
    if (i >= 0) all[i] = note
    else all.push(note)
    writeAll(all)
  },

  async deleteNote(id) {
    writeAll(readAll().filter((n) => n.id !== id))
  },

  async saveAttachment(blob, id) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  async getAttachment(id) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  },

  async trashNote(note) {
    writeAll(readAll().filter((n) => n.id !== note.id))
    const trash = readTrash()
    trash.push(note)
    localStorage.setItem(TRASH_KEY, JSON.stringify(trash))
  },

  async listTrash() {
    return readTrash()
  },

  async restoreTrash(note) {
    const all = readAll()
    const i = all.findIndex((n) => n.id === note.id)
    if (i >= 0) all[i] = note
    else all.push(note)
    writeAll(all)
    localStorage.setItem(TRASH_KEY, JSON.stringify(readTrash().filter((n) => n.id !== note.id)))
  },

  async deleteTrash(id) {
    localStorage.setItem(TRASH_KEY, JSON.stringify(readTrash().filter((n) => n.id !== id)))
  },
}

function readTrash(): StickyNoteData[] {
  try {
    const raw = localStorage.getItem(TRASH_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StickyNoteData[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
