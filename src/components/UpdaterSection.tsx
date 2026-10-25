import { useEffect, useReducer, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getVersion } from '@tauri-apps/api/app'
import {
  checkForUpdate,
  downloadAndInstall,
  relaunchApp,
  updaterReducer,
} from '@/lib/updater'
import { isTauri } from '@/lib/storage'
import type { Update } from '@tauri-apps/plugin-updater'

function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

/** 设置面板里的「关于与更新」区：显示当前版本 + 手动检查更新 + 下载安装 */
export function UpdaterSection() {
  const [state, dispatch] = useReducer(updaterReducer, { phase: 'idle' })
  const [version, setVersion] = useState<string | null>(null)
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    void getVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  if (!isTauri()) return null

  const check = async () => {
    dispatch({ type: 'check-start' })
    try {
      const update = await checkForUpdate()
      if (update) {
        updateRef.current = update
        dispatch({ type: 'available', version: update.version, notes: update.body ?? undefined })
      } else {
        dispatch({ type: 'up-to-date' })
      }
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const button = (() => {
    switch (state.phase) {
      case 'checking':
        return <span className="text-[12px] text-black/40">检查中…</span>
      case 'up-to-date':
        return <span className="text-[12px] text-green-600">已是最新 ✓</span>
      case 'available':
        return (
          <button
            className="h-7 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12.5px]"
            onClick={() => {
              if (updateRef.current) void downloadAndInstall(updateRef.current, dispatch)
            }}
          >
            下载 v{state.version}
          </button>
        )
      case 'downloading':
        return (
          <span className="text-[12px] text-black/50">
            下载中…
            {state.total ? ` ${fmtMB(state.received ?? 0)} / ${fmtMB(state.total)} MB` : ''}
          </span>
        )
      case 'downloaded':
        return (
          <button
            className="flex items-center gap-1 h-7 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12.5px]"
            onClick={() => void relaunchApp()}
          >
            <RefreshCw size={12} />
            重启应用完成更新
          </button>
        )
      case 'error':
        return (
          <button className="h-7 px-3 rounded-lg bg-black/5 hover:bg-black/10 text-black/70 text-[12.5px]" onClick={() => void check()}>
            重试
          </button>
        )
      default:
        return (
          <button className="h-7 px-3 rounded-lg bg-black/5 hover:bg-black/10 text-black/70 text-[12.5px]" onClick={() => void check()}>
            检查更新…
          </button>
        )
    }
  })()

  return (
    <div className="mt-3 pt-2.5 border-t border-black/10 flex items-center gap-2">
      <span className="text-[12px] text-black/50 flex-1">
        当前版本 {version ?? '…'}
        {state.phase === 'available' && state.notes && (
          <span className="block text-[11px] text-black/40 mt-0.5 line-clamp-2">{state.notes}</span>
        )}
        {state.phase === 'error' && (
          <span className="block text-[11px] text-red-500/80 mt-0.5">
            检查失败：{state.message}
            <span className="block text-black/40 mt-0.5">
              常见原因：系统代理指向了失效地址（代理工具残留设置）或暂时断网；浏览器正常不代表系统代理正常。
            </span>
          </span>
        )}
      </span>
      {button}
    </div>
  )
}
