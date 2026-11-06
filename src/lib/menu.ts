/** 右键菜单几何：视口坐标钳制（components/Menu 消费）。
 *  菜单尺寸由渲染后实测传入，调用方不猜 magic number。 */

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
