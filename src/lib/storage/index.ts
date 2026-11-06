import { localAdapter } from './localAdapter'
import { makeFolderAdapter } from './folderAdapter'
import type { Invoke } from './folderAdapter'
import type { StorageAdapter, FolderCapable } from './types'

const FOLDER_KEY = 'md-sticky-notes:folder'

let adapter: StorageAdapter = localAdapter
let folderPath: string | null = null
let tauriInvoke: Invoke | null = null

/** 类型谓词：folder 态的 adapter 即 FolderCapable（唯一来源 makeFolderAdapter，无第二实例源） */
function isFolderCapable(a: StorageAdapter): a is FolderCapable {
  return a.kind === 'folder'
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function getStorage(): StorageAdapter {
  return adapter
}

/** 文件夹管理能力单点收窄（null = 网页版 / 桌面未初始化）：桌面专属操作全在 FolderCapable */
export function getFolderCapable(): FolderCapable | null {
  return isFolderCapable(adapter) ? adapter : null
}

export function getFolder(): string | null {
  return folderPath
}

/** 换装三步序列单源（initStorage / setFolder 共用）：记路径 → 换适配器 → 重挂文件夹监听 */
function applyFolder(path: string): void {
  const invoke = tauriInvoke!
  folderPath = path
  localStorage.setItem(FOLDER_KEY, path)
  adapter = makeFolderAdapter(path, invoke)
  // 文件夹变更监听（另一台机器 / 云盘客户端改动了便签 → 通知前端重载）；
  // 失败静默：无 watcher 只是不自动重载，读写不受影响
  void invoke('watch_folder', { folder: path }).catch(() => {})
}

/** 应用启动时初始化：Tauri 环境启用文件夹存储，默认按 坚果云 → Dropbox → Documents 探测。
 *  契约：本函数不 reject——初始化异常退回浏览器本地存储并 warn（folderAdapter 的每次
 *  invoke 都会同样失败，退回根目录无意义）；向上抛会让 useNotes 初始加载中断、loaded 卡 false 界面空白。 */
export async function initStorage(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    tauriInvoke = invoke as Invoke

    const saved = localStorage.getItem(FOLDER_KEY)
    if (saved) {
      applyFolder(saved)
      return
    }
    const home = await invoke<string>('home_dir')
    // 默认同步盘探测顺序：坚果云（国内主流，客户端默认 ~/Nutstore Files，老版本 ~/我的坚果云）
    // → Dropbox → Documents。只影响首次启动（已有用户的目录存在 localStorage，不受影响）。
    const candidates = [
      `${home}/Nutstore Files`,
      `${home}/我的坚果云`,
      `${home}/Library/CloudStorage/Dropbox`,
    ]
    let root = `${home}/Documents`
    for (const candidate of candidates) {
      if (await invoke<boolean>('path_exists', { path: candidate })) {
        root = candidate
        break
      }
    }
    applyFolder(`${root}/MD 便签`)
  } catch (e) {
    console.warn('[storage] 同步文件夹初始化失败，本次运行退回浏览器本地存储：', e)
  }
}

/** 切换同步文件夹（Tauri only；须在 initStorage 成功后调用，否则静默跳过） */
export async function setFolder(path: string): Promise<void> {
  if (!tauriInvoke) return
  applyFolder(path)
}
