/**
 * 焦点与滚动位置的快照与恢复。
 * 概览与管理面板都会在切换内容时重建列表与面板，恢复逻辑只在这里实现一份：
 * 两个视图（工作台概览与首页统计概览）只是采集范围不同。
 */
export interface ScrollPosition { node: HTMLElement; top: number; left: number }

export function captureScrollPositions(nodes: Iterable<HTMLElement>): ScrollPosition[] {
  return [...nodes].map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
}

export function restoreScrollPositions(positions: readonly ScrollPosition[]): void {
  // 切换中被卸载的节点不再恢复；对游离节点设置 scrollTop 本来也不会生效。
  for (const { node, top, left } of positions) if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; }
}

/** 原焦点还在文档里就还给它，否则退回给定容器；两者都用于本次绘制前，避免抢走滚动。 */
export function restoreFocus(target: HTMLElement | null | undefined, fallback?: HTMLElement | null): void {
  (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
}
