import { localAdapter } from './localAdapter'
import { makeFolderAdapter } from './folderAdapter'
import type { Invoke } from './folderAdapter'
import type { StorageAdapter } from './types'

const FOLDER_KEY = 'md-sticky-notes:folder'

let adapter: StorageAdapter = localAdapter
let folderPath: string | null = null
let tauriInvoke: Invoke | null = null

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function getStorage(): StorageAdapter {
  return adapter
}

export function getFolder(): string | null {
  return folderPath
}

/** 应用启动时初始化：Tauri 环境启用文件夹存储，默认 Dropbox */
export async function initStorage(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  tauriInvoke = invoke as Invoke

  folderPath = localStorage.getItem(FOLDER_KEY)
  if (!folderPath) {
    const home = await invoke<string>('home_dir')
    const dropbox = `${home}/Library/CloudStorage/Dropbox`
    const hasDropbox = await invoke<boolean>('path_exists', { path: dropbox })
    folderPath = `${hasDropbox ? dropbox : `${home}/Documents`}/MD 便签`
    localStorage.setItem(FOLDER_KEY, folderPath)
  }
  adapter = makeFolderAdapter(folderPath, tauriInvoke)
  // 文件夹变更监听（另一台机器 / 云盘客户端改动了便签 → 通知前端重载）
  await invoke('watch_folder', { folder: folderPath }).catch(() => {})
}

/** 切换同步文件夹（Tauri only） */
export async function setFolder(path: string): Promise<void> {
  if (!tauriInvoke) return
  folderPath = path
  localStorage.setItem(FOLDER_KEY, path)
  adapter = makeFolderAdapter(path, tauriInvoke)
  await tauriInvoke('watch_folder', { folder: path }).catch(() => {})
}

/** 弹出系统文件夹选择器，返回选择的路径（取消返回 null） */
export async function pickFolder(): Promise<string | null> {
  if (!tauriInvoke) return null
  return tauriInvoke<string | null>('pick_folder')
}
