import { useCallback, useEffect, useRef } from 'react'
import type { StickyNoteData, RevealTarget } from '@/types/note'
import { formatDate, formatTime, formatDateTime } from '@/lib/datetime'
import { saveAttachment, attachmentUrl } from '@/lib/attachments'
import { htmlTableToMarkdown, tsvToMarkdown } from '@/lib/tablePaste'
import { handleEnter, handleTab } from '@/lib/editor'

/** 编辑器机制半边（自 StickyNote 拆出，#32）：textarea 的插入 / 粘贴拖入 / 颜色 /
 *  键盘增强与光标 / 搜索选中 effects。纯搬迁（依赖数组逐字保留），可测逻辑在
 *  lib/editor·tablePaste·attachments，本 hook 只做 DOM 读写与 onUpdate 布线。 */
export function useNoteEditor(opts: {
  note: StickyNoteData
  onUpdate: (id: string, patch: Partial<StickyNoteData>) => void
  onFocus: (id: string) => void
  /** ⌘E 切回预览（语法清理 + toast 属主在组件） */
  switchToPreview: () => void
  /** 搜索跳转目标（编辑模式选中第一处；预览高亮在 useNotePreview） */
  reveal?: RevealTarget | null
}) {
  const { note, onUpdate, onFocus, switchToPreview, reveal } = opts
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const pendingReveal = useRef<{ start: number; end: number } | null>(null)

  // 编辑模式下自动聚焦
  useEffect(() => {
    if (!note.preview && !note.collapsed) textareaRef.current?.focus()
  }, [note.preview, note.collapsed])

  // 插入文本后恢复光标位置
  useEffect(() => {
    if (pendingCursor.current !== null && textareaRef.current) {
      const pos = pendingCursor.current
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
      pendingCursor.current = null
    }
  }, [note.content])

  // 搜索跳转：先切到编辑模式并展开
  const revealNonce = reveal?.nonce
  useEffect(() => {
    if (revealNonce === undefined || !reveal) return
    pendingReveal.current = { start: reveal.start, end: reveal.end }
    if (note.preview || note.collapsed) {
      onUpdate(note.id, { preview: false, collapsed: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce])

  // 编辑模式下执行选中 + 滚动到匹配位置
  useEffect(() => {
    if (note.preview || note.collapsed) return
    const target = pendingReveal.current
    if (!target || !textareaRef.current) return
    const ta = textareaRef.current
    ta.focus()
    ta.setSelectionRange(target.start, target.end)
    const lines = note.content.slice(0, target.start).split('\n').length
    ta.scrollTop = Math.max(0, (lines - 4) * 21)
    pendingReveal.current = null
  })

  const insertText = useCallback(
    (text: string, padSpaces = true) => {
      const ta = textareaRef.current
      if (!ta) {
        onUpdate(note.id, { content: note.content + text })
        return
      }
      const start = ta.selectionStart ?? note.content.length
      const end = ta.selectionEnd ?? start
      const before = note.content.slice(0, start)
      const after = note.content.slice(end)
      // 与上下文之间留一个空格，避免粘连
      const needLead = padSpaces && before && !/[\s\n]$/.test(before) ? ' ' : ''
      const needTail = padSpaces && after && !/^[\s\n]/.test(after) ? ' ' : ''
      const inserted = needLead + text + needTail
      pendingCursor.current = start + needLead.length + text.length
      onUpdate(note.id, { content: before + inserted + after })
    },
    [note.id, note.content, onUpdate],
  )

  const insertDate = useCallback(() => insertText(formatDate()), [insertText])
  const insertTime = useCallback(() => insertText(formatTime()), [insertText])
  const insertDateTime = useCallback(() => insertText(formatDateTime()), [insertText])
  const insertEmoji = useCallback((emoji: string) => insertText(emoji, false), [insertText])

  // 插入 Markdown 表格，光标落到第一个数据单元格
  const insertTable = useCallback(
    (rows: number, cols: number) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? note.content.length
      const end = ta.selectionEnd ?? start
      const before = note.content.slice(0, start)
      const after = note.content.slice(end)
      // 表格块前后保证空行
      const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
      const tail = after && !after.startsWith('\n') ? '\n' : ''
      const header = `| ${Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ')} |`
      const sep = `|${' --- |'.repeat(cols)}`
      const body = Array.from({ length: rows }, () => `|${'  |'.repeat(cols)}`).join('\n')
      const table = `${header}\n${sep}\n${body}\n`
      // 光标：第一行数据的第一个单元格内
      const cursor = start + lead.length + header.length + 1 + sep.length + 1 + 2
      pendingReveal.current = { start: cursor, end: cursor }
      onUpdate(note.id, { content: before + lead + table + tail + after })
    },
    [note.id, note.content, onUpdate],
  )

  // 在光标处插入一个块级内容（图片引用 / 表格），前后自动补空行
  const insertBlock = useCallback(
    (block: string) => {
      const ta = textareaRef.current
      const content = note.content
      const start = ta ? ta.selectionStart : content.length
      const end = ta ? ta.selectionEnd : start
      const before = content.slice(0, start)
      const after = content.slice(end)
      const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
      const tail = after && !after.startsWith('\n') ? '\n' : ''
      const pos = start + lead.length + block.length
      pendingReveal.current = { start: pos, end: pos }
      onUpdate(note.id, { content: before + lead + block + tail + after })
    },
    [note.id, note.content, onUpdate],
  )

  // 保存剪贴板 / 拖入的图片并插入 Markdown 引用
  const insertImages = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return false
      const ids: string[] = []
      for (const f of images) {
        try {
          ids.push(await saveAttachment(f))
        } catch {
          // IndexedDB 不可用时跳过该图片
        }
      }
      if (ids.length > 0) {
        insertBlock(ids.map((id) => `![图片](${attachmentUrl(id)})`).join('\n'))
      }
      return true
    },
    [insertBlock],
  )

  // 粘贴：图片 → 本地存储；HTML 表格 / TSV → Markdown 表格；其余走默认
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData
      const imageFiles = Array.from(cd.items)
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (imageFiles.length > 0) {
        e.preventDefault()
        void insertImages(imageFiles)
        return
      }
      const html = cd.getData('text/html')
      if (html) {
        const md = htmlTableToMarkdown(html)
        if (md) {
          e.preventDefault()
          insertBlock(md)
          return
        }
      }
      const text = cd.getData('text/plain')
      if (text && text.includes('\t')) {
        const md = tsvToMarkdown(text)
        if (md) {
          e.preventDefault()
          insertBlock(md)
        }
      }
    },
    [insertImages, insertBlock],
  )

  // 拖入图片文件
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      onFocus(note.id)
      if (note.preview || note.collapsed) {
        onUpdate(note.id, { preview: false, collapsed: false })
      }
      void insertImages(files)
    },
    [note.id, note.preview, note.collapsed, onFocus, onUpdate, insertImages],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
    }
  }, [])

  // 给选中文字包一层带颜色的 span（无选区时插入占位并选中占位文字）
  const applyTextColor = useCallback(
    (color: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? start
      const selected = note.content.slice(start, end)
      const open = `<span style="color:${color}">`
      const inner = selected || '文字'
      const wrapped = open + inner + '</span>'
      pendingReveal.current = selected
        ? { start: start + wrapped.length, end: start + wrapped.length }
        : { start: start + open.length, end: start + open.length + inner.length }
      onUpdate(note.id, { content: note.content.slice(0, start) + wrapped + note.content.slice(end) })
    },
    [note.id, note.content, onUpdate],
  )

  // 清除选中范围内的 span 颜色标记
  const clearTextColor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? start
    const selected = note.content.slice(start, end)
    const cleaned = selected.replace(/<\/?span[^>]*>/g, '')
    pendingReveal.current = { start, end: start + cleaned.length }
    onUpdate(note.id, { content: note.content.slice(0, start) + cleaned + note.content.slice(end) })
  }, [note.id, note.content, onUpdate])

  // 窗口内键盘快捷键
  const applyEdit = useCallback(
    (r: { text: string; selStart: number; selEnd: number }) => {
      pendingReveal.current = { start: r.selStart, end: r.selEnd }
      onUpdate(note.id, { content: r.text })
    },
    [note.id, onUpdate],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // textarea 内的编辑增强：回车续接列表、Tab 缩进
      if (e.target instanceof HTMLTextAreaElement) {
        const ta = e.target
        if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey) {
          const r = handleEnter(note.content, ta.selectionStart, ta.selectionEnd)
          if (r) {
            e.preventDefault()
            applyEdit(r)
            return
          }
        } else if (e.key === 'Tab' && !mod && !e.altKey) {
          e.preventDefault()
          applyEdit(handleTab(note.content, ta.selectionStart, ta.selectionEnd, e.shiftKey))
          return
        }
      }
      // ⌥D 日期 / ⌥T 时间 / ⌥⇧T 日期+时间 / ⌘E 预览切换
      if (e.altKey && !mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        insertDate()
      } else if (e.altKey && !mod && e.key.toLowerCase() === 't') {
        e.preventDefault()
        if (e.shiftKey) insertDateTime()
        else insertTime()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (note.preview) onUpdate(note.id, { preview: false })
        else switchToPreview()
      }
    },
    [insertDate, insertTime, insertDateTime, applyEdit, switchToPreview, note.id, note.content, note.preview, onUpdate],
  )

  return {
    textareaRef,
    insertDate,
    insertTime,
    insertDateTime,
    insertEmoji,
    insertTable,
    handlePaste,
    handleDrop,
    handleDragOver,
    applyTextColor,
    clearTextColor,
    handleKeyDown,
  }
}
