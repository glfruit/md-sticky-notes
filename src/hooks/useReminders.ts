import { useEffect } from 'react'
import type { StickyNoteData } from '@/types/note'
import { isTauri } from '@/lib/storage'
import { extractTasks, extractTaskTime } from '@/lib/editor'

const NOTIFIED_KEY = 'md-sticky-notes:notified'
/** 到点前后的触发窗口 */
const FIRE_WINDOW_MS = 120_000

function loadNotified(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * 到点系统通知（桌面版）：每 30 秒扫描所有未完成任务，
 * 任务里写了时间（15:30 / 2026-10-25 / 2026-10-25 09:30）到点即弹系统通知。
 * 去重 key 用「便签 id + 任务文本 + 时间戳」——任务序号会随列表增删漂移，不可靠。
 */
export function useReminders(notes: StickyNoteData[]) {
  useEffect(() => {
    if (!isTauri()) return
    // 权限每个会话只请求一次，之后沿用结果
    let permission: boolean | null = null

    const check = async () => {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      )
      if (permission === null) {
        let granted = await isPermissionGranted()
        if (!granted) {
          granted = (await requestPermission()) === 'granted'
        }
        permission = granted
      }
      if (!permission) return

      const notified = loadNotified()
      const now = Date.now()
      let changed = false
      for (const note of notes) {
        for (const task of extractTasks(note.content)) {
          if (task.status === 'done' || task.status === 'cancelled') continue
          const ts = extractTaskTime(task.text)
          if (ts === null) continue
          if (now >= ts && now - ts < FIRE_WINDOW_MS) {
            const key = `${note.id}:${task.text}:${ts}`
            if (!notified.has(key)) {
              notified.add(key)
              changed = true
              void sendNotification({ title: '⏰ MD 便签提醒', body: task.text })
            }
          }
        }
      }
      if (changed) {
        localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-300)))
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), 30_000)
    return () => window.clearInterval(timer)
  }, [notes])
}
