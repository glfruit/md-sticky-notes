import { describe, expect, it } from 'vitest'
import { clampMenuPosition } from '../menu'

describe('clampMenuPosition：菜单左上角钳进视口', () => {
  it('视口内原样返回', () => {
    expect(clampMenuPosition(100, 200, 130, 170, 1280, 800)).toEqual({ x: 100, y: 200 })
  })

  it('右/下溢出收到贴边（菜单完整可见）', () => {
    expect(clampMenuPosition(1200, 700, 130, 170, 1280, 800)).toEqual({ x: 1150, y: 630 })
  })

  it('负坐标收到 0', () => {
    expect(clampMenuPosition(-20, -5, 130, 170, 1280, 800)).toEqual({ x: 0, y: 0 })
  })

  it('菜单比视口大：贴 0 起，宁可裁右下（右键落点总在视口内，左上贴边可见性最大）', () => {
    expect(clampMenuPosition(500, 500, 2000, 1500, 1280, 800)).toEqual({ x: 0, y: 0 })
  })

  it('零尺寸视口退化为 0,0', () => {
    expect(clampMenuPosition(100, 100, 130, 170, 0, 0)).toEqual({ x: 0, y: 0 })
  })
})
