import { useRef, useState } from 'react';
import type { Command } from '../shared/commands.js';
import type { Preferences, Snapshot } from '../shared/model.js';
import { Icon, Picker } from './ui.js';
import { DirectoryInput } from './DirectoryInput.js';

export const themeOptions = [['follow','跟随 DSH 主题'],['dsh','DSH 默认主题'],['fresh','清爽主题'],['warm','温暖阅读'],['violet','紫晶工作台']] as const;
const themeDescriptions = ['同步 DSH 当前配置的主题及后续变更。', '固定使用 DSH 官方默认配色。', '冷白与森林绿，清晰紧凑的工具风格。', '纸色与棕色，柔和的阅读式字体。', '白底、冷灰与紫色强调，深色采用柔和紫晶色。'];
const categories = [['home','首页显示','grid'],['theme','主题','settings'],['general','通用设置','settings'],['permissions','项目权限','bot']] as const;
const statCardRows = [
  ['running','运行中','尚未结束的会话数量。'],
  ['recent','会话','最近 7 天更新的未归档会话。'],
  ['pending','待办','跨项目的未完成待办数量。'],
  ['diagnostic','诊断','Harness 目录可用性检查。'],
] as const;
export function Settings({ snapshot, busy, preview, save, onClose, pickDirectory, dark = false }: {
  snapshot: Snapshot; busy: boolean; preview(theme: Preferences['theme']): void;
  save(command: Command): Promise<boolean>; onClose(): void; dark?: boolean;
  pickDirectory(): Promise<string | null>;
}) {
  const [tab, setTab] = useState<'home' | 'theme' | 'general' | 'permissions'>(snapshot.preferences.selectedProject ? 'permissions' : 'home');
  const [theme, setTheme] = useState(snapshot.preferences.theme);
  const [home, setHome] = useState(snapshot.preferences.home);
  const [root, setRoot] = useState(snapshot.preferences.root);
  const [navigation, setNavigation] = useState(snapshot.preferences.navigation);
  const [picking, setPicking] = useState(false);
  const [projectId, setProjectId] = useState(snapshot.preferences.selectedProject ?? snapshot.projects[0]?.projectId ?? '');
  const [permissions, setPermissions] = useState<Record<string, boolean>>(Object.fromEntries(snapshot.projects.map(p => [p.projectId, p.agentCanChangeStatus])));
  const content = useRef<HTMLDivElement>(null);
  const switchTab = (value: typeof tab) => { setTab(value); if (content.current) content.current.scrollTop = 0; };
  const project = snapshot.projects.find(p => p.projectId === projectId);
  const homeRows = [
    ['quick','快捷输入框','输入任务并选择项目，直接开始新会话。'],
    ['recent','最近会话','显示输入框下方的最近会话入口。'],
    ['projects','项目总览','显示项目列表 / 宫格与筛选、视图切换按钮。'],
    ['stats','统计卡','显示运行中、会话、待办和诊断，点击查看跨项目明细。'],
  ] as const;
  return <form className="wb-settings" onSubmit={e => {
    e.preventDefault();
    if (busy || picking) return;
    if (!navigation.sidebarName.trim()) return;
    void save({ op: 'settings', theme, permissions, options: { home, root: root.trim(), navigation: { ...navigation, sidebarName: navigation.sidebarName.trim() } } }).then(ok => { if (ok) onClose(); });
  }}>
    <div className="settings-layout">
      <nav className="settings-nav" role="tablist" aria-label="设置分类">{categories.map(([value,label,symbol],i) => <button type="button" role="tab" id={`wb-settings-tab-${value}`} aria-controls={`wb-settings-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => switchTab(value)} onKeyDown={e => {
        if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? 3 : (i + (['ArrowDown','ArrowRight'].includes(e.key) ? 1 : -1) + 4) % 4;
        switchTab(categories[next]![0]); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><Icon name={symbol}/>{label}</button>)}</nav>
      <div className="wb-drawer-body settings-content" ref={content}>
        <section className="settings-panel" role="tabpanel" id={`wb-settings-panel-${tab}`} aria-labelledby={`wb-settings-tab-${tab}`}>
        {tab === 'home' && <><h3>首页显示</h3><p className="dialog-description">首页模块独立配置；统计卡默认显示，会话模块默认隐藏。</p>
          {homeRows.map(([key,label,hint]) => <div key={key}><label className="wb-setting-row setting-row homepage-setting"><div><strong>显示{label}</strong><small>{hint}</small></div>
            <input type="checkbox" aria-label={`显示${label}`} checked={home[key]} disabled={busy} onChange={e => setHome({ ...home, [key]: e.target.checked, ...(key === 'stats' && e.target.checked ? { recentStyle: 'buttons' as const } : {}) })}/>
          </label>{key === 'recent' && home.recent && <label className="setting-row"><strong style={{flex:1}}>最近会话样式</strong><Picker variant="recent-layout" label="最近会话样式" value={home.recentStyle} disabled={busy} onChange={value => setHome({ ...home, recentStyle: value as 'cards' | 'buttons' })}
            options={[{ value: 'cards', label: '卡片 · 5 个', disabled: home.stats },{ value: 'buttons', label: '按钮 · 3 个' }]}/></label>}</div>)}
          {home.stats && <><label className="field">统计卡显隐</label>
            {statCardRows.map(([key,label,hint]) => <label className="wb-setting-row setting-row" key={key}><div><strong>{label}</strong><small>{hint}</small></div>
              <input type="checkbox" aria-label={`显示${label}卡`} checked={home.statCards[key]} disabled={busy} onChange={e => setHome({ ...home, statCards: { ...home.statCards, [key]: e.target.checked } })}/></label>)}
            <label className="wb-setting-row setting-row"><div><strong>统计时间范围</strong><small>「会话」卡与「近期活跃」统计的天数窗口。</small></div>
              <Picker variant="recent-layout" label="统计时间范围" value={String(home.statDays)} disabled={busy} onChange={value => setHome({ ...home, statDays: Number(value) })}
                options={[{ value: '7', label: '最近 7 天' },{ value: '14', label: '最近 14 天' },{ value: '30', label: '最近 30 天' }]}/></label>
            <p className="dialog-description" style={{ marginTop: 8 }}>四张卡可单独隐藏；全部关闭时统计区域不显示。隐藏「最近会话」时其样式选项一并收起。</p></>}
          <small>隐藏仅调整首页布局；Header 搜索与工作台设置始终保留。</small>
        </>}
        {tab === 'theme' && <><h3>主题</h3><p className="dialog-description">选择工作台的配色风格，浅色和深色统一跟随 DSH 的外观配置。</p>
          <div className="theme-choices" role="radiogroup" aria-label="工作台主题">{themeOptions.map(([value,label],i) => <label className="theme-choice" key={value}>
            <input type="radio" name="workbase-theme" value={value} checked={theme === value} disabled={busy} onChange={() => { setTheme(value); preview(value); }}/>
            <span className="theme-choice-copy"><strong>{label}</strong><small>{themeDescriptions[i]}</small></span>
          </label>)}</div><div className="theme-mode-note"><strong>当前外观：{dark ? '深色' : '浅色'}</strong><p>如需切换浅色、深色或跟随系统，请前往 DSH 设置中的「外观」。</p></div>
        </>}
        {tab === 'general' && <><h3>通用设置</h3><p className="dialog-description">设置工作台入口和新项目的默认创建位置。</p>
          <label className="field" htmlFor="wb-sidebar-name">侧边栏名称</label>
          <input id="wb-sidebar-name" aria-label="侧边栏名称" value={navigation.sidebarName} maxLength={30} required disabled={busy} placeholder="项目概览" onChange={e => setNavigation({ ...navigation, sidebarName: e.target.value })}/>
          <label className="wb-setting-row setting-row"><div><strong>显示侧边栏工作台入口</strong><small>在宿主侧边栏显示工作台，名称使用上方设置。侧边栏入口和 Header 按钮至少保留一个。</small></div>
            <input type="checkbox" aria-label="显示侧边栏工作台入口" checked={navigation.sidebarVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, sidebarVisible: e.target.checked, headerButtonVisible: e.target.checked ? navigation.headerButtonVisible : true })}/></label>
          <label className="wb-setting-row setting-row"><div><strong>侧边栏菜单位置</strong><small>工作台在侧边栏菜单中的期望位置；实际排位取决于其他插件占用的顺序。</small></div>
            <Picker variant="recent-layout" label="侧边栏菜单位置" value={String(navigation.sidebarPosition)} disabled={busy || !navigation.sidebarVisible}
              onChange={value => setNavigation({ ...navigation, sidebarPosition: Number(value) })}
              options={Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 个` }))}/></label>
          <label className="wb-setting-row setting-row"><div><strong>显示 Header 工作台按钮</strong><small>在新对话和会话页面的顶部显示返回工作台按钮。侧边栏入口和 Header 按钮至少保留一个。</small></div>
            <input type="checkbox" aria-label="显示 Header 工作台按钮" checked={navigation.headerButtonVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, headerButtonVisible: e.target.checked, sidebarVisible: e.target.checked ? navigation.sidebarVisible : true })}/></label>
          <DirectoryInput label="默认项目根目录" value={root} onChange={setRoot} disabled={busy} pickDirectory={pickDirectory} onPickingChange={setPicking}/>
          <p className="dialog-description" style={{ marginTop: 12 }}>选择本地文件夹或输入绝对路径，创建新项目时会在此目录下创建文件夹。</p>
        </>}
        {tab === 'permissions' && <><h3>项目权限</h3><p className="dialog-description">按项目配置，互不影响。切换项目保留本次未保存的修改。</p>
          <label className="field">选择项目</label><Picker label="选择权限配置项目" value={projectId} disabled={busy || !snapshot.projects.length} onChange={setProjectId} options={snapshot.projects.map(p => ({ value: p.projectId, label: p.title, description: p.path }))}/>
          <div className="path-preview">{project?.path ?? '暂无可配置项目'}</div>
          <label className="wb-setting-row setting-row"><div><strong>允许 Agent 修改待办状态</strong><small>关闭后仍可创建、查询、编辑标题与备注；用户始终可标记完成或重新打开。</small></div>
            <input type="checkbox" checked={permissions[projectId] ?? false} disabled={busy || !projectId} onChange={e => setPermissions({ ...permissions, [projectId]: e.target.checked })}/>
          </label><p className="dialog-description">Agent 不能删除待办。权限更改在保存后生效。</p>
        </>}
        </section>
      </div>
    </div>
    <footer className="dialog-footer"><span className="settings-save-note">主题即时预览，保存后保留更改</span><button type="button" disabled={busy || picking} onClick={onClose}>取消</button><button type="submit" className="wb-primary primary" disabled={busy || picking || !navigation.sidebarName.trim()}>保存设置</button></footer>
  </form>;
}
