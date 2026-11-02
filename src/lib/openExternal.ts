import { isTauri } from '@/lib/storage'

/** 用系统浏览器打开外链（桌面版走 opener 插件，网页版开新标签页） */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank')
  }
}
