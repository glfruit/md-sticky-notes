import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import 'highlight.js/styles/github-dark.css'
import DOMPurify from 'dompurify'
import { getAttachmentUrl, attachmentId } from '@/lib/attachments'
import { decorateTasks } from '@/lib/decorateTasks'
import { openExternal } from '@/lib/openExternal'

// 按需注册常用语言（lib/common 全量会多打包 ~170KB）
for (const [name, lang] of Object.entries({
  javascript,
  typescript,
  json,
  bash,
  python,
  rust,
  css,
  xml,
  markdown,
  sql,
  yaml,
  java,
  go,
  c,
  cpp,
})) {
  hljs.registerLanguage(name, lang)
}

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    },
  }),
)
marked.setOptions({ gfm: true, breaks: true })

export function Markdown({ source }: { source: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false }) as string
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ['input'],
      // 不保留 disabled：复选框在预览里可点击，勾选状态由点击处理写回源码
      ADD_ATTR: ['checked', 'type', 'class'],
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
  return (
    <div ref={rootRef} className="md-body" onClick={onLinkClick} dangerouslySetInnerHTML={{ __html: decorated }} />
  )
}
