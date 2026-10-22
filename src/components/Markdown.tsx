import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getAttachmentUrl, attachmentId } from '@/lib/attachments'
import { decorateTasks } from '@/lib/decorateTasks'

marked.setOptions({ gfm: true, breaks: true })

export function Markdown({ source }: { source: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false }) as string
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ['input'],
      // 不保留 disabled：复选框在预览里可点击，勾选状态由点击处理写回源码
      ADD_ATTR: ['checked', 'type'],
      // 在默认协议白名单基础上放行 attachment:// 本地图片引用
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|attachment):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    })
  }, [source])

  const decorated = useMemo(() => decorateTasks(html), [html])

  // 把 attachment:// 图片解析为缓存好的 Blob URL（每个附件整个生命周期只读一次 IPC）
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // 隐藏只含空白字符的代码块（行尾大量空格被解析成缩进代码块时不再显示黑框）
    root.querySelectorAll('pre').forEach((pre) => {
      if (!(pre.textContent ?? '').trim()) pre.style.display = 'none'
    })
    let cancelled = false
    root.querySelectorAll('img').forEach((img) => {
      const id = attachmentId(img.getAttribute('src') ?? '')
      if (!id) return
      void getAttachmentUrl(id).then((url) => {
        if (cancelled) return
        if (url) {
          img.setAttribute('src', url)
        } else {
          img.replaceWith(document.createTextNode('🖼 图片已被清理'))
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [decorated])

  if (!source.trim()) {
    return <div className="md-body md-empty">空白便签 — 双击切换到编辑</div>
  }
  return <div ref={rootRef} className="md-body" dangerouslySetInnerHTML={{ __html: decorated }} />
}
