import { describe, expect, it } from 'vitest'
import { getStorage, getFolderCapable } from '../storage'

/** 换装路径（applyFolder / initStorage）依赖 Tauri invoke 注入，node 测试无法触发——
 *  这里只锁默认 local 态的单点收窄契约；换装序列由 #27 的实现注记与桌面冒烟覆盖。 */
describe('存储单例收窄（默认 local 态）', () => {
  it('getStorage 是 localAdapter，getFolderCapable 为 null（网页版 / 桌面未初始化）', () => {
    expect(getStorage().kind).toBe('local')
    expect(getStorage().describe()).toBe('浏览器本地存储')
    expect(getFolderCapable()).toBeNull()
  })
})
