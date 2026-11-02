import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 自托管 UI 字体（离线可用），中文回退系统黑体（见 tailwind.config fontFamily.sans）
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
