import { useEffect, useMemo, useRef } from 'react'
import 'highlight.js/styles/github-dark.css'
import { getAttachmentUrl, attachmentId } from '@/lib/attachments'
import { renderPreviewHtml } from '@/lib/markdownRender'
import { openExternal } from '@/lib/openExternal'

export function Markdown({ source }: { source: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  // 渲染管线（marked → 消毒 → 任务行盖章）在 lib/markdownRender，与契约测试共用同一份配置
  const decorated = useMemo(() => renderPreviewHtml(source), [source])

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

  // 预览里的链接点击：http(s)/mailto 交给系统浏览器，其余（如 attachment://）不劫持 WebView
  const onLinkClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href') ?? ''
    if (/^(https?|mailto):/i.test(href)) void openExternal(href)
  }

  if (!source.trim()) {
    return <div className="md-body md-empty">空白便签 — 双击切换到编辑</div>
  }
  return <div ref={rootRef} className="md-body" onClick={onLinkClick} dangerouslySetInnerHTML={{ __html: decorated }} />
}
