/** roving tabindex 的下一项下标：Home/End 跳到两端，方向键在给定项数内环游。 */
export function nextTabIndex(key: string, current: number, count: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  // 上下键与左右键同义：垂直与水平两种页签条各取所需，越界时环游。
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  return (current + step + count) % count;
}
