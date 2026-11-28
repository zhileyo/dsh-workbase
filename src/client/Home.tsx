import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type HTMLAttributes } from 'react';
import type { Snapshot, Project, Preferences, Todo } from '../shared/model.js';
import { defaultStatOrder } from '../shared/model.js';
import type { Command } from '../shared/commands.js';
import type { ClientPort, UiMemory } from './api.js';
import { Composer } from './Composer.js';
import { StatsProjectPanel, type StatEntry } from './StatsProjectPanel.js';
import { DiagnosticsPanel, diagnosticSummary, fallbackDiagnosis } from './DiagnosticsPanel.js';
import { TodoDetail } from './TodoDetail.js';
import type { Diagnosis } from '../shared/diagnostics.js';
import { dateText, folderName, Icon, IconButton, Menu, Modal, Tabs, type ModalState, type Notify } from './ui.js';
import { useExtensionSummaries } from './extension-summary.js';
import { overviewTabs, type CoreOverviewTab, type OverviewTab } from './OverviewNavigation.js';
import { errorText, t as translate } from './i18n.js';
import { projectMenuItems } from './project-menu.js';
import { captureScrollPositions, restoreFocus, restoreScrollPositions, type ScrollPosition } from './focus-restore.js';

export interface HomeProps {
  snapshot: Snapshot; api: ClientPort; memory: UiMemory; busy: boolean;
  mutate(command: Command): Promise<boolean>; navigate(projectId: string): void;
  refresh(): Promise<void>;
  rename(project: Project): void; removeProject(project: Project): void; notify(message: string): void;
  openOverview?(tab: OverviewTab): void;
  migration?(project: Project, records: boolean): void;
  diagnosis?: Diagnosis;
}
const fieldLabels: Record<keyof Preferences['fields']['grid'], string> = {
  directory: '目录名称', activity: '最近活动', status: '状态', active: '近期活跃', todos: '待办', archived: '归档', recent: '最近会话',
};
// 列表可见列：key 是字段偏好里的开关，name 是具名网格线，width 是该列像素宽。
const listFields = [
  { key: 'active', name: 'recent', width: 80 }, { key: 'todos', name: 'pending', width: 64 }, { key: 'archived', name: 'archived', width: 64 },
  { key: 'recent', name: 'latest', width: 180 }, { key: 'activity', name: 'activity', width: 108 }, { key: 'status', name: 'status', width: 110 },
] as const;
const statTabs = overviewTabs;
/**
 * 首页与概览抽屉共用的统计口径：时间窗、归档排除、新到旧排序只在这里定义，
 * 两侧读同一份数据源，避免口径漂移。
 */
export function sessionStats(snapshot: Snapshot) {
  const home = snapshot.preferences.home;
  const since = Date.now() - home.statDays * 86400000;
  const allSessions = snapshot.projects.flatMap(p => p.sessions.map(s => ({ ...s, project: p }))).sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    since, allSessions,
    running: allSessions.filter(s => s.running && !s.archived),
    active: allSessions.filter(s => s.updatedAt >= since && !s.archived),
    pending: snapshot.projects.flatMap(p => p.todos.filter(t => !t.done).map(t => ({ ...t, project: p }))),
  };
}
export function fitRecentButtons(width: number, widths: readonly number[], gap = 8) {
  let used = 0, count = 0;
  for (const item of widths) {
    const next = used + (count ? gap : 0) + item;
    if (next > width + 0.5) break;
    used = next; count++;
  }
  return count;
}
export function Home({ snapshot, api, memory, busy, mutate, navigate, rename, removeProject, notify, diagnosis: currentDiagnosis, openOverview, migration }: HomeProps) {
  const root = useRef<HTMLDivElement>(null);
  const recentRow = useRef<HTMLDivElement>(null);
  const [recentCount, setRecentCount] = useState(Infinity);
  // 进入首页始终显示最顶部：不记忆滚动位置，避免项目多时被旧偏移直接拉到页尾。
  const prefs = snapshot.preferences, home = prefs.home;
  const savedOrder = home.statOrder ?? defaultStatOrder();
  const orderKey = savedOrder.join(',');
  const [ordering, setOrdering] = useState<{ base: string; order: OverviewTab[] } | null>(null);
  const order = ordering?.base === orderKey ? ordering.order : savedOrder;
  const [drop, setDrop] = useState<{ key: OverviewTab; after: boolean } | null>(null);
  const dragging = useRef<OverviewTab | null>(null), sorting = useRef(false), suppressClick = useRef(0);
  const saveOrder = async (source: OverviewTab, target: OverviewTab, after: boolean) => {
    if (busy || sorting.current || source === target || !order.includes(source) || !order.includes(target)) return;
    const next = order.filter(key => key !== source);
    next.splice(next.indexOf(target) + Number(after), 0, source);
    if (next.join(',') === order.join(',')) return;
    sorting.current = true; setOrdering({ base: orderKey, order: next });
    try {
      if (!await mutate({ op: 'preferences', patch: { home: { ...home, statOrder: next } } })) setOrdering(null);
    } catch { setOrdering(null); notify('统计卡排序保存失败'); }
    finally { sorting.current = false; }
  };
  const cardProps = (key: OverviewTab): HTMLAttributes<HTMLButtonElement> => ({
    draggable: !busy && !sorting.current,
    title: '拖拽排序，或按 Alt + 方向键移动',
    'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown',
    ...{ 'data-stat-drop': drop?.key === key ? drop.after ? 'after' : 'before' : undefined },
    onClick: () => { if (Date.now() >= suppressClick.current) openOverview?.(key); },
    onDragStart: e => {
      if (busy || sorting.current) { e.preventDefault(); return; }
      dragging.current = key; suppressClick.current = Infinity;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-dsh-stat-card', key);
    },
    onDragOver: e => {
      if (!dragging.current || dragging.current === key || busy || sorting.current) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const bounds = e.currentTarget.getBoundingClientRect();
      const source = e.currentTarget.parentElement?.querySelector(`[data-stat-tab="${dragging.current}"]`)?.getBoundingClientRect();
      setDrop({ key, after: source && Math.abs(source.top - bounds.top) > bounds.height / 2
        ? e.clientY > bounds.top + bounds.height / 2 : e.clientX > bounds.left + bounds.width / 2 });
    },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null); },
    onDrop: e => {
      const source = dragging.current;
      if (!source) return;
      e.preventDefault(); dragging.current = null; setDrop(null); suppressClick.current = Date.now() + 300;
      if (drop?.key === key) void saveOrder(source, key, drop.after);
    },
    onDragEnd: () => { dragging.current = null; setDrop(null); suppressClick.current = Date.now() + 300; },
    onKeyDown: e => {
      if (!e.altKey || e.nativeEvent.isComposing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const visible = order.filter(id => home.statCards[id]), after = ['ArrowRight', 'ArrowDown'].includes(e.key);
      const target = visible[visible.indexOf(key) + (after ? 1 : -1)];
      if (target) void saveOrder(key, target, after);
    },
  });
  const extensions = useExtensionSummaries(api, home.statCards, home.statDays);
  const grid = prefs.view === 'grid', fields = prefs.fields[prefs.view];
  const visibleStatTabs = order.flatMap(key => statTabs.filter(tab => tab.key === key && home.statCards[tab.key]));
  const projects = snapshot.projects.filter(p => prefs.projectFilter === 'favorite' ? p.mark.favorite : prefs.projectFilter === 'archived' ? p.archived : !p.archived)
    .sort((a, b) => Number(b.mark.pinned) - Number(a.mark.pinned) || b.updatedAt - a.updatedAt);
  const { since, allSessions, running, active, pending } = sessionStats(snapshot);
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
  const diagnosis = currentDiagnosis ?? snapshot.diagnostics ?? fallbackDiagnosis(snapshot);
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
  // 条目、顺序、分隔与危险态由 project-menu 统一决定；这里只声明首页有哪些动作。
  const menus = (p: Project) => projectMenuItems(p, {
    favorite: (project, value) => { void mutate({ op: 'mark', projectId: project.projectId, field: 'favorite', value }); },
    openDirectory,
    rename,
    removeProject,
    archive: archiveProject,
    migration: (project, records) => migration?.(project, records),
  });
  const visibleColumns = listFields.filter(field => fields[field.key]);
  const columns = `[project] minmax(220px,1fr) ${visibleColumns.map(field => `[${field.name}] ${field.width}px`).join(' ')} [actions] 28px`;
  const minimum = 220 + 28 + 16 + 12 * (visibleColumns.length + 1) + visibleColumns.reduce((sum, field) => sum + field.width, 0);
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
      <div className="project-footer">{visibleColumns.map(({ key, name }) => <div className="project-list-cell" data-field={name} key={key}>
        <span className="list-field-label">{fieldLabels[key]}</span>{key === 'recent' ? lastSession : key === 'activity' ? p.updatedAt > 0 && <span className="activity">{dateText(p.updatedAt)}</span> : key === 'status' ? status(p) : <span className="list-value">{values[key]}</span>}
      </div>)}</div><Menu label={`${p.title}的更多操作`} disabled={busy} items={menus(p)}/>
    </article>;
  });
  return <main className="wb-home main home-main" ref={root}>
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
    {home.stats && visibleStatTabs.length > 0 && <section className="wb-home-stats home-stats" aria-label="工作台统计"><div className="stats-grid" data-count={visibleStatTabs.length}>
      {visibleStatTabs.map(({ key, label, icon: symbol }) => {
        // 扩展卡与核心卡只差数据来源，外壳（类名、data 属性、标题与无障碍文案）只写一份。
        const extensionKey = key === 'skills' || key === 'mcp' || key === 'rss' ? key : undefined;
        const result = extensionKey ? extensions[extensionKey] : undefined;
        const value = extensionKey ? result?.status === 'ready' ? result.value.count ?? '—' : '—'
          : key === 'running' ? running.length : key === 'recent' ? active.length : key === 'pending' ? pending.length : diagnostics.count;
        const state = extensionKey
          ? result?.status === 'error' ? 'error' : result?.status === 'ready' && (result.value.errors || result.stale) ? 'warning' : undefined
          : key === 'diagnostic' ? diagnostics.state : undefined;
        const rawDetail = extensionKey
          ? result?.status === 'ready' ? result.value.detail : result?.status === 'error' ? result.message : '正在读取…'
          : key === 'running' ? running.length ? `${new Set(running.map(s => s.project.projectId)).size} 个项目` : '暂无运行中'
          : key === 'recent' ? `最近 ${home.statDays} 天`
          : key === 'pending' ? `手动 ${pending.filter(t => t.creator === 'user').length}／Agent ${pending.filter(t => t.creator === 'agent').length}`
          : diagnostics.detail;
        const detail = extensionKey
          ? errorText(rawDetail).replace(/ · (\d+) 个异常$/, (_, count: string) => translate(' · {p0} 个异常', { p0: count }))
          : rawDetail;
        return <button className="wb-stat-card stat-card" type="button" key={key} data-stat-tab={key} data-state={state} aria-haspopup="dialog" {...cardProps(key)} title={detail} aria-label={`${label}，${value}，${detail}`}><span className="recent-icon"><Icon name={state === 'normal' ? 'check-circle' : symbol}/></span>
          <span className="stat-copy"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong></span><span className="stat-arrow"><Icon name="chevron"/></span>
        </button>;
      })}
    </div></section>}
    {home.projects && <div className="home-content single"><section className="project-overview">
      <div className="wb-section-header toolbar project-toolbar"><h2 className="projects-title">项目总览</h2>
        <Tabs label="项目范围" value={prefs.projectFilter} options={[{ value: 'active', label: <>活跃 <small>{snapshot.projects.filter(p => !p.archived).length}</small></> }, { value: 'archived', label: <>归档 <small>{snapshot.projects.filter(p => p.archived).length}</small></> }, { value: 'favorite', label: <>收藏 <small>{snapshot.projects.filter(p => p.mark.favorite).length}</small></> }]} disabled={busy} onChange={projectFilter => void mutate({ op: 'preferences', patch: { projectFilter } })}/>
        <div className="wb-view-switch view-switch">
          <Menu icon="fields" label={`${grid ? '宫格' : '列表'}字段显示`} heading={`${grid ? '宫格' : '列表'}显示字段`} note={grid ? undefined : translate('目录随项目名称展示。')} disabled={busy}
            items={Object.entries(fieldLabels).map(([key,label]) => ({ label, checked: fields[key as keyof typeof fields], action: () => void mutate({ op: 'preferences', patch: { fields: { ...prefs.fields, [prefs.view]: { ...fields, [key]: !fields[key as keyof typeof fields] } } } }) }))}/>
          <IconButton name="list" label="列表视图" active={!grid} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { view: 'list' } })}/>
          <IconButton name="grid" label="宫格视图" active={grid} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { view: 'grid' } })}/>
        </div>
      </div>
      {projects.length ? grid ? <div className="wb-project-grid project-grid">{renderProjects()}</div> : <div className="wb-project-table project-table" tabIndex={0} role="region" aria-label="项目列表">
        <div className="project-table-body" style={{ '--project-columns': columns, '--project-min-width': `${minimum}px` } as CSSProperties}>
          <div className="wb-table-head list-head"><span>项目名称</span>{visibleColumns.map(({ key }) => <span key={key}>{fieldLabels[key]}</span>)}<span className="sr-only">操作</span></div><div className="project-list">{renderProjects()}</div>
        </div>
      </div> : <div className="wb-empty empty"><Icon name={prefs.projectFilter === 'favorite' ? 'star' : 'folder'}/><h3>{prefs.projectFilter === 'favorite' ? '暂无收藏项目' : prefs.projectFilter === 'archived' ? '暂无归档项目' : '这里还没有活跃项目'}</h3><p>{prefs.projectFilter === 'archived' ? '在项目菜单中选择「归档项目」后显示在这里，业务只读。' : '打开已有目录，或通过顶部添加新项目。'}</p></div>}
    </section></div>}
    {!home.quick && !home.recent && !home.stats && !home.projects && <p className="home-hidden">首页模块已隐藏，可通过右上角「工作台设置」恢复显示，或使用 Header 搜索打开项目和会话。</p>}
  </main>;
}

/** 统计概览里会被待办子弹窗重建的滚动容器。 */
const STATS_SCROLLERS = '.settings-content,.settings-panel,.stats-group-results,.stats-group-items,.stats-project-groups';
/** 核心概览内容复用统一外层，待办详情保留列表恢复行为。 */
export function StatsOverview({ stat, snapshot, api, busy, refresh, navigate, diagnosis, onReport, navigation, onClose, embedded, onModalState, notify }: {
  stat: CoreOverviewTab; snapshot: Snapshot; api: ClientPort; busy: boolean; refresh(): Promise<void>;
  navigate(projectId: string): void; diagnosis: Diagnosis; onReport(report: Diagnosis): void;
  navigation?: ReactNode; onClose(): void; embedded?: boolean; onModalState?(state: ModalState): void;
  notify?: Notify;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [statTodo, setStatTodo] = useState<{ project: Project; todo: Todo } | null>(null);
  const statReturn = useRef<{ focus: HTMLElement | null; scroll: ScrollPosition[] } | null>(null);
  useLayoutEffect(() => {
    if (statTodo || !statReturn.current) return;
    const origin = statReturn.current;
    statReturn.current = null;
    // 子弹窗的布局效果已恢复模态范围，在本次绘制前恢复原列表。
    restoreScrollPositions(origin.scroll);
    const fallback = root.current?.closest('.wb')?.querySelector<HTMLElement>('.stats-drawer .stats-group-results');
    restoreFocus(origin.focus, fallback);
  }, [statTodo]);
  const home = snapshot.preferences.home;
  // 与首页共用同一份统计口径（见 sessionStats）。
  const { running, active, pending } = sessionStats(snapshot);
  const openTodo = (t: typeof pending[number]) => {
    const dialog = root.current?.closest('.wb')?.querySelector<HTMLElement>('.stats-drawer');
    const focus = [...(dialog?.querySelectorAll<HTMLElement>('[data-stat-entry]') ?? [])].find(node => node.dataset.statEntry === t.id) ?? null;
    statReturn.current = {
      focus, scroll: dialog ? captureScrollPositions([dialog, ...dialog.querySelectorAll<HTMLElement>(STATS_SCROLLERS)]) : [],
    };
    setStatTodo({ project: t.project, todo: t });
  };
  return <>
    <Modal title="工作台概览" drawer className="stats-drawer" suspended={!!statTodo} onClose={onClose} embedded={embedded} onModalState={onModalState}><div ref={root} className="settings-layout">{navigation}
      <div className="settings-content"><section className="settings-panel">{stat !== 'diagnostic' && <>
        <h3 className="stats-page-heading">{stat === 'running' ? '运行中' : stat === 'recent' ? '近期会话' : '项目待办'}</h3>
        <p className="dialog-description stats-page-description">{stat === 'running' ? '当前正在运行的会话。'
          : stat === 'recent' ? `最近 ${home.statDays} 天更新的未归档会话。` : '尚未完成的待办，含手动创建与 Agent 创建。'}</p>
        </>}
        {stat === 'diagnostic' ? <DiagnosticsPanel report={diagnosis} api={api} busy={busy} notify={notify}
          onReport={onReport}
          openProject={id => { navigate(id); onClose(); }}/> : <StatsProjectPanel key={stat}
          empty="暂无符合条件的记录"
          entries={(stat === 'running' ? running : stat === 'recent' ? active : []).map(s => ({
            id: s.sessionId, title: s.title, detail: dateText(s.updatedAt), project: s.project,
            open: () => api.openSession(s.sessionId),
          })).concat(stat === 'pending' ? pending.map(t => ({
            id: t.id, title: t.title, detail: dateText(t.updatedAt), project: t.project, open: () => openTodo(t),
          })) : []) satisfies StatEntry[]}/>}
      </section></div></div>
    </Modal>
    {statTodo && <TodoDetail key={statTodo.todo.id} api={api}
      project={snapshot.projects.find(p => p.projectId === statTodo.project.projectId) ?? { ...statTodo.project, archived: true, todos: [] }}
      initial={statTodo.todo} refresh={refresh} closeOnSave onClose={() => setStatTodo(null)}/>}
  </>;
}
