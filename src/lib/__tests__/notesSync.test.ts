import { describe, expect, it } from 'vitest'
import {
  mergeNotes,
  partitionTrash,
  nextZTop,
  normalizeZ,
  patchNote,
  seedNotes,
  TRASH_TTL_MS,
} from '../notesSync'
import type { StickyNoteData } from '../../types/note'

/** 测试便签工厂：只覆盖关心的字段，其余给合法默认值 */
const note = (over: Partial<StickyNoteData> & { id: string }): StickyNoteData => ({
  content: 'x',
  color: 'yellow',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  collapsed: false,
  preview: true,
  z: 1,
  updatedAt: 1000,
  ...over,
})

describe('mergeNotes 合并仲裁', () => {
  it('正在编辑（preview=false）的便签以本地为准，即使磁盘更新', () => {
    const local = note({ id: 'a', preview: false, updatedAt: 100 })
    const disk = note({ id: 'a', preview: true, updatedAt: 200, content: '磁盘版' })
    const merged = mergeNotes([local], [disk])
    expect(merged[0]).toBe(local)
  })

  it('非编辑便签本地不旧于磁盘（含相等）以本地为准——防抖窗口内磁盘是旧版', () => {
    const local = note({ id: 'a', updatedAt: 200, content: '本地版' })
    const disk = note({ id: 'a', updatedAt: 200, content: '磁盘旧版' })
    expect(mergeNotes([local], [disk])[0]).toBe(local)
    const older = note({ id: 'a', updatedAt: 199, content: '磁盘更旧' })
    expect(mergeNotes([local], [older])[0]).toBe(local)
  })

  it('非编辑便签磁盘严格更新时采磁盘', () => {
    const local = note({ id: 'a', updatedAt: 100, content: '本地旧版' })
    const disk = note({ id: 'a', updatedAt: 200, content: '磁盘新版' })
    const merged = mergeNotes([local], [disk])
    expect(merged[0].content).toBe('磁盘新版')
  })

  it('本地独有便签追加保留——保护防抖窗口内新建不被重载吞掉', () => {
    const a = note({ id: 'a', updatedAt: 200 })
    const newNote = note({ id: 'n', updatedAt: 300, content: '刚建还没落盘' })
    const disk = note({ id: 'a', updatedAt: 100 })
    const merged = mergeNotes([a, newNote], [disk])
    expect(merged).toHaveLength(2)
    expect(merged.some((n) => n === newNote)).toBe(true)
  })

  it('无变化返回 cur 原引用（引用相等 = 免重渲染）', () => {
    const a = note({ id: 'a', updatedAt: 200 })
    const b = note({ id: 'b', updatedAt: 300 })
    const cur = [a, b]
    const fresh = [{ ...a }, { ...b }]
    expect(mergeNotes(cur, fresh)).toBe(cur)
  })

  it('空对空返回原引用', () => {
    const cur: StickyNoteData[] = []
    expect(mergeNotes(cur, [])).toBe(cur)
  })

  it('本地独有恰为 cur 尾部且磁盘侧前缀全同 → 原引用（防抖窗口内新建触发重载）', () => {
    const a = note({ id: 'a', updatedAt: 200 })
    const pending = note({ id: 'n', updatedAt: 300, content: '刚建还没落盘' })
    const cur = [a, pending]
    // 重载读到磁盘旧版 a（本地赢），磁盘还没有 n
    const fresh = [note({ id: 'a', updatedAt: 100 })]
    expect(mergeNotes(cur, fresh)).toBe(cur)
  })

  it('磁盘新增便签进入结果（另一台机器新建同步进来）', () => {
    const a = note({ id: 'a', updatedAt: 200 })
    const remote = note({ id: 'r', updatedAt: 500, content: '远端新建' })
    const merged = mergeNotes([a], [note({ ...a, updatedAt: 100 }), remote])
    expect(merged).toHaveLength(2)
    expect(merged.some((n) => n.id === 'r')).toBe(true)
  })

  it('fresh 顺序与 cur 不同（全本地赢）仍视为变化，返回新数组', () => {
    const a = note({ id: 'a', updatedAt: 200 })
    const b = note({ id: 'b', updatedAt: 300 })
    const cur = [a, b]
    const fresh = [{ ...b }, { ...a }]
    const merged = mergeNotes(cur, fresh)
    expect(merged).not.toBe(cur)
    expect(merged.map((n) => n.id)).toEqual(['b', 'a'])
  })
})

describe('partitionTrash 回收站 30 天分拣', () => {
  it('恰好 30 天边界保留，早一天过期', () => {
    const now = 1_000_000_000_000
    const edge = note({ id: 'edge', updatedAt: now - TRASH_TTL_MS })
    const old = note({ id: 'old', updatedAt: now - TRASH_TTL_MS - 1 })
    const recent = note({ id: 'recent', updatedAt: now - 1000 })
    const { kept, expired } = partitionTrash([edge, old, recent], now)
    expect(kept.map((n) => n.id)).toEqual(['edge', 'recent'])
    expect(expired.map((n) => n.id)).toEqual(['old'])
  })

  it('空回收站两堆皆空', () => {
    expect(partitionTrash([], 123)).toEqual({ kept: [], expired: [] })
  })
})

describe('z 序治理', () => {
  it('nextZTop 取最高 z + 1，空集合为 1', () => {
    expect(nextZTop([])).toBe(1)
    expect(nextZTop([note({ id: 'a', z: 1 }), note({ id: 'b', z: 5 })])).toBe(6)
  })

  it('normalizeZ 按层级压回 1..n、目标置顶、保持原数组顺序', () => {
    const c = note({ id: 'c', z: 1 })
    const a = note({ id: 'a', z: 2 })
    const b = note({ id: 'b', z: 3 })
    const { notes, nextTop } = normalizeZ([c, a, b], 'a')
    // 层级 c(1) < b(3)，a 置顶 → c=1, b=2, a=3；顺序仍 [c, a, b]
    expect(notes.map((n) => n.id)).toEqual(['c', 'a', 'b'])
    expect(notes.map((n) => n.z)).toEqual([1, 3, 2])
    expect(nextTop).toBe(4)
  })

  it('normalizeZ z 未变的项返回原对象（写盘判定依赖）', () => {
    const c = note({ id: 'c', z: 1 })
    const a = note({ id: 'a', z: 2 })
    const { notes } = normalizeZ([c, a], 'a')
    expect(notes[0]).toBe(c) // c 仍是 z=1，原对象
    expect(notes[1]).toBe(a) // a 本来就在顶，原对象
  })
})

describe('patchNote 补丁政策（updatedAt 显式化）', () => {
  const base = note({ id: 'a', updatedAt: 1000 })

  it('内容变更 bump updatedAt（注入 now 精确断言）', () => {
    expect(patchNote(base, { content: '新内容' }, 5000)).toMatchObject({
      content: '新内容',
      updatedAt: 5000,
    })
  })

  it('几何 / 颜色 / 折叠不 bump（合并仲裁对纯移动盲，ADR-0001 接受）', () => {
    expect(patchNote(base, { x: 99, y: 88 }, 5000)).toMatchObject({ x: 99, updatedAt: 1000 })
    expect(patchNote(base, { color: 'green' }, 5000)).toMatchObject({ color: 'green', updatedAt: 1000 })
    expect(patchNote(base, { collapsed: true }, 5000)).toMatchObject({ collapsed: true, updatedAt: 1000 })
  })
})

describe('seedNotes 种子内容', () => {
  it('两张种子便签：欢迎 + 今日待办，预览态、z 递增', () => {
    const seeds = seedNotes()
    expect(seeds.map((n) => n.id)).toEqual(['seed-welcome', 'seed-todo'])
    expect(seeds.every((n) => n.preview)).toBe(true)
    expect(seeds.map((n) => n.z)).toEqual([1, 2])
    expect(seeds[0].content).toContain('欢迎使用')
    expect(seeds[1].content).toContain('今日待办')
  })
})
