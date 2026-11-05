/** 预览渲染管线：marked 解析 → DOMPurify 消毒 → decorateTasks 装饰（任务行盖章）。
 *  唯一入口 renderPreviewHtml：Markdown 组件与契约测试共用同一份配置，
 *  保证「测试测的就是预览跑的」。 */
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
import DOMPurify from 'dompurify'
import { decorateTasks } from './decorateTasks'

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

/** 便签正文 → 预览 HTML（消毒 + 任务行盖章后的安全片段） */
export function renderPreviewHtml(source: string): string {
  const raw = marked.parse(source, { async: false }) as string
  const sanitized = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['input'],
    // 不保留 disabled：复选框在预览里可点击，勾选状态由点击处理写回源码
    ADD_ATTR: ['checked', 'type', 'class'],
    // 在默认协议白名单基础上放行 attachment:// 本地图片引用
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|attachment):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
  return decorateTasks(sanitized, source)
}
