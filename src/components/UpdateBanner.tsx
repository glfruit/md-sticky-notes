import { useEffect, useReducer, useRef, useState } from 'react'
import { Download, RotateCw, X } from 'lucide-react'
import {
  checkForUpdate,
  dismissedKey,
  downloadAndInstall,
  relaunchApp,
  updaterReducer,
} from '@/lib/updater'
import { isTauri } from '@/lib/storage'
import type { Update } from '@tauri-apps/plugin-updater'

const AUTO_CHECK_DELAY_MS = 15_000

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

/** 桌面版更新横幅：启动 15s 后静默检查，发现新版提示下载安装；每个版本只打扰一次 */
export function UpdateBanner() {
  const [state, dispatch] = useReducer(updaterReducer, { phase: 'idle' })
  const updateRef = useRef<Update | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const update = await checkForUpdate()
          if (!update) return
          if (localStorage.getItem(dismissedKey(update.version)) === '1') return
          updateRef.current = update
          dispatch({ type: 'available', version: update.version, notes: update.body ?? undefined })
        } catch {
          /* 静默失败：未配置 / 无网络 / 接口不可达都不打扰用户 */
        }
      })()
    }, AUTO_CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    if (state.version) localStorage.setItem(dismissedKey(state.version), '1')
    setDismissed(true)
  }

  const visible =
    (state.phase === 'available' && !dismissed) ||
    state.phase === 'downloading' ||
    state.phase === 'downloaded' ||
    state.phase === 'error'
  if (!visible) return null

  return (
    <div className="fixed top-9 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 rounded-xl bg-black/85 backdrop-blur px-3.5 py-2 text-[12.5px] text-white shadow-xl border border-white/10">
      {state.phase === 'available' && (
        <>
          <Download size={14} className="shrink-0 opacity-80" />
          <span>新版本 v{state.version} 可用</span>
          <button
            className="h-6 px-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-[12px] font-medium"
            onClick={() => {
              if (updateRef.current) void downloadAndInstall(updateRef.current, dispatch)
            }}
          >
            立即更新
          </button>
          <button className="p-1 rounded hover:bg-white/15 opacity-70" onClick={dismiss} title="本版本不再提示">
            <X size={13} />
          </button>
        </>
      )}
      {state.phase === 'downloading' && (
        <>
          <Download size={14} className="shrink-0 opacity-80 animate-pulse" />
          <span>
            正在下载更新…
            {state.total ? ` ${fmtMB(state.received ?? 0)} / ${fmtMB(state.total)} MB` : ''}
          </span>
        </>
      )}
      {state.phase === 'downloaded' && (
        <>
          <span>更新已就绪，重启后生效</span>
          <button
            className="flex items-center gap-1 h-6 px-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-[12px] font-medium"
            onClick={() => void relaunchApp()}
          >
            <RotateCw size={12} />
            重启应用
          </button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <span className="opacity-80">更新失败：{state.message}</span>
          <button className="p-1 rounded hover:bg-white/15 opacity-70" onClick={() => setDismissed(true)}>
            <X size={13} />
          </button>
        </>
      )}
    </div>
  )
}
