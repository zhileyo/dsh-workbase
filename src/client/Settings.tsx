import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react';
import type { Command } from '../shared/commands.js';
import type { Preferences, Snapshot } from '../shared/model.js';
import { Icon, IconButton, Modal, ModalFlow, Picker, preventImeSubmit, type ModalState } from './ui.js';
import { DirectoryInput } from './DirectoryInput.js';
import { BackupSettings } from './BackupSettings.js';
import { defaultProjectInitialization } from '../shared/project-initialization.js';
import { defaultProjectRules } from '../shared/project-rules.js';
import { ProjectRuleDetail, ProjectRulesSettings, RulesEditor } from './ProjectRulesSettings.js';
import { RulesSave } from './rules-save.js';
import { errorText, t } from './i18n.js';
import { ExtensionSettings, type ExtensionTab } from './ExtensionSettings.js';
import { defaultExtensionConfig, extensionConfigSchema } from '../shared/extensions.js';
import { PersonalSave } from './personal-save.js';
import { personalFiles, type PersonalFile } from '../shared/personalization.js';
import { SpeechSave } from './speech-save.js';
import { SpeechSettings } from './SpeechSettings.js';
import { SettingsSubtabs } from './settings-subtabs.js';
import { nextTabIndex } from './roving.js';

export const themeOptions = [
  { value: 'violet', label: '柔和紫晶' }, { value: 'fresh', label: '清新森林' }, { value: 'warm', label: '暖纸阅读' },
  { value: 'dsh', label: '经典湛蓝' }, { value: 'follow', label: '跟随平台' },
] as const;
const categories = [
  { value: 'general', label: '通用配置', icon: 'settings' }, { value: 'appearance', label: '外观布局', icon: 'palette' },
  { value: 'project', label: '项目配置', icon: 'folder' }, { value: 'personal', label: '私人订制', icon: 'settings' },
  { value: 'extensions', label: '扩展配置', icon: 'components' }, { value: 'tools', label: '其他组件', icon: 'components' },
  { value: 'backup', label: '备份恢复', icon: 'archive' },
] as const;
const personalLabels = ['伙伴档案', '用户档案', '行为准则', '记忆进化'];
const statCardRows = [
  { key: 'running', label: '运行统计', hint: '尚未结束的会话。' },
  { key: 'recent', label: '会话统计', hint: '所选时间范围内更新的未归档会话。' },
  { key: 'pending', label: '待办统计', hint: '跨项目的未完成待办。' },
  { key: 'diagnostic', label: '项目诊断', hint: '项目目录可用性检查。' },
  { key: 'skills', label: '技能统计', hint: '已确认生效且无异常的全局技能，按调用名去重。' },
  { key: 'mcp', label: '连接器统计', hint: '实际已连接的受管服务与异常。' },
  { key: 'rss', label: '订阅统计', hint: '启用订阅源在所选时间范围内发布的已缓存文章。' },
] as const;
function useEditableState<T>(initial: T, edited: () => void) {
  const [value, setValue] = useState(initial);
  return [value, (next: SetStateAction<T>) => { edited(); setValue(next); }] as const;
}
export function Settings({ snapshot, busy, pluginUpdateBusy = false, preview, save, call, onClose, pickDirectory, dark = false, onRestored, describedBy, renderMarkdown, registerCloseGuard, embedded = true, onModalState, initialExtension }: {
  snapshot: Snapshot; busy: boolean; preview(theme: Preferences['theme']): void;
  save(command: Command): Promise<boolean>; onClose(): void; dark?: boolean; pluginUpdateBusy?: boolean;
  pickDirectory(): Promise<string | null>;
  call?(command: Command): Promise<unknown>;
  onRestored?(): void;
  describedBy?: string;
  renderMarkdown?(text: string): ReactNode;
  registerCloseGuard?(guard: (() => Promise<boolean>) | null): void;
  embedded?: boolean; onModalState?(state: ModalState): void;
  initialExtension?: ExtensionTab;
}) {
  const task = useRef({ generation: 0, mounted: true, lock: '' as '' | 'save' | 'restore' | 'close' | 'rules' });
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const confirmedRevision = useRef(snapshot.revision);
  const edited = () => { task.current.generation++; };
  const live = useRef({ busy, restoreBusy: false });
  live.current.busy = busy;
  useEffect(() => {
    task.current.mounted = true;
    return () => { task.current.mounted = false; task.current.generation++; };
  }, []);
  const [tab, setTab] = useState<typeof categories[number]['value']>(initialExtension ? 'extensions' : 'general');
  const [extensionTab, setExtensionTab] = useState<ExtensionTab>(initialExtension ?? 'skills');
  const [appearanceTab, setAppearanceTab] = useState<'theme' | 'layout' | 'stats'>('layout');
  const [projectTab, setProjectTab] = useState<'global' | 'initialization' | 'single'>('global');
  const [backupTab, setBackupTab] = useState<'backup' | 'restore' | 'status'>('backup');
  const [toolsTab, setToolsTab] = useState<'general' | 'speech'>('general');
  const [theme, setTheme] = useEditableState(snapshot.preferences.theme, edited);
  const [language, setLanguage] = useEditableState(snapshot.preferences.language ?? 'follow', edited);
  const [home, setHome] = useEditableState(snapshot.preferences.home, edited);
  const [extensionConfig, setExtensionConfig] = useEditableState(snapshot.preferences.extensionConfig ?? defaultExtensionConfig(), edited);
  const [statError, setStatError] = useState('');
  const [root, setRoot] = useEditableState(snapshot.preferences.root, edited);
  const [navigation, setNavigation] = useEditableState(snapshot.preferences.navigation, edited);
  const nameErrorId = useId();
  const nameInvalid = navigation.sidebarVisible && !navigation.sidebarName.trim();
  const [openOnStartup, setOpenOnStartup] = useEditableState(snapshot.preferences.openOnStartup, edited);
  const [picking, setPicking] = useState(false);
  const [agentManageTodos, setAgentManageTodos] = useEditableState(snapshot.preferences.agentManageTodos, edited);
  const [pluginUpdateVisible, setPluginUpdateVisible] = useEditableState(snapshot.preferences.pluginUpdateVisible, edited);
  const [pluginAutoUpdate, setPluginAutoUpdate] = useEditableState(snapshot.preferences.pluginAutoUpdate, edited);
  const [terminalSettingsVisible, setTerminalSettingsVisible] = useEditableState(snapshot.preferences.terminalSettingsVisible ?? false, edited);
  const [speechComponentEnabled, setSpeechComponentEnabled] = useEditableState(snapshot.preferences.speechComponentEnabled ?? false, edited);
  const [backup, setBackup] = useEditableState(snapshot.preferences.backup, edited);
  const [initialization, setInitialization] = useEditableState(snapshot.preferences.projectInitialization ?? defaultProjectInitialization(), edited);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [, renderRules] = useState(0);
  const [rulesSave] = useState(() => new RulesSave(snapshot.preferences.rules ?? defaultProjectRules(),
    async command => {
      if (!task.current.mounted || task.current.lock === 'restore') throw new Error('设置任务正在处理，请稍后重试');
      if (!task.current.lock) task.current.lock = 'rules';
      try {
        const guarded = { ...command, expectedRevision: confirmedRevision.current } as Command;
        const result = await (call ? call(guarded) : save(guarded));
        const revision = (result as { revision?: number } | null)?.revision;
        if (typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= confirmedRevision.current)
          confirmedRevision.current = revision;
        return result;
      } finally { if (task.current.lock === 'rules') task.current.lock = ''; }
    }, () => renderRules(n => n + 1)));
  const rules = rulesSave.draft;
  const setRules = (value: typeof rules) => { edited(); rulesSave.update(value); };
  const rulesStatus = rulesSave.saving ? t('正在自动保存…') : rulesSave.dirty ? t('未保存修改') : t('已自动保存');
  const [closingRules, setClosingRules] = useState(false);
  const [, renderPersonal] = useState(0);
  const [personalSave] = useState(() => new PersonalSave(command => {
    if (!call) return Promise.reject(new Error('私人订制尚未就绪'));
    return call(command);
  }, () => renderPersonal(n => n + 1)));
  const [personalTab, setPersonalTab] = useState<PersonalFile>('IDENTITY.md');
  const [, renderSpeech] = useState(0);
  const [speechSave] = useState(() => new SpeechSave(command => {
    if (!call) return Promise.reject(new Error('语音播报尚未就绪'));
    return call(command);
  }, () => renderSpeech(n => n + 1)));
  useEffect(() => {
    if (tab === 'tools' && toolsTab === 'speech' && speechComponentEnabled && !speechSave.status && !speechSave.busy && !speechSave.error)
      void speechSave.load();
  }, [tab, toolsTab, speechComponentEnabled, speechSave]);
  useEffect(() => { if (tab === 'personal' && !personalSave.catalog && !personalSave.busy && !personalSave.error) void personalSave.load(); }, [tab, personalSave]);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const rule = rules.projects.find(item => item.id === selectedRule);
  const closeRule = () => setSelectedRule(null);
  const flushRules = async () => {
    edited();
    if (task.current.lock === 'restore' || task.current.lock === 'close') return false;
    task.current.lock = 'close';
    const generation = task.current.generation;
    try {
    const ok = await rulesSave.flush();
    if (!task.current.mounted || generation !== task.current.generation) return false;
    if (!ok) setClosingRules(true);
    return ok;
    } finally { if (task.current.lock === 'close') task.current.lock = ''; }
  };
  const cancel = () => { void flushRules().then(ok => { if (ok && task.current.mounted) onClose(); }); };
  const backupCall = useCallback(async (command: Command) => {
    if (!call) throw new Error('当前环境无法读取备份状态。');
    if (!['restore-confirm', 'preferences'].includes(command.op)) return call(command);
    if (task.current.lock) throw new Error('设置任务正在处理，请稍后重试');
    task.current.lock = 'restore'; edited();
    try {
      const result = await call(command.op === 'preferences'
        ? { ...command, expectedRevision: confirmedRevision.current } : command);
      const revision = (result as { revision?: number } | null)?.revision;
      if (command.op === 'preferences' && typeof revision === 'number' && Number.isSafeInteger(revision)
        && revision >= confirmedRevision.current) confirmedRevision.current = revision;
      return result;
    }
    finally { if (task.current.lock === 'restore') task.current.lock = ''; }
  }, [call]);
  const restoreChanged = (value: boolean) => {
    live.current.restoreBusy = value;
    if (value) edited();
    setRestoreBusy(value);
  };
  useEffect(() => {
    registerCloseGuard?.(flushRules);
    return () => { registerCloseGuard?.(null); rulesSave.dispose(); };
  }, [rulesSave, registerCloseGuard]);
  const rulesProps = { value: rules, onChange: setRules, projects: snapshot.projects, disabled: busy || restoreBusy,
    savedValue: rulesSave.saved,
    renderMarkdown, saveStatus: rulesStatus, saveError: rulesSave.error ? errorText(rulesSave.error) : '', saving: rulesSave.saving,
    retry: () => { void rulesSave.retry(); } };
  const ruleErrorId = useId();
  const ruleInvalid = initialization.agent && initialization.commitRules && !initialization.commitRuleContent.trim();
  const content = useRef<HTMLDivElement>(null);
  const switchTab = (value: typeof tab) => { setTab(value); if (content.current) content.current.scrollTop = 0; };
  const resetScroll = () => { if (content.current) content.current.scrollTop = 0; };
  const navKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const next = nextTabIndex(e.key, i, categories.length);
    switchTab(categories[next]!.value); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  };
  const homeRows = [
    { key: 'quick', label: '快捷会话', hint: '输入任务并选择项目，直接开始新会话。' },
    { key: 'stats', label: '数据统计', hint: '展示统计卡，并开启「统计卡片」页签。' },
    { key: 'recent', label: '最近会话', hint: '显示输入框下方的最近会话入口。' },
    { key: 'projects', label: '项目总览', hint: '显示项目列表 / 宫格与筛选、视图切换按钮。' },
  ] as const;
  const sidebarHelp = t('侧栏入口与顶部返回按钮至少保留一个。');
  return <ModalFlow embedded={embedded} onModalState={onModalState} fallbackFocus=".rules-search input" main={
    <Modal title="工作台设置" drawer busy={busy} onClose={cancel}>
    <form className="wb-settings" aria-describedby={describedBy} onKeyDown={preventImeSubmit}
    onCompositionStart={() => rulesSave.composition(true)} onCompositionEnd={() => rulesSave.composition(false)} onSubmit={e => {
    e.preventDefault();
    if (busy || picking || restoreBusy || personalSave.busy || speechSave.busy
      || (task.current.lock && task.current.lock !== 'rules')) return;
    if (nameInvalid || ruleInvalid) return;
    if (!extensionConfigSchema.safeParse(extensionConfig).success) {
      setTab('extensions');
      requestAnimationFrame(() => content.current?.querySelector<HTMLInputElement>('[name="extension-mcp-timeout"]')?.focus());
      return;
    }
    task.current.lock = 'save';
    setSaveError('');
    setSubmitting(true);
    const generation = task.current.generation;
    // 回执有效性只认本实例、本次代次与保存锁；父级 busy 只用于禁用按钮，
    // 它在写入期间由 run() 置真、回执到达那一帧仍是旧值，不能拿它吞掉回执。
    const current = () => task.current.mounted && task.current.generation === generation
      && task.current.lock === 'save' && !live.current.restoreBusy;
    void (async () => {
      try {
      const rulesSaved = await rulesSave.flush();
      if (!current()) return;
      if (!rulesSaved && rulesSave.error) { setClosingRules(true); return; }
      const personalSaved = await personalSave.flush();
      if (!current()) return;
      if (!personalSaved) { setTab('personal'); return; }
      if (speechComponentEnabled) {
        const speechSaved = await speechSave.flush();
        if (!current()) return;
        if (!speechSaved) { setTab('tools'); setToolsTab('speech'); return; }
      }
      // 只接续本实例的规则/偏好写入回执，不能采纳恢复后的新 snapshot 来授权旧草稿。
      const expectedRevision = confirmedRevision.current;
      const ok = await save({ op: 'settings', theme, permissions: {},
        expectedRevision,
        options: { language, home, root: root.trim(),
      projectInitialization: initialization, extensionConfig,
      openOnStartup, agentManageTodos, pluginAutoUpdate, terminalSettingsVisible, speechComponentEnabled, backup: { ...backup, directory: backup.directory.trim() },
      ...(!pluginUpdateBusy ? { pluginUpdateVisible } : {}),
      navigation: { ...navigation, sidebarName: navigation.sidebarName.trim() || snapshot.preferences.navigation.sidebarName } } });
      if (!current()) return;
      if (!ok) { setSaveError(t('设置未能保存，请重试')); return; }
      onClose();
      } catch (error) {
        if (current()) setSaveError(error instanceof Error ? error.message : '保存失败');
      } finally {
        if (task.current.lock === 'save') task.current.lock = '';
        if (task.current.mounted) setSubmitting(false);
      }
    })();
  }}>
    <div className="settings-layout">
      <nav className="settings-nav" role="tablist" aria-label="设置分类" aria-orientation="vertical">{categories.map(({ value, label, icon }, i) => <button type="button" role="tab" id={`wb-settings-tab-${value}`} aria-controls={`wb-settings-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => switchTab(value)} onKeyDown={e => navKey(e, i)}><Icon name={icon}/>{label}</button>)}</nav>
      <div className="wb-drawer-body settings-content" ref={content}>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-appearance" aria-labelledby="wb-settings-tab-appearance" hidden={tab !== 'appearance'}>
          <h3>外观布局</h3><p className="dialog-description">选择工作台主题，调整首页模块与统计卡片。</p>
          <SettingsSubtabs scope="appearance" label="外观布局分类" value={appearanceTab} options={[{ value: 'layout', label: '首页模块' }, { value: 'stats', label: '统计卡片', hidden: !home.stats }, { value: 'theme', label: '主题配色' }]} onChange={value => { setAppearanceTab(value); resetScroll(); }}/>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-theme" aria-labelledby="wb-settings-appearance-tab-theme" hidden={appearanceTab !== 'theme'}>
            <div className="theme-mode-note"><Icon name="info"/><div className="theme-mode-copy"><strong>当前外观：{dark ? '深色' : '浅色'}</strong><span>切换明暗模式，请前往 DSH 设置 → 外观。</span></div></div>
            <div className="theme-choices" role="radiogroup" aria-label="工作台主题">{themeOptions.map(({ value, label }) => <label className="theme-choice" key={value}>
              <input type="radio" name="workbase-theme" value={value} checked={theme === value} disabled={busy} onChange={() => { setTheme(value); preview(value); }}/>
              <span className="theme-choice-copy"><strong>{label}</strong></span>
            </label>)}</div>
            <p className="settings-inline-note">即时预览，保存后生效。</p>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-layout" aria-labelledby="wb-settings-appearance-tab-layout" hidden={appearanceTab !== 'layout'}>
          {homeRows.map(({ key, label, hint }) => <div key={key}><label className="wb-setting-row setting-row homepage-setting"><div><strong>{`显示${label}`}</strong><small>{hint}</small></div>
            <input type="checkbox" aria-label={`显示${label}`} checked={home[key]} disabled={busy} onChange={e => { setHome({ ...home, [key]: e.target.checked }); if (key === 'stats' && !e.target.checked) setAppearanceTab('layout'); }}/>
          </label>{key === 'recent' && <div className="setting-dependent" hidden={!home.recent}><label className="setting-row"><div><strong>最近会话样式</strong>{home.stats && <small>统计开启时固定为按钮，关闭后恢复所选样式。</small>}</div><Picker variant="recent-layout" label="最近会话样式" value={home.stats ? 'buttons' : home.recentStyle} disabled={busy || home.stats} onChange={value => setHome({ ...home, recentStyle: value as 'cards' | 'buttons' })}
            options={[{ value: 'cards', label: '卡片' },{ value: 'buttons', label: '按钮' }]}/></label></div>}</div>)}
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-appearance-panel-stats" aria-labelledby="wb-settings-appearance-tab-stats" hidden={!home.stats || appearanceTab !== 'stats'}>
            {statCardRows.map(({ key, label, hint }) => <label className="wb-setting-row setting-row" key={key}><div><strong>{`显示${label}`}</strong><small>{hint}</small></div>
              <input type="checkbox" aria-label={`显示${label}`} checked={home.statCards[key]} disabled={busy} onChange={e => {
                if (e.target.checked && Object.values(home.statCards).filter(Boolean).length >= 6) {
                  setStatError('最多显示 6 张统计卡，请先关闭一项'); return;
                }
                setStatError(''); setHome({ ...home, statCards: { ...home.statCards, [key]: e.target.checked } });
              }}/></label>)}
            {statError && <p role="alert" className="wb-warning">{statError}</p>}
            <label className="wb-setting-row setting-row"><div><strong>时间范围</strong><small>同时影响会话统计、RSS 更新与项目「近期活跃」数量。</small></div>
              <Picker variant="stat-days" label="统计时间范围" value={String(home.statDays)} disabled={busy} onChange={value => setHome({ ...home, statDays: Number(value) })}
                options={[{ value: '7', label: '最近 7 天' },{ value: '14', label: '最近 14 天' },{ value: '30', label: '最近 30 天' }]}/></label>
          </div>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-extensions" aria-labelledby="wb-settings-tab-extensions" hidden={tab !== 'extensions'}>
          {tab === 'extensions' && <ExtensionSettings value={extensionConfig} onChange={setExtensionConfig} disabled={busy || restoreBusy} call={call} tab={extensionTab} onTabChange={setExtensionTab}/>}
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-general" aria-labelledby="wb-settings-tab-general" hidden={tab !== 'general'}>
          <h3>通用配置</h3><p className="dialog-description">统一配置启动页面和工作台入口。</p>
          <label className="wb-setting-row setting-row"><div><strong>界面语言</strong><small>默认跟随平台，仅切换界面语言，保留用户内容。</small></div>
            <Picker label="界面语言" value={language} disabled={busy} onChange={value => setLanguage(value as Preferences['language'])}
              options={[{ value: 'follow', label: '跟随平台' }, { value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}/></label>
          <label className="wb-setting-row setting-row"><div><strong>启动打开首页</strong><small>下次启动 DSH 桌面端时进入工作台首页。</small></div>
            <input type="checkbox" aria-label="启动打开首页" checked={openOnStartup} disabled={busy} onChange={e => setOpenOnStartup(e.target.checked)}/></label>
          <label className="wb-setting-row setting-row"><div><strong>显示侧栏入口</strong><small className="settings-single-line" title={sidebarHelp}>{sidebarHelp}</small></div>
            <input type="checkbox" aria-label="显示侧栏入口" checked={navigation.sidebarVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, sidebarVisible: e.target.checked, headerButtonVisible: e.target.checked ? navigation.headerButtonVisible : true })}/></label>
          <div className="setting-dependent" hidden={!navigation.sidebarVisible}>
          <label className="wb-setting-row setting-row" htmlFor="wb-sidebar-name"><div><strong>侧栏入口名称</strong><small>最多 30 字。</small></div>
            <input className="settings-text-control" id="wb-sidebar-name" aria-label="侧栏入口名称" aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? nameErrorId : describedBy} value={navigation.sidebarName} maxLength={30} disabled={busy || !navigation.sidebarVisible} placeholder="项目概览" onChange={e => setNavigation({ ...navigation, sidebarName: e.target.value })}/></label>
          {nameInvalid && <p id={nameErrorId} className="wb-warning" role="alert">请填写侧栏入口名称。</p>}
          <label className="wb-setting-row setting-row"><div><strong>侧栏菜单位置</strong><small>顺序从顶部数，倒序从底部数。</small></div>
            <Picker variant="sidebar-position" label="侧栏菜单位置" value={String(navigation.sidebarPosition)} disabled={busy || !navigation.sidebarVisible}
              onChange={value => setNavigation({ ...navigation, sidebarPosition: Number(value) })}
              options={[1, -1].flatMap(direction => Array.from({ length: 3 }, (_, i) => ({
                value: String(direction * (i + 1)), label: `${direction > 0 ? '顺序' : '倒序'}第 ${i + 1} 个`,
              })))}/></label></div>
          <label className="wb-setting-row setting-row"><div><strong>显示返回按钮</strong><small>在会话顶部提供返回工作台入口。</small></div>
            <input type="checkbox" aria-label="显示返回按钮" checked={navigation.headerButtonVisible} disabled={busy}
              onChange={e => setNavigation({ ...navigation, headerButtonVisible: e.target.checked, sidebarVisible: e.target.checked ? navigation.sidebarVisible : true })}/></label>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-backup" aria-labelledby="wb-settings-tab-backup" hidden={tab !== 'backup'}>
          <h3>备份恢复</h3><p className="dialog-description">管理数据备份、恢复与执行状态。</p>
          <SettingsSubtabs scope="backup" label="备份恢复分类" value={backupTab} options={[{ value: 'backup', label: '数据备份' }, { value: 'restore', label: '数据恢复' }, { value: 'status', label: '执行状态' }]} onChange={value => { setBackupTab(value); resetScroll(); }}/>
          <BackupSettings tab={backupTab} value={backup} onChange={setBackup} pickDirectory={pickDirectory}
            disabled={busy || picking || restoreBusy || submitting} onPickingChange={setPicking} onRestoreBusyChange={restoreChanged} onRestored={onRestored} call={call ? backupCall : undefined}/>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-project" aria-labelledby="wb-settings-tab-project" hidden={tab !== 'project'}>
          <h3>项目配置</h3><p className="dialog-description">管理全局设置、初始化设置与项目规则。</p>
          <SettingsSubtabs scope="project" label="项目配置分类" value={projectTab} options={[{ value: 'global', label: '全局设置' }, { value: 'initialization', label: '初始化设置' }, { value: 'single', label: '项目规则' }]} onChange={value => { setProjectTab(value); resetScroll(); }}/>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-project-panel-global" aria-labelledby="wb-settings-project-tab-global" hidden={projectTab !== 'global'}>
          <ProjectRulesSettings scope="global" {...rulesProps}/>
          <DirectoryInput label="默认项目根目录" value={root} onChange={setRoot} disabled={busy} pickDirectory={pickDirectory} onPickingChange={setPicking}
            help="仅用于新建项目，不改变已有项目目录。"/>
          <label className="wb-setting-row setting-row"><div><strong>允许 Agent 管理待办</strong><small>所有项目生效：开启可增删改待办及完成状态，关闭仅可查询。</small></div>
            <input type="checkbox" aria-label="允许 Agent 管理待办" checked={agentManageTodos} disabled={busy} onChange={e => setAgentManageTodos(e.target.checked)}/></label>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-project-panel-initialization" aria-labelledby="wb-settings-project-tab-initialization" hidden={projectTab !== 'initialization'}>
          <p className="settings-inline-note">以下配置保存后用于新建项目。</p>
          <label className="wb-setting-row setting-row"><div><strong>项目基础文件</strong><small>生成 README.md 和 .editorconfig。</small></div>
            <input type="checkbox" aria-label="项目基础文件" checked={initialization.basic} disabled={busy}
              onChange={e => setInitialization({ ...initialization, basic: e.target.checked })}/>
          </label>
          <label className="wb-setting-row setting-row"><div><strong>Agent 协作规范</strong><small>生成 AGENTS.md 和 .agents/notes/dev-log.md。</small></div>
            <input type="checkbox" aria-label="Agent 协作规范" checked={initialization.agent} disabled={busy}
              onChange={e => setInitialization({ ...initialization, agent: e.target.checked })}/></label>
          <div className="setting-dependent" hidden={!initialization.agent}>
            <label className="wb-setting-row setting-row"><div><strong>生成提交规则</strong><small>写入 .agents/rules/git-commit-message.md，并在 AGENTS.md 中引用。</small></div>
              <input type="checkbox" aria-label="生成提交规则" checked={initialization.commitRules} disabled={busy || !initialization.agent}
                onChange={e => setInitialization({ ...initialization, commitRules: e.target.checked })}/></label>
            <div className="project-commit-rules" hidden={!initialization.commitRules}>
              <RulesEditor label="提交规则内容" maxLength={10000} showLabel={false} saveMode="settings"
                invalid={ruleInvalid} errorId={ruleInvalid ? ruleErrorId : undefined} renderMarkdown={renderMarkdown}
                value={initialization.commitRuleContent} disabled={busy || !initialization.agent || !initialization.commitRules}
                onChange={commitRuleContent => setInitialization({ ...initialization, commitRuleContent })}/>
            </div>
            {ruleInvalid && <p id={ruleErrorId} className="wb-warning" role="alert">请填写提交规则内容。</p>}
          </div>
          <label className="wb-setting-row setting-row"><div><strong>Git 初始化</strong><small>创建 main 分支空仓库和 .gitignore，不自动提交。</small></div>
            <input type="checkbox" aria-label="Git 初始化" checked={initialization.git} disabled={busy}
              onChange={e => setInitialization({ ...initialization, git: e.target.checked })}/></label>
          <label className="wb-setting-row setting-row"><div><strong>添加已有项目时补齐缺失内容</strong><small>默认关闭；仅补齐已勾选项，保留已有文件和 Git 仓库。</small></div>
            <input type="checkbox" aria-label="添加已有项目时补齐缺失内容" checked={initialization.completeOnImport} disabled={busy}
              onChange={e => setInitialization({ ...initialization, completeOnImport: e.target.checked })}/></label>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-project-panel-single" aria-labelledby="wb-settings-project-tab-single" hidden={projectTab !== 'single'}>
            <ProjectRulesSettings scope="projects" {...rulesProps} select={setSelectedRule}/>
          </div>
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-personal" aria-labelledby="wb-settings-tab-personal" hidden={tab !== 'personal'}>
          <h3>私人订制</h3><p className="dialog-description">设置伙伴身份、用户信息、行为准则和长期记忆，保存后用于所有会话的后续请求。</p>
          <SettingsSubtabs scope="personal" label="私人订制分类" value={personalTab}
            options={personalFiles.map((value, i) => ({ value, label: personalLabels[i]! }))}
            onChange={value => { setPersonalTab(value); resetScroll(); }}/>
          {personalSave.busy && <p role="status" className="settings-inline-note">正在处理档案…</p>}
          {personalSave.error && <p className="wb-warning" role="alert">{errorText(personalSave.error)}
            <button type="button" disabled={personalSave.busy || busy} onClick={() => { void personalSave.load(); }}>重新读取档案（保留修改草稿）</button></p>}
          {personalSave.catalog && <>
            {!personalSave.catalog.active && <p className="settings-inline-note">提示词服务未就绪；可保存文件，暂不用于模型。</p>}
            {personalFiles.map((file, i) => <div key={file} className="settings-subpanel" role="tabpanel"
              id={`wb-settings-personal-panel-${file}`} aria-labelledby={`wb-settings-personal-tab-${file}`} hidden={personalTab !== file}>
              <RulesEditor label={`${personalLabels[i]} · ${file}`} value={personalSave.drafts.get(file) ?? ''}
                disabled={busy || restoreBusy || personalSave.busy} maxLength={20000} saveMode="settings" renderMarkdown={renderMarkdown}
                onChange={content => { edited(); personalSave.update(file, content); }}/>
            </div>)}
          </>}
        </section>
        <section className="settings-panel" role="tabpanel" id="wb-settings-panel-tools" aria-labelledby="wb-settings-tab-tools" hidden={tab !== 'tools'}>
          <h3>其他组件</h3><p className="dialog-description">简单实用的组件。</p>
          <SettingsSubtabs scope="tools" label="其他组件分类" value={toolsTab}
            options={[{ value: 'general', label: '通用组件' }, { value: 'speech', label: '语音播报', hidden: !speechComponentEnabled }]}
            onChange={value => { setToolsTab(value); resetScroll(); }}/>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-tools-panel-general" aria-labelledby="wb-settings-tools-tab-general" hidden={toolsTab !== 'general'}>
          <label className="wb-setting-row setting-row"><div><strong>插件更新</strong><small>在插件页提供已安装插件的一键更新。</small></div>
            <input type="checkbox" aria-label="插件更新" checked={pluginUpdateVisible} disabled={busy || pluginUpdateBusy} onChange={e => setPluginUpdateVisible(e.target.checked)}/></label>
          <div className="setting-dependent" hidden={!pluginUpdateVisible}><label className="wb-setting-row setting-row"><div><strong>开启自动更新</strong><small>启动时后台更新插件，保存后下次启动生效。</small></div>
            <input type="checkbox" aria-label="开启自动更新" checked={pluginAutoUpdate} disabled={busy || !pluginUpdateVisible} onChange={e => setPluginAutoUpdate(e.target.checked)}/></label></div>
          <label className="wb-setting-row setting-row"><div><strong>终端扩展</strong><small>配置终端字体、字号、配色和 Shell，关闭后保留设置。</small></div>
            <input type="checkbox" aria-label="终端扩展" checked={terminalSettingsVisible} disabled={busy} onChange={e => setTerminalSettingsVisible(e.target.checked)}/></label>
          {pluginUpdateBusy && <p className="settings-inline-note" role="status">插件正在检查或更新，完成后可调整入口显示。</p>}
          <label className="wb-setting-row setting-row"><div><strong>语音播报</strong><small>保存后启用会话播报；关闭时停止播放，保留配置与密钥。</small></div>
            <input type="checkbox" aria-label="语音播报" checked={speechComponentEnabled} disabled={busy || restoreBusy || speechSave.busy}
              onChange={e => { setSpeechComponentEnabled(e.target.checked); if (!e.target.checked) setToolsTab('general'); }}/></label>
          </div>
          <div className="settings-subpanel" role="tabpanel" id="wb-settings-tools-panel-speech" aria-labelledby="wb-settings-tools-tab-speech" hidden={!speechComponentEnabled || toolsTab !== 'speech'}>
            <SpeechSettings draft={speechSave} disabled={busy || restoreBusy || !speechComponentEnabled}/>
          </div>
        </section>
      </div>
    </div>
    {saveError && <p className="wb-warning" role="alert">{errorText(saveError)}</p>}
    {closingRules && rulesSave.dirty && <div className="rules-close-warning"><p className="wb-warning" role="alert">规则仍有未保存修改，请完善内容或重试保存。</p>
      <button type="button" disabled={busy || rulesSave.saving} onClick={() => { edited(); rulesSave.discard(); onClose(); }}>放弃未保存规则并关闭</button></div>}
    <footer className="dialog-footer"><span className="settings-save-note">{restoreBusy ? '恢复任务进行中，暂停保存设置' : nameInvalid ? '请填写通用配置中的侧栏入口名称' : ruleInvalid ? '请填写项目配置中的提交规则内容' : '规则自动保存 · 其余配置点击保存'}</span><button type="button" disabled={busy || picking || restoreBusy || personalSave.busy || speechSave.busy} onClick={cancel}>取消</button><button type="submit" className="wb-primary primary" disabled={busy || picking || personalSave.busy || speechSave.busy || restoreBusy || submitting || nameInvalid || ruleInvalid}>保存设置</button></footer>
  </form>
  </Modal>
  } detail={rule && <Modal title={rule.name || t('未命名规则')} onClose={closeRule} drawer className="rules-detail-dialog" busy={busy}
    leading={<IconButton name="back" label="返回规则列表" disabled={busy} onClick={closeRule}/>}>
    <div className="rules-detail-body" onCompositionStart={() => rulesSave.composition(true)} onCompositionEnd={() => rulesSave.composition(false)}>
      <ProjectRuleDetail {...rulesProps} rule={rule}/>
    </div>
  </Modal>}/>;
}
