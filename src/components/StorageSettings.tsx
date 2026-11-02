import { useState } from 'react'
import { FolderOpen, HardDrive, Cloud, X, BrushCleaning, TriangleAlert } from 'lucide-react'
import { isTauri, getFolder, pickFolder, detectSyncRoot, migrateFolderData, syncRootLabel } from '@/lib/storage'
import { UpdaterSection } from './UpdaterSection'

const PREFILL_KEY = 'md-sticky-notes:clipboard-prefill'

interface Props {
  onClose: () => void
  /** 切换同步文件夹（flush 旧文件夹 → 全量重载新文件夹） */
  onSwitchFolder: (path: string) => Promise<void>
  /** 切换前把防抖中的未落盘内容立即写进旧文件夹（保证迁移拷到最新数据） */
  onFlushPending: () => Promise<void>
  /** 清理未被引用的附件，返回删除数量 */
  onCleanAttachments: () => Promise<number>
}

/** 存储位置设置面板（桌面版可选同步文件夹，首次启动按 坚果云 → Dropbox 顺序探测） */
export function StorageSettings({ onClose, onSwitchFolder, onFlushPending, onCleanAttachments }: Props) {
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)
  const [switchResult, setSwitchResult] = useState<string | null>(null)
  // 已选择但尚未应用的目标：syncRoot 为空表示不在云盘同步目录内，须用户确认后才切换
  const [pending, setPending] = useState<{ path: string; syncRoot: string } | null>(null)
  const [clipboardPrefill, setClipboardPrefill] = useState(
    () => localStorage.getItem(PREFILL_KEY) !== '0',
  )
  const folder = getFolder()

  const togglePrefill = (on: boolean) => {
    setClipboardPrefill(on)
    localStorage.setItem(PREFILL_KEY, on ? '1' : '0')
  }

  /** 应用切换：flush 旧文件夹 → 托管目录内则自动迁移数据 → 切换并全量重载 */
  const applySwitch = async (path: string, syncRoot: string) => {
    if (!folder) return
    setBusy(true)
    try {
      await onFlushPending()
      let migrated = ''
      if (syncRoot) {
        const [notes, trash, atts] = await migrateFolderData(folder, path)
        const parts = [
          notes > 0 ? `${notes} 个便签` : '',
          trash > 0 ? `${trash} 个回收站便签` : '',
          atts > 0 ? `${atts} 个附件` : '',
        ].filter(Boolean)
        if (parts.length > 0) migrated = `已自动迁移 ${parts.join('、')}`
      }
      await onSwitchFolder(path)
      setPending(null)
      setSwitchResult(
        syncRoot
          ? `已切换到${syncRootLabel(syncRoot)}同步目录${migrated ? `，${migrated}` : '（新文件夹为空，无需迁移）'}`
          : '已切换。注意：该文件夹不在云盘同步目录内，多机同步不会生效',
      )
    } catch (e) {
      setSwitchResult(`切换失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const changeFolder = async () => {
    setSwitchResult(null)
    setBusy(true)
    try {
      const picked = await pickFolder()
      if (!picked) return
      if (picked === folder) {
        setSwitchResult('选择的文件夹与当前相同')
        return
      }
      const syncRoot = await detectSyncRoot(picked)
      if (syncRoot) {
        // 受管的云盘同步目录：按用户选择自动完成数据迁移
        await applySwitch(picked, syncRoot)
      } else {
        // 不在任何同步目录内：先提醒，等用户确认
        setPending({ path: picked, syncRoot: '' })
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
            {(cleanResult || switchResult) && (
              <div className="mt-2 text-[11px] leading-relaxed text-black/55">
                {cleanResult && <div>{cleanResult}</div>}
                {switchResult && <div>{switchResult}</div>}
              </div>
            )}
            {pending && !pending.syncRoot && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-black/70">
                  <TriangleAlert size={13} className="text-amber-500 shrink-0 mt-px" />
                  <span>
                    所选文件夹<strong>不在任何云盘同步目录内</strong>（Dropbox / iCloud Drive / 坚果云 / OneDrive 等），
                    切换后数据只存本机，<strong>多机同步不会生效</strong>。仍然切换吗？
                  </span>
                </div>
                <div className="flex gap-2 mt-1.5 ml-[19px]">
                  <button
                    className="h-6 px-2.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] disabled:opacity-50"
                    onClick={() => void applySwitch(pending.path, '')}
                    disabled={busy}
                  >
                    仍要切换
                  </button>
                  <button
                    className="h-6 px-2.5 rounded-md bg-black/5 hover:bg-black/10 text-black/70 text-[11px] disabled:opacity-50"
                    onClick={() => setPending(null)}
                    disabled={busy}
                  >
                    取消
                  </button>
                </div>
              </div>
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
              把这个文件夹放在云盘同步目录里（首次启动按 坚果云 → Dropbox 顺序自动选择），
              另一台机器装同一个应用并指向同一文件夹即可同步。
              更换到云盘同步目录时，现有便签和附件会<strong>自动迁移</strong>过去；文件夹里的改动也会实时同步进来。
            </div>
            <UpdaterSection />
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
