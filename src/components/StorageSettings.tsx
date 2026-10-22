import { useState } from 'react'
import { FolderOpen, HardDrive, Cloud, X } from 'lucide-react'
import { isTauri, getFolder, pickFolder, setFolder } from '@/lib/storage'

interface Props {
  onClose: () => void
  onFolderChanged: () => void
}

/** 存储位置设置面板（桌面版可选同步文件夹，默认 Dropbox） */
export function StorageSettings({ onClose, onFolderChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const folder = getFolder()

  const changeFolder = async () => {
    setBusy(true)
    try {
      const picked = await pickFolder()
      if (picked) {
        await setFolder(picked)
        onFolderChanged()
      }
    } finally {
      setBusy(false)
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
            <button
              className="mt-2.5 w-full h-8 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[13px] disabled:opacity-50"
              onClick={changeFolder}
              disabled={busy}
            >
              {busy ? '选择中…' : '更换同步文件夹…'}
            </button>
            <div className="mt-3 text-[11px] leading-relaxed text-black/45">
              把这个文件夹放在云盘同步目录里（默认已选 Dropbox，可换成 iCloud Drive、坚果云等），
              另一台机器装同一个应用并指向同一文件夹即可同步。
              窗口重新获得焦点时会自动拉取其他机器的改动。
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
