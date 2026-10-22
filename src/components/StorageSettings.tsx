import { useState } from 'react'
import { FolderOpen, HardDrive, Cloud, X, BrushCleaning } from 'lucide-react'
import { isTauri, getFolder, pickFolder } from '@/lib/storage'

const PREFILL_KEY = 'md-sticky-notes:clipboard-prefill'

interface Props {
  onClose: () => void
  /** 切换同步文件夹（flush 旧文件夹 → 全量重载新文件夹） */
  onSwitchFolder: (path: string) => Promise<void>
  /** 清理未被引用的附件，返回删除数量 */
  onCleanAttachments: () => Promise<number>
}

/** 存储位置设置面板（桌面版可选同步文件夹，默认 Dropbox） */
export function StorageSettings({ onClose, onSwitchFolder, onCleanAttachments }: Props) {
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)
  const [clipboardPrefill, setClipboardPrefill] = useState(
    () => localStorage.getItem(PREFILL_KEY) !== '0',
  )
  const folder = getFolder()

  const togglePrefill = (on: boolean) => {
    setClipboardPrefill(on)
    localStorage.setItem(PREFILL_KEY, on ? '1' : '0')
  }

  const changeFolder = async () => {
    setBusy(true)
    try {
      const picked = await pickFolder()
      if (picked) {
        await onSwitchFolder(picked)
      }
    } finally {
      setBusy(false)
    }
  }

  const cleanAttachments = async () => {
    setCleaning(true)
    setCleanResult(null)
    try {
      const removed = await onCleanAttachments()
      setCleanResult(removed > 0 ? `已清理 ${removed} 张未引用图片` : '没有需要清理的图片')
    } catch {
      setCleanResult('清理失败，请稍后再试')
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-16 bg-black/20" onPointerDown={onClose}>
      <div
        className="w-[440px] max-w-[90vw] rounded-xl bg-white/95 backdrop-blur-xl shadow-2xl border border-black/10 p-4"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Cloud size={15} className="text-black/60" />
          <span className="flex-1 text-[14px] font-semibold text-black/80">存储与同步</span>
          <button className="p-1 rounded hover:bg-black/10 text-black/50" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {isTauri() ? (
          <>
            <div className="text-[12px] text-black/50 mb-1.5">便签保存为 Markdown 文件，存放在：</div>
            <div className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2">
              <FolderOpen size={14} className="text-black/50 shrink-0" />
              <span className="flex-1 text-[12px] text-black/75 truncate font-mono">{folder}</span>
            </div>
            <div className="flex gap-2 mt-2.5">
              <button
                className="flex-1 h-8 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[13px] disabled:opacity-50"
                onClick={changeFolder}
                disabled={busy || cleaning}
              >
                {busy ? '选择中…' : '更换同步文件夹…'}
              </button>
              <button
                className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-black/5 hover:bg-black/10 text-black/70 text-[13px] disabled:opacity-50"
                onClick={() => void cleanAttachments()}
                disabled={busy || cleaning}
                title="删除未被任何便签引用的图片文件"
              >
                <BrushCleaning size={14} />
                {cleaning ? '清理中…' : '清理图片'}
              </button>
            </div>
            {cleanResult && (
              <div className="mt-2 text-[11px] text-black/50">{cleanResult}</div>
            )}
            <div className="mt-3 pt-2.5 border-t border-black/10 flex items-start gap-2">
              <input
                id="clipboard-prefill"
                type="checkbox"
                className="mt-0.5 accent-blue-500"
                checked={clipboardPrefill}
                onChange={(e) => togglePrefill(e.target.checked)}
              />
              <label htmlFor="clipboard-prefill" className="text-[12px] leading-relaxed text-black/60 cursor-pointer">
                全局热键新建便签时<strong>自动预填剪贴板内容</strong>
                <span className="block text-[11px] text-black/40">
                  方便随手收藏复制的文字；注意剪贴板若含敏感信息（如密码）会被写进同步文件夹
                </span>
              </label>
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-black/45">
              把这个文件夹放在云盘同步目录里（默认已选 Dropbox，可换成 iCloud Drive、坚果云等），
              另一台机器装同一个应用并指向同一文件夹即可同步。
              文件夹里的改动会实时同步进来（另一台机器编辑、云盘拉取完成都会自动刷新）。
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <HardDrive size={15} className="text-black/50 mt-0.5 shrink-0" />
            <div className="text-[12px] leading-relaxed text-black/60">
              当前是网页版，便签保存在<strong>浏览器本地</strong>。
              需要多机同步（Dropbox / iCloud / 坚果云）请使用桌面版应用，
              便签会以 Markdown 文件形式存进你选的同步文件夹。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
