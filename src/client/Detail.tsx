import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Command } from '../shared/commands.js';
import { defaultDetail, emptyMark, type HostSession, type Project, type Snapshot, type Todo } from '../shared/model.js';
import type { ClientPort, UiMemory } from './api.js';
import { dateText, folderName, Icon, IconButton, Menu, Picker, Tabs } from './ui.js';
import { priorityLabels, todoAttachments, type Priority } from '../shared/todo.js';
import { TodoToolbar } from './TodoToolbar.js';

export interface DetailProps {
  project: Project; snapshot: Snapshot; api: ClientPort; memory: UiMemory; busy: boolean;
  mutate(command: Command): Promise<boolean>; run(action: () => Promise<void>, successNotice?: string): Promise<boolean>;
  navigate(projectId: string | null): void; rename(project: Project): void;
  edit(todo: Todo): void; remove(todo: Todo): void;
  createTodo?(): void;
  archive(session: HostSession): void; renameSession(session: HostSession): void;
  deleteSession?(session: HostSession): void;
  removeProject(project: Project): void; notify(message: string): void;
  showSession(session: HostSession): void;
}
export function Detail({ project: p, snapshot, api, memory, busy, mutate, run, navigate, rename, edit, remove, createTodo, archive, renameSession, deleteSession, removeProject, notify, showSession }: DetailProps) {
  const saved = memory.detail(p.projectId);
  const [draft, setDraft] = useState(saved.draft);
  const [todoQuery, setTodoQuery] = useState('');
  const [todoPriority, setTodoPriority] = useState<Priority | 'all'>('all');
  const [tab, setTab] = useState(saved.tab);
  const [ratioPreview, setRatioPreview] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ todo: Todo; previousDone: boolean } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [undo]);
  const prefs = snapshot.preferences.detail[p.projectId] ?? defaultDetail();
  const ratio = ratioPreview ?? prefs.ratio;
  const sessionList = useRef<HTMLDivElement>(null);
  const pendingList = useRef<HTMLDivElement>(null);
  const doneList = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState(memory.targetTodo);
  const setPrefs = (patch: Partial<typeof prefs>) => mutate({ op: 'preferences', patch: { detail: { [p.projectId]: { ...prefs, ...patch } } } });
  useLayoutEffect(() => {
    if (sessionList.current) sessionList.current.scrollTop = saved.sessions;
    if (pendingList.current) pendingList.current.scrollTop = saved.pending;
    if (doneList.current) doneList.current.scrollTop = saved.done;
  }, []);
  useLayoutEffect(() => {
    const id = memory.targetTodo;
    if (!id || !p.todos.some(t => t.id === id)) return;
    setTarget(id); setTab('todos'); saved.tab = 'todos';
    const timer = setTimeout(() => {
      document.getElementById(`wb-todo-${id}`)?.scrollIntoView({ block: 'center' });
      document.getElementById(`wb-todo-${id}`)?.querySelector<HTMLButtonElement>('.wb-todo-title')?.focus();
      memory.targetTodo = undefined;
    }, 220);
    return () => clearTimeout(timer);
  }, [snapshot.revision, prefs.group, p.projectId]);
  const sessions = p.sessions.filter(s => {
    const mark = snapshot.sessionMarks[s.sessionId] ?? emptyMark();
    return prefs.sessionFilter === 'favorite' ? mark.favorite : s.archived === (prefs.sessionFilter === 'archived');
  }).sort((a,b) => Number((snapshot.sessionMarks[b.sessionId] ?? emptyMark()).pinned) - Number((snapshot.sessionMarks[a.sessionId] ?? emptyMark()).pinned) || b.updatedAt - a.updatedAt);
  const toggle = async (todo: Todo) => {
    const siblings = p.todos.filter(t => t.done === todo.done);
    const index = siblings.findIndex(t => t.id === todo.id);
    const next = siblings[index + 1] ?? siblings[index - 1];
    if (await mutate({ op: 'update', projectId: p.projectId, id: todo.id, expectedVersion: todo.version, done: !todo.done })) {
      setUndo({ todo: { ...todo, version: todo.version + 1 }, previousDone: todo.done });
      setTarget(undefined);
      requestAnimationFrame(() => {
        const focus = next ? document.getElementById(`wb-todo-${next.id}`)?.querySelector<HTMLButtonElement>('.wb-complete') : input.current;
        focus?.focus();
      });
    }
  };
  const matchesTodo = (t: Todo) => (todoPriority === 'all' || t.priority === todoPriority)
    && `${t.title}\n${t.note}`.toLocaleLowerCase().includes(todoQuery.trim().toLocaleLowerCase());
  const filteringTodos = !!todoQuery.trim() || todoPriority !== 'all';
  const todoRows = (done: boolean) => {
    const order = { high: 0, medium: 1, low: 2 };
    const todos = p.todos.filter(t => t.done === done && matchesTodo(t))
      .sort((a,b) => done ? (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)
        : (a.priority ? order[a.priority] : 3) - (b.priority ? order[b.priority] : 3) || b.updatedAt - a.updatedAt);
    return todos.length ? todos.map(t => <article key={t.id} id={`wb-todo-${t.id}`} className={`wb-todo-row todo-row ${t.done ? 'completed' : ''} ${target === t.id ? 'wb-target' : ''}`}>
      <button className={`wb-complete todo-complete ${t.done ? 'wb-completed' : ''}`} type="button" disabled={busy || p.archived} aria-label={t.done ? `重新打开：${t.title}` : `完成：${t.title}`} onClick={() => void toggle(t)}>
        <span className="completion-circle"><Icon name="check"/></span>
      </button>
      <div className="wb-todo-body todo-copy">
        <button type="button" className="wb-todo-title todo-title wb-ellipsis" disabled={busy} title={p.archived ? `${t.title}（项目已归档，仅可查看）` : t.title} onClick={() => edit(t)}>{t.title}</button>
        <div className="todo-meta-line">{t.priority && <span className={`todo-priority ${t.priority}`}>{priorityLabels[t.priority]}优先级</span>}
          <div className="todo-meta">{t.creator === 'agent' ? 'Agent' : '用户'} 创建 · {dateText(t.updatedAt)}</div>
          {todoAttachments(t).length > 0 && <span className="todo-attachment-count"><Icon name="paperclip" size={12}/>{todoAttachments(t).length} 个附件</span>}</div>
      </div>
      {!p.archived && <IconButton name="trash" label={`删除待办：${t.title}`} className="more todo-delete" disabled={busy} onClick={() => remove(t)}/>}
    </article>) : <div className="wb-empty empty">{filteringTodos ? '没有符合条件的待办。' : done ? '暂无已完成待办。' : '暂无待办，记录下一步或在对话中让 Agent 创建。'}</div>;
  };
  return <main className="wb-detail main detail-main">
    <div className="detail-project-header">
    <div className="wb-detail-heading detail-project-line"><nav className="breadcrumb" aria-label="项目导航"><button type="button" className="flat" onClick={() => navigate(null)}>主页</button><span className="breadcrumb-divider"><Icon name="chevron"/></span><span className="detail-project-symbol"><Icon name="folder"/></span>
      <button type="button" className="wb-project-title detail-project-name" title={p.archived ? `${p.title} · 已归档` : `${p.title} · 点击重命名`} onClick={p.archived ? undefined : () => rename(p)}><span>{p.title}</span>{!p.archived && <Icon name="pencil"/>}</button></nav>
      <div className="heading-actions">
      <Menu label="项目更多操作" disabled={busy} items={p.archived ? [
        { label: p.mark.favorite ? '取消收藏' : '收藏项目', action: () => void mutate({ op: 'mark', projectId: p.projectId, field: 'favorite', value: !p.mark.favorite }) },
        { label: '打开目录', action: () => { void api.revealDirectory(p.projectId).then(ok => { if (!ok) notify('暂时无法打开目录，请复制路径后手动打开'); }); } },
        { label: '复制路径', action: () => void run(() => navigator.clipboard.writeText(p.path), '完整路径已复制') },
        { label: '恢复项目', action: () => void mutate({ op: 'archive-project', projectId: p.projectId, archived: false }) },
      ] : [
        { label: '重命名', action: () => rename(p) },
        { label: p.mark.favorite ? '取消收藏' : '收藏项目', action: () => void mutate({ op: 'mark', projectId: p.projectId, field: 'favorite', value: !p.mark.favorite }) },
        { label: '打开目录', action: () => { void api.revealDirectory(p.projectId).then(ok => { if (!ok) notify('暂时无法打开目录，请复制路径后手动打开'); }); } },
        { label: '复制路径', action: () => void run(() => navigator.clipboard.writeText(p.path), '完整路径已复制') },
        { label: '项目迁移', separatorBefore: true, action: () => notify('暂不支持项目迁移，原目录与历史会话已保留') },
        { label: '迁移记录', action: () => notify('暂无迁移记录，宿主尚未提供迁移能力') },
        { label: '归档项目', action: () => void mutate({ op: 'archive-project', projectId: p.projectId, archived: true }) },
        { label: '移除项目', action: () => removeProject(p), danger: true },
      ]}/></div>
    </div>
    <div className="wb-detail-context detail-project-info"><div className="detail-project-context">
      <div className="theme-select-project-switch"><Picker variant="project-switch" label={`切换项目，当前 ${p.title}，目录 ${p.path}`} value={p.projectId} onChange={navigate} disabled={busy} title={p.path}
        renderValue={() => <span className="directory-name"><Icon name="path-dots" size={14}/><span className="directory-label">{folderName(p.path)}</span></span>}
        renderDescription={path => <span className="directory-name"><Icon name="path-dots" size={14}/><span className="directory-label">{folderName(path)}</span></span>}
        options={snapshot.projects.map(p => ({ value: p.projectId, label: p.title, description: p.path }))}/></div>
      {p.updatedAt > 0 && <div className="detail-meta"><span title={`最近活动 · ${dateText(p.updatedAt)}`}>最近活动 · {dateText(p.updatedAt)}</span></div>}</div>
      <div className="wb-view-switch todo-view-switch">
        <IconButton name="list" label="两栏使用列表布局" active={snapshot.preferences.layout === 'list'} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { layout: 'list' } })}/>
        <IconButton name="grid" label="两栏使用整体卡片布局" active={snapshot.preferences.layout === 'cards'} disabled={busy} onClick={() => void mutate({ op: 'preferences', patch: { layout: 'cards' } })}/>
      </div>
    </div></div>
    {p.archived && <div className="wb-feedback banner readonly" role="status"><Icon name="alert"/><span className="banner-body">项目已归档：业务只读，恢复后可继续编辑。会话保持归档时的状态，不能单独归档、重命名或新建。</span></div>}
    {!p.available && <p className="wb-warning">目录不可用：{p.path}。历史会话和待办仍可访问；请恢复原目录后使用顶部刷新重新检查。当前宿主尚不支持修改绑定目录。</p>}
    <div className="wb-mobile-tabs detail-panel-tabs"><Tabs label="项目内容" value={tab} options={[{ value: 'sessions', label: <>会话 <small>{p.sessions.length}</small></> }, { value: 'todos', label: <>待办 <small>{p.todos.filter(t => !t.done).length}</small></> }]} onChange={tab => { setTab(tab); saved.tab = tab; }}/></div>
    <div className="wb-detail-panels detail-content" data-layout={snapshot.preferences.layout} data-tab={tab} ref={panels} style={{ gridTemplateColumns: `minmax(280px,${ratio}fr) 24px minmax(240px,${100-ratio}fr)` }}>
      <section className="wb-panel wb-session-panel sessions" data-layout={snapshot.preferences.layout} aria-label="会话">
        <div className="wb-panel-header section-title"><h2>会话</h2><span className="number">{p.sessions.length}</span></div>
        <div className="wb-panel-toolbar session-tools"><Tabs label="会话范围" value={prefs.sessionFilter} options={[{ value: 'active', label: '活跃' }, { value: 'archived', label: '归档' }, { value: 'favorite', label: '收藏' }]} disabled={busy} onChange={sessionFilter => void setPrefs({ sessionFilter })}/>
          <button type="button" className="wb-new new-session" disabled={busy || !p.available || p.archived} onClick={() => void run(() => api.newSession(p.workspaceId), '')}><Icon name="plus"/>新建会话</button></div>
        <div className="wb-session-results detail-scroll" ref={sessionList} onScroll={e => { saved.sessions = e.currentTarget.scrollTop; }}>
          {sessions.map(s => {
            const mark = snapshot.sessionMarks[s.sessionId] ?? emptyMark();
            return <article className="wb-session-row session-row" key={s.sessionId}>
              <div className="session-symbol"><Icon name="message-circle"/></div>
              <div className="session-body"><div className="wb-session-name entity-title"><button type="button" className="wb-session-title session-title wb-ellipsis" title={p.archived ? `${s.title} · 已归档，跳转已禁用` : s.title} disabled={p.archived} onClick={p.archived ? undefined : () => api.openSession(s.sessionId)}>{s.title}</button>
                <span className="entity-marks"><IconButton name="pin" className="wb-pin entity-mark-button" label={mark.pinned ? '取消置顶会话' : '置顶会话'} active={mark.pinned} disabled={busy} onClick={() => void mutate({ op: 'mark', projectId: p.projectId, sessionId: s.sessionId, field: 'pinned', value: !mark.pinned })}/></span>
              </div><div className="session-meta">{s.running && <span className="status running"><i className="status-dot"/>运行中</span>}{s.archived && <span>已归档</span>}<span>{dateText(s.updatedAt)}</span></div></div>
              <Menu label={`会话更多操作：${s.title}`} disabled={busy} items={p.archived ? [
                { label: '会话预览', action: () => showSession(s) },
              ] : [
                { label: '重命名', action: () => renameSession(s) },
                { label: mark.favorite ? '取消收藏' : '收藏会话', action: () => void mutate({ op: 'mark', projectId: p.projectId, sessionId: s.sessionId, field: 'favorite', value: !mark.favorite }) },
                { label: '会话预览', action: () => showSession(s) },
                { label: s.archived ? '恢复会话' : '归档会话', action: () => { if (s.archived) void run(() => api.archiveSession(s.sessionId, false), '会话已恢复'); else if (!s.running) archive(s); } },
                { label: '永久删除会话', action: () => { if (s.running) notify('请先停止运行中的会话，再永久删除'); else deleteSession?.(s); }, danger: true },
              ].filter(item => !(s.running && item.label === '归档会话'))}/>
            </article>;
          })}
          {!sessions.length && <div className="wb-empty empty"><Icon name="message-circle"/><h3>{prefs.sessionFilter === 'favorite' ? '暂无收藏会话' : '暂无会话'}</h3><p>使用上方「新建会话」开始推进项目。</p></div>}
        </div>
      </section>
      <div className="wb-splitter detail-splitter" role="separator" aria-label="调整会话和待办比例" aria-orientation="vertical" aria-valuemin={40} aria-valuemax={70} aria-valuenow={ratio} tabIndex={0}
        onKeyDown={e => { if (busy) return; if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); void setPrefs({ ratio: e.key === 'Home' ? 65 : e.key === 'End' ? 70 : Math.max(40, Math.min(70, prefs.ratio + (e.key === 'ArrowRight' ? 2 : -2))) }); } }}
        onPointerDown={e => { if (busy) return; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = panels.current!.getBoundingClientRect(); setRatioPreview(Math.max(40, Math.min(70, (e.clientX - rect.left) / rect.width * 100))); }}
        onPointerUp={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.currentTarget.releasePointerCapture(e.pointerId); void setPrefs({ ratio }).finally(() => setRatioPreview(null)); }}
        onPointerCancel={() => setRatioPreview(null)}><span/></div>
      <section className="wb-panel wb-todo-panel todos" data-layout={snapshot.preferences.layout} aria-label="待办">
        <div className="wb-panel-header section-title todos-heading"><h2>待办</h2><span className="number">{p.todos.filter(t => !t.done).length}</span><div className="todo-heading-actions">{undo && <button type="button" className="todo-undo-entry" disabled={busy} onClick={() => void mutate({ op: 'update', projectId: p.projectId, id: undo.todo.id, expectedVersion: undo.todo.version, done: undo.previousDone }).then(ok => { if (ok) setUndo(null); })}>撤销</button>}
          <details className="agent-permission"><summary aria-label="查看当前项目 Agent 权限"><Icon name="bot"/><span>Agent 权限{!snapshot.preferences.agentManageTodos || !p.agentCanChangeStatus ? ' · 受限' : ''}</span><span className="permission-chevron"><Icon name="down"/></span></summary><div className="agent-info"><strong>{snapshot.preferences.agentManageTodos ? '允许管理待办' : '仅允许查询待办'}</strong><p>{snapshot.preferences.agentManageTodos ? `Agent 可在当前项目创建、查询、编辑和删除待办${p.agentCanChangeStatus ? '，并修改完成状态' : '；旧项目状态修改权限仍关闭，保存全局配置后统一生效'}。` : 'Agent 仅可查询当前项目待办，不能创建、编辑、删除或修改完成状态。'}权限在「工作台设置 → 项目配置 → 全局配置」中统一调整。</p></div></details>
        </div></div>
        <TodoToolbar draft={draft} query={todoQuery} priority={todoPriority} busy={busy} archived={p.archived} inputRef={input}
          onDraftChange={value => { setDraft(value); saved.draft = value; }} onQueryChange={setTodoQuery} onPriorityChange={setTodoPriority}
          onCreate={title => mutate({ op: 'create', projectId: p.projectId, title })} onFullCreate={createTodo}/>
        <div id="todo-results" className="wb-todo-groups" data-layout={snapshot.preferences.layout} data-group={prefs.group}>
          <button type="button" className="wb-group todo-group-toggle" aria-expanded={prefs.group === 'pending'} aria-controls="wb-pending" disabled={busy} onClick={() => void setPrefs({ group: prefs.group === 'pending' ? 'done' : 'pending' })}><span className="todo-group-chevron"><Icon name="chevron"/></span>待处理 · {p.todos.filter(t => !t.done && matchesTodo(t)).length}</button>
          <div id="wb-pending" className="wb-group-container todo-group-panel" aria-hidden={prefs.group !== 'pending'} {...(prefs.group !== 'pending' ? { inert: '' } : {})}><div className="wb-group-scroll todo-group-scroll" ref={pendingList} onScroll={e => { saved.pending = e.currentTarget.scrollTop; }}>{todoRows(false)}</div></div>
          <button type="button" className="wb-group todo-group-toggle completed-toggle" aria-expanded={prefs.group === 'done'} aria-controls="wb-done" disabled={busy} onClick={() => void setPrefs({ group: prefs.group === 'done' ? 'pending' : 'done' })}><span className="todo-group-chevron"><Icon name="chevron"/></span>已完成 · {p.todos.filter(t => t.done && matchesTodo(t)).length}</button>
          <div id="wb-done" className="wb-group-container todo-group-panel" aria-hidden={prefs.group !== 'done'} {...(prefs.group !== 'done' ? { inert: '' } : {})}><div className="wb-group-scroll todo-group-scroll" ref={doneList} onScroll={e => { saved.done = e.currentTarget.scrollTop; }}>{todoRows(true)}</div></div>
        </div>
      </section>
    </div>
  </main>;
}
