import { Icon } from './ui.js';
import { useLayoutEffect, useRef } from 'react';
import { nextTabIndex } from './roving.js';

// 概览页签的单一来源：label 是统计卡上的短文案，nav 是侧栏导航的完整文案。
// 两处文案都是既有对外措辞（卡片写「会话」、导航写「近期会话」），因此并列成两个字段，
// 而不是让导航另存一份标签表——那样两处改一处就漂移。
export const overviewTabs = [
  { key: 'running', label: '运行中', nav: '运行中', icon: 'stats-running' },
  { key: 'recent', label: '会话', nav: '近期会话', icon: 'message-circle' },
  { key: 'pending', label: '待办', nav: '待办', icon: 'stats-todos' },
  { key: 'diagnostic', label: '诊断', nav: '诊断', icon: 'alert' },
  { key: 'skills', label: '技能', nav: '技能', icon: 'skills' },
  { key: 'rss', label: '订阅', nav: '订阅', icon: 'rss' },
  { key: 'mcp', label: '连接器', nav: '连接器', icon: 'plug' },
] as const;
export type OverviewTab = typeof overviewTabs[number]['key'];
export type CoreOverviewTab = Exclude<OverviewTab, 'skills' | 'mcp' | 'rss'>;
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
    {overviewTabs.map(({ key, nav, icon }, index) => <button key={key} type="button" role="tab"
      aria-selected={value === key} tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)} onKeyDown={event => {
        if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = nextTabIndex(event.key, index, overviewTabs.length);
        onChange(overviewTabs[next]!.key);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><Icon name={icon}/>{nav}</button>)}
  </nav><div className="stats-sidebar-actions"><button type="button" className="flat" onClick={onClose}><Icon name="close"/>关闭概览</button></div></aside>;
}
