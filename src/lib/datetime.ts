const pad = (n: number) => String(n).padStart(2, '0')

/** 2026-10-20 */
export function formatDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 15:03 */
export function formatTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 15:03:42 */
export function formatTimeWithSeconds(d = new Date()): string {
  return `${formatTime(d)}:${pad(d.getSeconds())}`
}

/** 2026-10-20 15:03 */
export function formatDateTime(d = new Date()): string {
  return `${formatDate(d)} ${formatTime(d)}`
}

/** 菜单栏用：10月20日 周二 15:03 */
export function formatMenuBar(d = new Date()): string {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week} ${formatTime(d)}`
}

/** 便签标题栏用：15:03 或 昨天 15:03 */
export function formatUpdatedAt(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay) return formatTime(d)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${formatTime(d)}`
  return `${formatDate(d)} ${formatTime(d)}`
}
