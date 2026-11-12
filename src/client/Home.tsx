import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Snapshot, Project, Preferences, Todo } from '../shared/model.js';
import type { Command } from '../shared/commands.js';
import type { ClientPort, UiMemory } from './api.js';
import { Composer } from './Composer.js';
import { StatsProjectPanel, type StatEntry } from './StatsProjectPanel.js';
import { DiagnosticsPanel, diagnosticSummary, fallbackDiagnosis } from './DiagnosticsPanel.js';
import { TodoDetail } from './TodoDetail.js';
import type { Diagnosis } from '../shared/diagnostics.js';
import { dateText, folderName, Icon, IconButton, Menu, Modal, Tabs } from './ui.js';

export interface HomeProps {
  snapshot: Snapshot; api: ClientPort; memory: UiMemory; busy: boolean;
  mutate(command: Command): Promise<boolean>; navigate(projectId: string): void;
  refresh(): Promise<void>;
  rename(project: Project): void; removeProject(project: Project): void; notify(message: string): void;
}
const fieldLabels: Record<keyof Preferences['fields']['grid'], string> = {
  directory: '目录名称', activity: '最近活动', status: '状态', active: '近期活跃', todos: '待办', archived: '归档', recent: '最近会话',
};
const listFields = [
  ['active', 'recent', 80], ['todos', 'pending', 64], ['archived', 'archived', 64],
  ['recent', 'latest', 180], ['activity', 'activity', 108], ['status', 'status', 110],
] as const;
const statTabs = [
  ['running', '运行中', 'stats-running'], ['recent', '会话', 'message-circle'],
  ['pending', '待办', 'stats-todos'], ['diagnostic', '诊断', 'alert'],
] as const;
export function fitRecentButtons(width: number, widths: readonly number[], gap = 8) {
  let used = 0, count = 0;
  for (const item of widths) {
    const next = used + (count ? gap : 0) + item;
    if (next > width + 0.5) break;
    used = next; count++;
  }
  return count;
}
export function Home({ snapshot, api, memory, busy, mutate, navigate, rename, removeProject, notify, refresh }: HomeProps) {
  const root = useRef<HTMLDivElement>(null);
  const recentRow = useRef<HTMLDivElement>(null);
  const [recentCount, setRecentCount] = useState(Infinity);
  const [stat, setStat] = useState<'running' | 'recent' | 'pending' | 'diagnostic' | null>(null);
  const [statTodo, setStatTodo] = useState<{ project: Project; todo: Todo } | null>(null);
  const statReturn = useRef<{ focus: HTMLElement | null; scroll: { node: HTMLElement; top: number; left: number }[] } | null>(null);
  useLayoutEffect(() => {
    if (statTodo || !statReturn.current) return;
    const origin = statReturn.current;
    statReturn.current = null;
    // 子弹窗的布局效果已恢复模态范围，在本次绘制前恢复原列表。
    for (const item of origin.scroll) if (item.node.isConnected) {
      item.node.scrollTop = item.top; item.node.scrollLeft = item.left;
    }
    const fallback = root.current?.closest('.wb')?.querySelector<HTMLElement>('.stats-drawer .stats-group-results');
    (origin.focus?.isConnected ? origin.focus : fallback)?.focus({ preventScroll: true });
  }, [statTodo]);
  const [freshDiagnosis, setFreshDiagnosis] = useState<{ snapshot: Snapshot; report: Diagnosis } | null>(null);
  useLayoutEffect(() => { if (root.current) root.current.scrollTop = memory.homeScroll; }, []);
  const prefs = snapshot.preferences, home = prefs.home;
  const grid = prefs.view === 'grid', fields = prefs.fields[prefs.view];
  const since = Date.now() - home.statDays * 86400000;
  const visibleStatTabs = statTabs.filter(([key]) => home.statCards[key]);
  const projects = snapshot.projects.filter(p => prefs.projectFilter === 'favorite' ? p.mark.favorite : prefs.projectFilter === 'archived' ? p.archived : !p.archived)
    .sort((a, b) => Number(b.mark.pinned) - Number(a.mark.pinned) || b.updatedAt - a.updatedAt);
  const allSessions = snapshot.projects.flatMap(p => p.sessions.map(s => ({ ...s, project: p }))).sort((a,b) => b.updatedAt - a.updatedAt);
  const recentStyle = home.stats ? 'buttons' : home.recentStyle;
  const recent = allSessions.filter(s => !s.archived).slice(0, recentStyle === 'cards' ? 5 : undefined);
  const recentKey = JSON.stringify(recent.map(s => [s.sessionId, s.title]));
  useLayoutEffect(() => {
    const row = recentRow.current;
    if (!row || recentStyle !== 'buttons') return;
    const measure = () => {
      const buttons = [...row.querySelectorAll<HTMLButtonElement>(':scope > button')];
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      setRecentCount(fitRecentButtons(row.clientWidth, buttons.map(b => b.getBoundingClientRect().width), gap));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const child of row.children) observer.observe(child);
    measure();
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [recentStyle, recentKey, home.recent, home.quick]);
  const running = allSessions.filter(s => s.running && !s.archived);
  const active = allSessions.filter(s => s.updatedAt >= since && !s.archived);
  const pending = snapshot.projects.flatMap(p => p.todos.filter(t => !t.done).map(t => ({ ...t, project: p })));
  const diagnosis = freshDiagnosis?.snapshot === snapshot ? freshDiagnosis.report : snapshot.diagnostics ?? fallbackDiagnosis(snapshot);
  const diagnostics = diagnosticSummary(diagnosis);
  const copyPath = async (path: string) => {
    try { await navigator.clipboard.writeText(path); notify('完整路径已复制'); }
    catch { notify('复制失败，请在项目详情中手动复制完整路径'); }
  };
  const openDirectory = (p: Project) => {
    void api.revealDirectory(p.projectId).then(ok => { if (!ok) notify('暂时无法打开目录，请在项目详情复制路径后手动打开'); });
  };
  const archiveProject = (p: Project, archived: boolean) => {
    void mutate({ op: 'archive-project', projectId: p.projectId, archived });
  };
  const menus = (p: Project) => p.archived ? [
    { label: p.mark.favorite ? '取消收藏' : '收藏项目', action: () => void mutate({ op: 'mark', projectId: p.projectId, field: 'favorite', value: !p.mark.favorite }) },
    { label: '打开目录', action: () => openDirectory(p) },
    { label: '恢复项目', action: () => archiveProject(p, false) },
  ] : [
    { label: '重命名', action: () => rename(p) },
    { label: p.mark.favorite ? '取消收藏' : '收藏项目', action: () => void mutate({ op: 'mark', projectId: p.projectId, field: 'favorite', value: !p.mark.favorite }) },
    { label: '打开目录', action: () => openDirectory(p) },
    { label: '项目迁移', separatorBefore: true, action: () => notify('暂不支持项目迁移，原目录与历史会话已保留') },
    { label: '迁移记录', action: () => notify('暂无迁移记录，宿主尚未提供迁移能力') },
    { label: '归档项目', action: () => archiveProject(p, true) },
    { label: '移除项目', action: () => removeProject(p), danger: true },
  ];
  const visibleColumns = listFields.filter(([key]) => fields[key]);
  const columns = `[project] minmax(220px,1fr) ${visibleColumns.map(([,name,width]) => `[${name}] ${width}px`).join(' ')} [actions] 28px`;
  const minimum = 220 + 28 + 16 + 12 * (visibleColumns.length + 1) + visibleColumns.reduce((sum, [,,width]) => sum + width, 0);
  const pin = (p: Project) => <span className="entity-marks"><IconButton name="pin" label={p.mark.pinned ? '取消置顶项目' : '置顶项目'} className="wb-pin entity-mark-button" active={p.mark.pinned} disabled={busy}
    onClick={() => void mutate({ op: 'mark', projectId: p.projectId, field: 'pinned', value: !p.mark.pinned })}/></span>;
  const title = (p: Project) => <button className="wb-project-title project-open" type="button" onClick={() => navigate(p.projectId)} title={`${p.title} · ${p.path}`}>{p.title}</button>;
  const path = (p: Project) => <button type="button" className="wb-path path path-copy" onClick={() => void copyPath(p.path)} title={p.path} aria-label={`复制${p.title}的完整路径`}><span className="directory-name"><Icon name="path-dots" size={14}/><span className="directory-label">{folderName(p.path)}</span></span></button>;
  const state = (p: Project) => !p.available ? 'error' : p.sessions.some(s => s.running) ? 'running' : 'normal';
  const status = (p: Project) => state(p) === 'normal' ? null : <span className={`status ${state(p)}`}><i className="status-dot"/><span className="status-text">{p.available ? '运行中' : '目录异常'}</span></span>;
  const projectIcon = (p: Project) => <span className={`project-icon state-${state(p)}`} title={p.available ? '目录可用' : '目录异常'}><Icon name={state(p) === 'error' ? 'alert' : state(p) === 'running' ? 'stats-running' : 'folder'}/></span>;
  const renderProjects = () => projects.map(p => {
    const latest = [...p.sessions].sort((a,b) => b.updatedAt - a.updatedAt)[0];
    const values = { active: p.sessions.filter(s => !s.archived && s.updatedAt >= since).length, todos: p.todos.filter(t => !t.done).length, archived: p.sessions.filter(s => s.archived).length };
    const lastSession = latest ? <button type="button" className={grid ? '' : 'list-session'} title={`${latest.title}${latest.archived ? ' · 已归档' : ''}`} onClick={() => api.openSession(latest.sessionId)}><span>{latest.title}</span></button> : null;
    const open = (e: React.MouseEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('button')) navigate(p.projectId); };
    return grid ? <article className="wb-project project project-summary" key={p.projectId} onClick={open}>
      <div className="project-summary-head">{projectIcon(p)}<div className="project-summary-title">{title(p)}{pin(p)}{fields.status && status(p)}</div><Menu label={`${p.title}的更多操作`} disabled={busy} items={menus(p)}/>
        {(fields.directory || (fields.activity && p.updatedAt > 0)) && <div className="project-summary-meta">{fields.directory && path(p)}{fields.activity && p.updatedAt > 0 && <span className="activity" title={`最近活动 · ${dateText(p.updatedAt)}`}>{dateText(p.updatedAt)}</span>}</div>}
      </div>
      {Object.keys(values).some(key => fields[key as keyof typeof values]) && <div className="project-summary-metrics" data-columns={Object.keys(values).filter(key => fields[key as keyof typeof values]).length}>
        {Object.entries(values).filter(([key]) => fields[key as keyof typeof values]).map(([key, value]) => <div className={`project-summary-metric ${key === 'todos' && value ? 'has-pending' : ''}`} key={key}><strong>{value}</strong><small>{fieldLabels[key as keyof typeof fieldLabels]}</small></div>)}
      </div>}
      {fields.recent && latest && <div className="project-summary-latest">{lastSession}</div>}
    </article> : <article className="wb-project project" key={p.projectId} onClick={open}>
      <div className="project-name">{projectIcon(p)}<div className="project-copy"><div className="entity-title">{title(p)}{pin(p)}</div>{fields.directory && path(p)}</div></div>
      <div className="project-footer">{visibleColumns.map(([key,name]) => <div className="project-list-cell" data-field={name} key={key}>
        <span className="list-field-label">{fieldLabels[key]}</span>{key === 'recent' ? lastSession : key === 'activity' ? p.updatedAt > 0 && <span className="activity">{dateText(p.updatedAt)}</span> : key === 'status' ? status(p) : <span className="list-value">{values[key]}</span>}
      </div>)}</div><Menu label={`${p.title}的更多操作`} disabled={busy} items={menus(p)}/>
    </article>;
  });
  const openTodo = (t: typeof pending[number]) => {
    const dialog = root.current?.closest('.wb')?.querySelector<HTMLElement>('.stats-drawer');
    const focus = [...(dialog?.querySelectorAll<HTMLElement>('[data-stat-entry]') ?? [])].find(node => node.dataset.statEntry === t.id) ?? null;
    statReturn.current = {
      focus, scroll: dialog ? [dialog, ...dialog.querySelectorAll<HTMLElement>('.settings-content,.settings-panel,.stats-group-results,.stats-group-items,.stats-project-groups')].map(node => ({ node, top: node.scrollTop, left: node.scrollLeft })) : [],
    };
    setStatTodo({ project: t.project, todo: t });
  };
  return <main className="wb-home main home-main" ref={root} onScroll={e => { memory.homeScroll = e.currentTarget.scrollTop; }}>
    {home.quick && <Composer snapshot={snapshot} api={api} memory={memory}/>}
    {home.recent && recent.length > 0 && <section className="wb-recent recent-sessions" data-layout={recentStyle} aria-label="最近会话">
      <div ref={recentRow} className={`recent-shortcuts wb-recent-${recentStyle}`} data-layout={recentStyle}>{recent.map((s, index) => <button type="button" className="recent-session" key={s.sessionId}
        data-overflow={recentStyle === 'buttons' && index >= recentCount ? 'true' : undefined}
        aria-hidden={recentStyle === 'buttons' && index >= recentCount || undefined} tabIndex={recentStyle === 'buttons' && index >= recentCount ? -1 : undefined}
        onClick={() => api.openSession(s.sessionId)} title={`${s.title} · ${s.project.title} · ${s.project.path}`}>
        <span className="recent-icon"><Icon name="message-circle" size={recentStyle === 'cards' ? 16 : 14}/></span><span className="wb-recent-copy recent-copy"><strong>{s.title}</strong>{recentStyle === 'cards' && <small><span className="recent-project">{s.project.title}</span></small>}</span>
        {recentStyle === 'cards' && <span className="recent-arrow" aria-hidden="true"><Icon name="chevron" size={14}/></span>}
      </button>)}</div>
    </section>}
    {home.stats && visibleStatTabs.length > 0 && <section className="wb-home-stats home-stats" aria-label="工作台统计"><div className="stats-grid">
      {visibleStatTabs.map(([key,label,symbol]) => {
        const value = key === 'running' ? running.length : key === 'recent' ? active.length : key === 'pending' ? pending.length : diagnostics.count;
        const detail = key === 'running' ? running.length ? `${new Set(running.map(s => s.project.projectId)).size} 个项目` : '暂无运行中' : key === 'recent' ? `最近 ${home.statDays} 天` : key === 'pending' ? `手动 ${pending.filter(t => t.creator === 'user').length}／Agent ${pending.filter(t => t.creator === 'agent').length}` : diagnostics.detail;
        const diagnosticState = key === 'diagnostic' ? diagnostics.state : undefined;
        return <button className="wb-stat-card stat-card" type="button" key={key} data-stat-tab={key} data-state={diagnosticState} aria-haspopup="dialog" onClick={() => setStat(key)}><span className="recent-icon"><Icon name={diagnosticState === 'normal' ? 'check-circle' : symbol}/></span>
          <span className="stat-copy"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail" title={detail}>{detail}</span></span><span className="stat-arrow"><Icon name="chevron"/></span>
        </button>;
      })}
    </div></section>}
    {home.projects && <div className="home-content single"><section className="project-overview">
      <div className="wb-section-header toolbar project-toolbar"><h2 className="projects-title">项目总览</h2>
        <Tabs label="项目范围" value={prefs.projectFilter} options={[{ value: 'active', label: <>活跃 <small>{snapshot.projects.filter(p => !p.archived).length}</small></> }, { value: 'archived', label: <>归档 <small>{snapshot.projects.filter(p => p.archived).length}</small></> }, { value: 'favorite', label: <>收藏 <small>{snapshot.projects.filter(p => p.mark.favorite).length}</small></> }]} disabled={busy} onChange={projectFilter => void mutate({ op: 'preferences', patch: { projectFilter } })}/>
        <div className="wb-view-switch view-switch">
          <Menu icon="fields" label={`${grid ? '宫格' : '列表'}字段显示`} heading={`${grid ? '宫格' : '列表'}显示字段`} note="项目名称始终显示。列表中的目录随项目名称展示。" disabled={busy}
            items={Object.entries(fieldLabels).map(([key,label]) => ({ label, checked: fields[key as keyof typeof fields], action: () => void mutate({ op: 'preferences', patch: { fields: { ...prefs.fields, [prefs.view]: { ...fields, [key]: !fields[key as keyof typeof fields] } } } }) }))}/>
          <IconButton name="list" label="列表视图" active={!grid} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { view: 'list' } })}/>
          <IconButton name="grid" label="宫格视图" active={grid} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { view: 'grid' } })}/>
        </div>
      </div>
      {projects.length ? grid ? <div className="wb-project-grid project-grid">{renderProjects()}</div> : <div className="wb-project-table project-table" tabIndex={0} role="region" aria-label="项目列表">
        <div className="project-table-body" style={{ '--project-columns': columns, '--project-min-width': `${minimum}px` } as CSSProperties}>
          <div className="wb-table-head list-head"><span>项目名称</span>{visibleColumns.map(([key]) => <span key={key}>{fieldLabels[key]}</span>)}<span className="sr-only">操作</span></div><div className="project-list">{renderProjects()}</div>
        </div>
      </div> : <div className="wb-empty empty"><Icon name={prefs.projectFilter === 'favorite' ? 'star' : 'folder'}/><h3>{prefs.projectFilter === 'favorite' ? '暂无收藏项目' : prefs.projectFilter === 'archived' ? '暂无归档项目' : '这里还没有活跃项目'}</h3><p>{prefs.projectFilter === 'archived' ? '在项目菜单中选择「归档项目」后显示在这里，业务只读。' : '打开已有目录，或通过顶部添加新项目。'}</p></div>}
    </section></div>}
    {!home.quick && !home.recent && !home.stats && !home.projects && <p className="home-hidden">首页模块已隐藏，可通过右上角「工作台设置」恢复显示，或使用 Header 搜索打开项目和会话。</p>}
    {stat && <Modal title="工作台概览" drawer className="stats-drawer" suspended={!!statTodo} onClose={() => setStat(null)}><div className="settings-layout"><nav className="settings-nav" role="tablist" aria-label="统计分类">{visibleStatTabs.map(([key,label,symbol]) => <button type="button" role="tab" aria-selected={stat === key} key={key} onClick={() => setStat(key)}><Icon name={symbol}/>{label}</button>)}</nav>
      <div className="settings-content"><section className="settings-panel">{stat !== 'diagnostic' && <>
        <h3 className="stats-page-heading">{stat === 'running' ? '运行中' : stat === 'recent' ? '近期会话' : '项目待办'}</h3>
        <p className="dialog-description stats-page-description">{stat === 'running' ? '尚未结束的会话。' : stat === 'recent' ? `最近 ${home.statDays} 天更新的未归档会话。` : '汇总项目中的待处理事项，点击直接查看详情。'}</p>
        </>}
        {stat === 'diagnostic' ? <DiagnosticsPanel report={diagnosis} api={api} busy={busy}
          onReport={report => setFreshDiagnosis({ snapshot, report })}
          openProject={id => { navigate(id); setStat(null); }}/> : <StatsProjectPanel key={stat}
          empty="暂无符合条件的记录"
          entries={(stat === 'running' ? running : stat === 'recent' ? active : []).map(s => ({
            id: s.sessionId, title: s.title, detail: dateText(s.updatedAt), project: s.project,
            open: () => api.openSession(s.sessionId),
          })).concat(stat === 'pending' ? pending.map(t => ({
            id: t.id, title: t.title, detail: dateText(t.updatedAt), project: t.project, open: () => openTodo(t),
          })) : []) satisfies StatEntry[]}/>}
      </section></div></div><footer className="dialog-footer"><button type="button" onClick={() => setStat(null)}>关闭</button></footer>
    </Modal>}
    {statTodo && <TodoDetail key={statTodo.todo.id} api={api}
      project={snapshot.projects.find(p => p.projectId === statTodo.project.projectId) ?? { ...statTodo.project, archived: true, todos: [] }}
      initial={statTodo.todo} refresh={refresh} closeOnSave onClose={() => setStatTodo(null)}/>}
  </main>;
}
