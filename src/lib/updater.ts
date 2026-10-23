/** 自动更新（桌面版）：纯状态机 + tauri-plugin-updater 薄封装；网页版所有调用为 no-op */
import { isTauri } from './storage'
import type { Update } from '@tauri-apps/plugin-updater'

export interface UpdaterState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  notes?: string
  /** 已下载字节数（downloading 阶段） */
  received?: number
  /** 总字节数；null = 未知 */
  total?: number | null
  message?: string
}

export type UpdaterAction =
  | { type: 'check-start' }
  | { type: 'available'; version: string; notes?: string }
  | { type: 'up-to-date' }
  | { type: 'download-start' }
  | { type: 'download-progress'; received: number; total: number | null }
  | { type: 'downloaded' }
  | { type: 'error'; message: string }

export function updaterReducer(state: UpdaterState, action: UpdaterAction): UpdaterState {
  switch (action.type) {
    case 'check-start':
      return { phase: 'checking' }
    case 'available':
      return { phase: 'available', version: action.version, notes: action.notes }
    case 'up-to-date':
      return { phase: 'up-to-date' }
    case 'download-start':
      return { phase: 'downloading', version: state.version, notes: state.notes, received: 0, total: null }
    case 'download-progress':
      return { ...state, phase: 'downloading', received: action.received, total: action.total }
    case 'downloaded':
      return { ...state, phase: 'downloaded' }
    case 'error':
      return { phase: 'error', message: action.message }
  }
}

/** 检查更新；无更新返回 null。非 Tauri 环境（网页版）恒为 null */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null
  const { check } = await import('@tauri-apps/plugin-updater')
  return check()
}

/** 下载并安装更新；完成后由界面提示重启 */
export async function downloadAndInstall(
  update: Update,
  dispatch: (action: UpdaterAction) => void,
): Promise<void> {
  dispatch({ type: 'download-start' })
  let received = 0
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        dispatch({ type: 'download-progress', received: 0, total: event.data.contentLength ?? null })
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength
        dispatch({ type: 'download-progress', received, total: null })
      } else if (event.event === 'Finished') {
        dispatch({ type: 'downloaded' })
      }
    })
  } catch (e) {
    dispatch({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** 安装完成后重启应用（桌面版） */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

/** 横幅「本版本不再提示」的 localStorage 键 */
export function dismissedKey(version: string): string {
  return `md-sticky-notes:update-dismissed:${version}`
}
