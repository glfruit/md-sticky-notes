/** 右键菜单几何：视口坐标钳制 + 全局互斥登记（components/Menu 消费）。
 *  菜单尺寸由渲染后实测传入，调用方不猜 magic number。 */

/** 全局互斥登记：开新菜单先关上一个（菜单状态分属不同组件，无共同父级可协调）。
 *  仅持回调引用，不碰 DOM，故放 lib 层单源；#54 聚焦模式 Esc 让位读 isMenuOpen。 */
let closeActiveMenu: (() => void) | null = null

export function claimActiveMenu(close: () => void): void {
  closeActiveMenu?.()
  closeActiveMenu = close
}

export function releaseActiveMenu(close: () => void): void {
  if (closeActiveMenu === close) closeActiveMenu = null
}

/** 是否有菜单实例打开。关闭走 React 状态异步生效，Esc 同一事件里此值仍为
 *  true——调用方「让位一次、下次按键再行动」的语义天然成立。 */
export function isMenuOpen(): boolean {
  return closeActiveMenu !== null
}

/** 把菜单左上角期望位置钳进视口：右/下溢出收到贴边，负坐标收到 0。
 *  菜单比视口大时保 0 起（左/上贴边，宁可裁右下——右键落点总在视口内，菜单起点贴 0 可见性最大）。 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const maxLeft = Math.max(0, viewportWidth - menuWidth)
  const maxTop = Math.max(0, viewportHeight - menuHeight)
  return {
    x: Math.min(Math.max(0, x), maxLeft),
    y: Math.min(Math.max(0, y), maxTop),
  }
}
