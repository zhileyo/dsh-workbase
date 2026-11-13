import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Command } from '../shared/commands.js';
import type { Preferences, Snapshot } from '../shared/model.js';
import { Icon, Picker, preventImeSubmit } from './ui.js';
import { DirectoryInput } from './DirectoryInput.js';
import { BackupSettings } from './BackupSettings.js';

export const themeOptions = [['follow','跟随 DSH 主题'],['dsh','DSH 默认主题'],['fresh','清爽主题'],['warm','温暖阅读'],['violet','紫晶工作台']] as const;
const themeDescriptions = ['同步 DSH 当前配置的主题及后续变更。', '固定使用 DSH 官方默认配色。', '冷白与森林绿，清晰紧凑的工具风格。', '纸色与棕色，柔和的阅读式字体。', '白底、冷灰与紫色强调，深色采用柔和紫晶色。'];
const categories = [['general','通用配置','settings'],['appearance','外观布局','palette'],['project','项目配置','folder'],['backup','备份恢复','archive'],['tools','其他组件','components']] as const;
const statCardRows = [
  ['running','运行统计','尚未结束的会话。'],
  ['recent','会话统计','所选时间范围内更新的未归档会话。'],
  ['pending','待办统计','跨项目的未完成待办。'],
  ['diagnostic','项目诊断','项目目录可用性检查。'],
] as const;
function SettingsSubtabs<T extends string>({ scope, label, value, options, onChange }: {
  scope: string; label: string; value: T; options: readonly { value: T; label: string; hidden?: boolean }[]; onChange(value: T): void;
}) {
  const visible = options.filter(option => !option.hidden);
  return <div className="settings-subtabs" role="tablist" aria-label={label}>{options.map(option => <button
    type="button" role="tab" key={option.value} id={`wb-settings-${scope}-tab-${option.value}`}
    aria-controls={`wb-settings-${scope}-panel-${option.value}`} aria-selected={value === option.value}
    tabIndex={value === option.value ? 0 : -1} hidden={option.hidden}
    onClick={() => onChange(option.value)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = visible.findIndex(item => item.value === option.value);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
      const target = visible[next]!;
      onChange(target.value);
      e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#wb-settings-${scope}-tab-${target.value}`)?.focus();
    }}>{option.label}</button>)}</div>;
}
export function Settings({ snapshot, busy, pluginUpdateBusy = false, preview, save, call, onClose, pickDirectory, dark = false, onRestored, describedBy }: {
  snapshot: Snapshot; busy: boolean; preview(theme: Preferences['theme']): void;
  save(command: Command): Promise<boolean>; onClose(): void; dark?: boolean; pluginUpdateBusy?: boolean;
  pickDirectory(): Promise<string | null>;
  call?(command: Command): Promise<unknown>;
  onRestored?(): void;
  describedBy?: string;
}) {
  const [tab, setTab] = useState<typeof categories[number][0]>(snapshot.preferences.selectedProject ? 'project' : 'appearance');
  const [appearanceTab, setAppearanceTab] = useState<'theme' | 'layout' | 'stats'>('layout');
  const [projectTab, setProjectTab] = useState<'global' | 'single'>('global');
  const [backupTab, setBackupTab] = useState<'backup' | 'restore' | 'status'>('backup');
  const [theme, setTheme] = useState(snapshot.preferences.theme);
  const [language, setLanguage] = useState(snapshot.preferences.language ?? 'follow');
  const [home, setHome] = useState(snapshot.preferences.home);
  const [root, setRoot] = useState(snapshot.preferences.root);
  const [navigation, setNavigation] = useState(snapshot.preferences.navigation);
  const nameErrorId = useId();
  const nameInvalid = navigation.sidebarVisible && !navigation.sidebarName.trim();
  const [openOnStartup, setOpenOnStartup] = useState(snapshot.preferences.openOnStartup);
  const [picking, setPicking] = useState(false);
  const [agentManageTodos, setAgentManageTodos] = useState(snapshot.preferences.agentManageTodos);
  const [pluginUpdateVisible, setPluginUpdateVisible] = useState(snapshot.preferences.pluginUpdateVisible);
  const [pluginAutoUpdate, setPluginAutoUpdate] = useState(snapshot.preferences.pluginAutoUpdate);
  const [backup, setBackup] = useState(snapshot.preferences.backup);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const switchTab = (value: typeof tab) => { setTab(value); if (content.current) content.current.scrollTop = 0; };
  const resetScroll = () => { if (content.current) content.current.scrollTop = 0; };
  const navKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const count = categories.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : (i + (['ArrowDown','ArrowRight'].includes(e.key) ? 1 : -1) + count) % count;
    switchTab(categories[next]![0]); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  };
  const homeRows = [
    ['quick','快捷会话','输入任务并选择项目，直接开始新会话。'],
    ['stats','数据统计','展示统计卡，并开启「统计卡片」页签。'],
    ['recent','最近会话','显示输入框下方的最近会话入口。'],
    ['projects','项目总览','显示项目列表 / 宫格与筛选、视图切换按钮。'],
  ] as const;
  return <form className="wb-settings" aria-describedby={describedBy} onKeyDown={preventImeSubmit} onSubmit={e => {
    e.preventDefault();
    if (busy || picking || restoreBusy) return;
    if (nameInvalid) return;
    void save({ op: 'settings', theme, permissions: {}, options: { language, home, root: root.trim(), openOnStartup, agentManageTodos, pluginAutoUpdate, backup: { ...backup, directory: backup.directory.trim() },
      ...(!pluginUpdateBusy ? { pluginUpdateVisible } : {}),
      navigation: { ...navigation, sidebarName: navigation.sidebarName.trim() || snapshot.preferences.navigation.sidebarName } } }).then(ok => { if (ok) onClose(); });
  }}>
    <div className="settings-layout">
      <nav className="settings-nav" role="tablist" aria-label="设置分类" aria-orientation="vertical">{categories.map(([value,label,symbol],i) => <button type="button" role="tab" id={`wb-settings-tab-${value}`} aria-controls={`wb-settings-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => switchTab(value)} onKeyDown={e => navKey(e, i)}><Icon name={symbol}/>{label}</button>)}</nav>
      <div className="wb-drawer-body settings-content" ref={content}>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-appearance" aria-labelledby="wb-settings-tab-appearance" hidden={tab !== 'appearance'}>
          <h3>外观布局</h3><p className="dialog-description">选择工作台主题，调整首页模块与统计卡片。</p>
          <SettingsSubtabs scope="appearance" label="外观布局分类" value={appearanceTab} options={[{ value: 'layout', label: '首页模块' }, { value: 'stats', label: '统计卡片', hidden: !home.stats }, { value: 'theme', label: '主题配色' }]} onChange={value => { setAppearanceTab(value); resetScroll(); }}/>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-theme" aria-labelledby="wb-settings-appearance-tab-theme" hidden={appearanceTab !== 'theme'}>
            <div className="theme-mode-note"><Icon name="info"/><div className="theme-mode-copy"><strong>当前外观：{dark ? '深色' : '浅色'}</strong><span>切换明暗模式，请前往 DSH 设置 → 外观。</span></div></div>
            <div className="theme-choices" role="radiogroup" aria-label="工作台主题">{themeOptions.map(([value,label],i) => <label className="theme-choice" key={value}>
              <input type="radio" name="workbase-theme" value={value} checked={theme === value} disabled={busy} onChange={() => { setTheme(value); preview(value); }}/>
              <span className="theme-choice-copy"><strong>{label}</strong><small>{themeDescriptions[i]}</small></span>
            </label>)}</div>
            <p className="settings-inline-note">选择后即时预览；保存保留，取消恢复。</p>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-layout" aria-labelledby="wb-settings-appearance-tab-layout" hidden={appearanceTab !== 'layout'}>
          {homeRows.map(([key,label,hint]) => <div key={key}><label className="wb-setting-row setting-row homepage-setting"><div><strong>{`显示${label}`}</strong><small>{hint}</small></div>
            <input type="checkbox" aria-label={`显示${label}`} checked={home[key]} disabled={busy} onChange={e => { setHome({ ...home, [key]: e.target.checked }); if (key === 'stats' && !e.target.checked) setAppearanceTab('layout'); }}/>
          </label>{key === 'recent' && <div className="setting-dependent" hidden={!home.recent}><label className="setting-row"><div><strong>最近会话样式</strong><small>关闭统计区域后，恢复你选择的展示样式。</small></div><Picker variant="recent-layout" label="最近会话样式" value={home.stats ? 'buttons' : home.recentStyle} disabled={busy || home.stats} onChange={value => setHome({ ...home, recentStyle: value as 'cards' | 'buttons' })}
            options={[{ value: 'cards', label: '卡片' },{ value: 'buttons', label: '按钮' }]}/></label>{home.stats && <p className="settings-inline-note">统计区域开启时使用按钮样式，与统计卡共同展示。</p>}</div>}</div>)}
          <p className="settings-inline-note">隐藏模块后仍可使用顶部搜索与设置。</p></div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-stats" aria-labelledby="wb-settings-appearance-tab-stats" hidden={!home.stats || appearanceTab !== 'stats'}>
            {statCardRows.map(([key,label,hint]) => <label className="wb-setting-row setting-row" key={key}><div><strong>{`显示${label}`}</strong><small>{hint}</small></div>
              <input type="checkbox" aria-label={`显示${label}`} checked={home.statCards[key]} disabled={busy} onChange={e => setHome({ ...home, statCards: { ...home.statCards, [key]: e.target.checked } })}/></label>)}
            <p className="settings-inline-note" role="status">{Object.values(home.statCards).some(Boolean) ? '统计卡可单独隐藏，点击后查看概览对应分类。' : '全部关闭时，首页统计区域不显示。'}</p>
            <label className="wb-setting-row setting-row"><div><strong>时间范围</strong><small>同时影响会话统计卡与项目「近期活跃」数量。</small></div>
              <Picker variant="stat-days" label="统计时间范围" value={String(home.statDays)} disabled={busy} onChange={value => setHome({ ...home, statDays: Number(value) })}
                options={[{ value: '7', label: '最近 7 天' },{ value: '14', label: '最近 14 天' },{ value: '30', label: '最近 30 天' }]}/></label>
          </div>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-general" aria-labelledby="wb-settings-tab-general" hidden={tab !== 'general'}>
          <h3>通用配置</h3><p className="dialog-description">统一配置启动页面和工作台入口。</p>
          <label className="wb-setting-row setting-row"><div><strong>界面语言</strong><small>默认跟随 Harness；仅调整工作台界面，不翻译项目、会话或待办内容。</small></div>
            <Picker label="界面语言" value={language} disabled={busy} onChange={value => setLanguage(value as Preferences['language'])}
              options={[{ value: 'follow', label: '跟随平台' }, { value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}/></label>
          <label className="wb-setting-row setting-row"><div><strong>启动打开首页</strong><small>开启后，启动 DSH 桌面端进入工作台首页；保存后下次启动生效。</small></div>
            <input type="checkbox" aria-label="启动打开首页" checked={openOnStartup} disabled={busy} onChange={e => setOpenOnStartup(e.target.checked)}/></label>
          <label className="wb-setting-row setting-row"><div><strong>显示侧栏入口</strong><small>在 DSH 侧边栏显示工作台入口。</small></div>
            <input type="checkbox" aria-label="显示侧栏入口" checked={navigation.sidebarVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, sidebarVisible: e.target.checked, headerButtonVisible: e.target.checked ? navigation.headerButtonVisible : true })}/></label>
          <div className="setting-dependent" hidden={!navigation.sidebarVisible}>
          <label className="wb-setting-row setting-row" htmlFor="wb-sidebar-name"><div><strong>侧栏入口名称</strong><small>自定义工作台入口名称，最多 30 字。</small></div>
            <input className="settings-text-control" id="wb-sidebar-name" aria-label="侧栏入口名称" aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? nameErrorId : describedBy} value={navigation.sidebarName} maxLength={30} disabled={busy || !navigation.sidebarVisible} placeholder="项目概览" onChange={e => setNavigation({ ...navigation, sidebarName: e.target.value })}/></label>
          {nameInvalid && <p id={nameErrorId} className="wb-warning" role="alert">请填写侧栏入口名称。</p>}
          <label className="wb-setting-row setting-row"><div><strong>侧栏菜单位置</strong><small>顺序从顶部数，倒序从底部数。</small></div>
            <Picker variant="sidebar-position" label="侧栏菜单位置" value={String(navigation.sidebarPosition)} disabled={busy || !navigation.sidebarVisible}
              onChange={value => setNavigation({ ...navigation, sidebarPosition: Number(value) })}
              options={[1, -1].flatMap(direction => Array.from({ length: 3 }, (_, i) => ({
                value: String(direction * (i + 1)), label: `${direction > 0 ? '顺序' : '倒序'}第 ${i + 1} 个`,
              })))}/></label></div>
          <label className="wb-setting-row setting-row"><div><strong>显示返回按钮</strong><small>在新对话和历史会话顶部显示返回工作台按钮。</small></div>
            <input type="checkbox" aria-label="显示返回按钮" checked={navigation.headerButtonVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, headerButtonVisible: e.target.checked, sidebarVisible: e.target.checked ? navigation.sidebarVisible : true })}/></label>
          <p className="settings-inline-note" role="status">侧边栏入口与顶部返回按钮至少保留一个。</p>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-backup" aria-labelledby="wb-settings-tab-backup" hidden={tab !== 'backup'}>
          <h3>备份恢复</h3><p className="dialog-description">管理数据备份、恢复与执行状态。</p>
          <SettingsSubtabs scope="backup" label="备份恢复分类" value={backupTab} options={[{ value: 'backup', label: '数据备份' }, { value: 'restore', label: '数据恢复' }, { value: 'status', label: '执行状态' }]} onChange={value => { setBackupTab(value); resetScroll(); }}/>
          <BackupSettings tab={backupTab} value={backup} onChange={setBackup} call={call} pickDirectory={pickDirectory}
            disabled={busy || picking || restoreBusy} onPickingChange={setPicking} onRestoreBusyChange={setRestoreBusy} onRestored={onRestored}/>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-project" aria-labelledby="wb-settings-tab-project" hidden={tab !== 'project'}>
          <h3>项目配置</h3><p className="dialog-description">集中管理项目默认值与 Agent 待办权限。</p>
          <SettingsSubtabs scope="project" label="项目配置分类" value={projectTab} options={[{ value: 'global', label: '全局配置' }, { value: 'single', label: '项目配置' }]} onChange={value => { setProjectTab(value); resetScroll(); }}/>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-project-panel-global" aria-labelledby="wb-settings-project-tab-global" hidden={projectTab !== 'global'}>
          <DirectoryInput label="默认项目根目录" value={root} onChange={setRoot} disabled={busy} pickDirectory={pickDirectory} onPickingChange={setPicking}/>
          <p className="settings-inline-note">用于新建项目，不改变已有项目目录。可输入绝对路径或点击文件夹按钮选择目录。</p>
          <label className="wb-setting-row setting-row"><div><strong>允许 Agent 管理待办</strong><small>开启后，Agent 可创建、查询、编辑、删除待办及修改完成状态；关闭后仅可查询。对所有已有项目和后续新增项目统一生效。</small></div>
            <input type="checkbox" aria-label="允许 Agent 管理待办" checked={agentManageTodos} disabled={busy} onChange={e => setAgentManageTodos(e.target.checked)}/></label>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-project-panel-single" aria-labelledby="wb-settings-project-tab-single" hidden={projectTab !== 'single'}>
            <div className="settings-empty"><Icon name="folder"/><strong>暂无项目专属配置</strong><p>后续项目专属设置将在这里显示。</p></div>
          </div>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-tools" aria-labelledby="wb-settings-tab-tools" hidden={tab !== 'tools'}>
          <h3>其他组件</h3><p className="dialog-description">简单实用的组件。</p>
          <label className="wb-setting-row setting-row"><div><strong>显示插件更新</strong><small>在插件页刷新按钮左侧显示一键更新入口，检查并更新用户安装的插件。</small></div>
            <input type="checkbox" aria-label="显示插件更新" checked={pluginUpdateVisible} disabled={busy || pluginUpdateBusy} onChange={e => setPluginUpdateVisible(e.target.checked)}/></label>
          <div className="setting-dependent" hidden={!pluginUpdateVisible}><label className="wb-setting-row setting-row"><div><strong>开启自动更新</strong><small>每次打开应用时检查新版本，有更新就在后台安装；保存后下次启动生效。</small></div>
            <input type="checkbox" aria-label="开启自动更新" checked={pluginAutoUpdate} disabled={busy || !pluginUpdateVisible} onChange={e => setPluginAutoUpdate(e.target.checked)}/></label></div>
          {pluginUpdateBusy && <p className="settings-inline-note" role="status">插件正在检查或更新，完成后可调整入口显示。</p>}
        </section>
      </div>
    </div>
    <footer className="dialog-footer"><span className="settings-save-note">{restoreBusy ? '恢复任务进行中，暂停保存设置' : nameInvalid ? '请填写通用配置中的侧栏入口名称' : '保存全部分类修改 · 主题即时预览'}</span><button type="button" disabled={busy || picking} onClick={onClose}>取消</button><button type="submit" className="wb-primary primary" disabled={busy || picking || restoreBusy || nameInvalid}>保存设置</button></footer>
  </form>;
}
