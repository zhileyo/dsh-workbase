import { Icon } from './ui.js';
import { useLayoutEffect, useRef } from 'react';

export const overviewTabs = [
  ['running', '运行中', 'stats-running'], ['recent', '会话', 'message-circle'],
  ['pending', '待办', 'stats-todos'], ['diagnostic', '诊断', 'alert'],
  ['skills', '技能', 'skills'], ['rss', '订阅', 'rss'], ['mcp', '连接器', 'plug'],
] as const;
export type OverviewTab = typeof overviewTabs[number][0];
export type CoreOverviewTab = Exclude<OverviewTab, 'skills' | 'mcp' | 'rss'>;
const navigationLabels: Record<OverviewTab, string> = {
  running: '运行中', recent: '近期会话', pending: '待办', diagnostic: '诊断',
  skills: '技能', rss: '订阅', mcp: '连接器',
};
export function OverviewNavigation({ value, onChange, onClose }: {
  value: OverviewTab; onChange(value: OverviewTab): void; onClose(): void;
}) {
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // 切换管理内容后旧导航被卸载，恢复当前菜单焦点，不重新聚焦搜索框。
    if (document.activeElement === document.body)
      navigation.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, []);
  return <aside className="stats-sidebar"><nav ref={navigation} className="settings-nav" role="tablist" aria-label="统计分类" aria-orientation="vertical">
    {overviewTabs.map(([key, , symbol], index) => <button key={key} type="button" role="tab"
      aria-selected={value === key} tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)} onKeyDown={event => {
        if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? overviewTabs.length - 1
          : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : overviewTabs.length - 1)) % overviewTabs.length;
        onChange(overviewTabs[next]![0]);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><Icon name={symbol}/>{navigationLabels[key]}</button>)}
  </nav><div className="stats-sidebar-actions"><button type="button" className="flat" onClick={onClose}><Icon name="close"/>关闭概览</button></div></aside>;
}
