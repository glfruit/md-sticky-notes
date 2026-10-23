import { describe, expect, it } from 'vitest'
import { updaterReducer, dismissedKey } from '../updater'
import type { UpdaterState } from '../updater'

const IDLE: UpdaterState = { phase: 'idle' }

describe('updaterReducer', () => {
  it('check-start 进入 checking', () => {
    expect(updaterReducer(IDLE, { type: 'check-start' })).toEqual({ phase: 'checking' })
  })

  it('available 记录版本与说明', () => {
    const next = updaterReducer(IDLE, { type: 'available', version: '0.2.0', notes: '修复了若干问题' })
    expect(next).toEqual({ phase: 'available', version: '0.2.0', notes: '修复了若干问题' })
  })

  it('download-start 保留版本信息并把进度清零', () => {
    const available = updaterReducer(IDLE, { type: 'available', version: '0.2.0' })
    const next = updaterReducer(available, { type: 'download-start' })
    expect(next).toEqual({ phase: 'downloading', version: '0.2.0', received: 0, total: null })
  })

  it('download-progress 更新已下载字节数', () => {
    const downloading = updaterReducer(IDLE, { type: 'download-start' })
    const next = updaterReducer(downloading, { type: 'download-progress', received: 512, total: 1024 })
    expect(next.phase).toBe('downloading')
    expect(next.received).toBe(512)
    expect(next.total).toBe(1024)
  })

  it('downloaded 覆盖 downloading 并保留版本', () => {
    const downloading = updaterReducer(
      { phase: 'idle' },
      { type: 'available', version: '0.2.0' },
    )
    const next = updaterReducer(downloading, { type: 'downloaded' })
    expect(next.phase).toBe('downloaded')
    expect(next.version).toBe('0.2.0')
  })

  it('error 带出错误信息', () => {
    const next = updaterReducer(IDLE, { type: 'error', message: '网络不通' })
    expect(next).toEqual({ phase: 'error', message: '网络不通' })
  })

  it('up-to-date 进入已是最新态', () => {
    expect(updaterReducer(IDLE, { type: 'up-to-date' })).toEqual({ phase: 'up-to-date' })
  })
})

describe('dismissedKey', () => {
  it('按版本区分，避免升级后横幅被旧版本的关闭状态压住', () => {
    expect(dismissedKey('0.1.0')).toBe('md-sticky-notes:update-dismissed:0.1.0')
    expect(dismissedKey('0.2.0')).not.toBe(dismissedKey('0.1.0'))
  })
})
