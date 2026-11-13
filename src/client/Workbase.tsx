import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { Command } from '../shared/commands.js';
import type { HostSession, Preferences, Project, SessionPreview, Snapshot, Todo } from '../shared/model.js';
import { readSnapshot, type ClientPort, type UiMemory } from './api.js';
import { themeStyle } from './theme.js';
import { Home } from './Home.js';
import { Detail } from './Detail.js';
import { Search } from './Search.js';
import { Settings } from './Settings.js';
import { dateText, Icon, IconButton, Modal, preventImeSubmit } from './ui.js';
import { DirectoryInput } from './DirectoryInput.js';
import { Brand } from './Brand.js';
import { TodoDetail } from './TodoDetail.js';

type DialogState = { kind: 'rename'; project: Project }
  | { kind: 'archive'; session: HostSession } | { kind: 'rename-session'; session: HostSession; projectId: string }
  | { kind: 'delete-session'; session: HostSession; projectId: string }
  | { kind: 'remove-project'; project: Project } | { kind: 'read-session'; project: Project; session: HostSession } | { kind: 'settings' } | { kind: 'add' };
function savedMessage(command: Command): string {
  switch (command.op) {
    case 'preferences': return '';
    case 'settings': return '设置已保存';
    case 'create': return '待办已添加';
    case 'update': return command.done === true ? '待办已完成' : command.done === false ? '待办已重新打开' : '待办已更新';
    case 'delete': return '待办已删除';
    case 'restore-deleted-todo': return '待办已恢复';
    case 'rename': return '项目名称已更新';
    case 'rename-session': return '会话名称已更新';
    case 'delete-session': return '会话已永久删除';
    case 'remove-project': return '项目已移除，本地目录与历史数据已保留';
    case 'archive-project': return command.archived ? '项目已归档，恢复后可继续编辑' : '项目已恢复';
    case 'permission': return '项目权限已更新';
    case 'binding': return command.choice === 'restore' ? '原项目已恢复' : '新项目已添加';
    case 'mark': return command.field === 'favorite' ? (command.value ? '已收藏' : '已取消收藏') : (command.value ? '已置顶' : '已取消置顶');
    default: return '操作已完成';
  }
}
const noUpdates = () => false;
const subscribeNoUpdates = () => () => {};
export function Workbase({ api, memory }: { api: ClientPort; memory: UiMemory }) {
  const pluginUpdateBusy = useSyncExternalStore(
    api.pluginUpdateBusy?.subscribe ?? subscribeNoUpdates,
    api.pluginUpdateBusy?.getSnapshot ?? noUpdates,
    noUpdates,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogErrorId = useId();
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'info'; undo?: { projectId: string; token: string; expiresAt: number } } | null>(null);
  const notify = useCallback((message: string, tone: 'success' | 'info' = 'info') => setNotice({ message, tone }), []);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [todoDialog, setTodoDialog] = useState<{ projectId: string; todo?: Todo } | null>(null);
  const [themePreview, setThemePreview] = useState<Preferences['theme'] | null>(null);
  // 暗色属性读取做了兜底：服务端渲染没有 document，客户端挂载后由订阅同步。
  const [dark, setDark] = useState(() => {
    try { return document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme'); }
    catch { return false; }
  });
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const working = useRef(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const view = await readSnapshot(api, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setSnapshot(previous => !previous || view.revision >= previous.revision ? view : previous);
      setError('');
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setError(error instanceof Error ? error.message : '读取失败');
      throw error;
    }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void load().catch(() => {});
    const refresh = () => { if (!working.current && document.visibilityState !== 'hidden') void load().catch(() => {}); };
    const unsubscribe = api.subscribe(refresh);
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    const observer = new MutationObserver(() => setDark(document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme')));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    return () => { mounted.current = false; request.current?.abort(); unsubscribe(); clearInterval(interval); window.removeEventListener('focus', refresh); observer.disconnect(); };
  }, [api, load]);
  useEffect(() => {
    if (snapshot) memory.theme = snapshot.preferences.theme;
  }, [snapshot, memory]);
  useEffect(() => {
    if (!notice) return;
    const duration = notice.undo ? Math.max(0, notice.undo.expiresAt - Date.now())
      : notice.tone === 'success' ? 3500 : Math.min(10000, Math.max(5000, notice.message.length * 120));
    const timer = setTimeout(() => setNotice(null), duration);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = async (action: () => Promise<unknown>, successNotice = '操作已完成'): Promise<boolean> => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    let committed = false;
    try {
      const result = await action();
      if (result === false) {
        if (mounted.current) { await load(); notify('项目已存在，原有数据已保留'); }
        return true;
      }
      committed = true;
      if (mounted.current) { await load(); if (successNotice) notify(successNotice, 'success'); }
      return true;
    } catch (error) {
      if (mounted.current) setError(`${committed ? '操作已完成，但刷新失败：' : ''}${error instanceof Error ? error.message : '操作失败'}`);
      return committed;
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const mutate = (command: Command) => run(() => api.call(command), savedMessage(command));
  const removeTodo = async (todo: Todo) => {
    let result: { undoToken: string; undoExpiresAt: number } | undefined;
    const ok = await run(async () => {
      result = await api.call({ op: 'delete', projectId: todo.projectId, id: todo.id, expectedVersion: todo.version }) as typeof result;
    }, '');
    if (ok && mounted.current && result) {
      setNotice({ message: '待办已删除', tone: 'success', undo: { projectId: todo.projectId, token: result.undoToken, expiresAt: result.undoExpiresAt } });
      requestAnimationFrame(() => document.getElementById('todo-title')?.focus());
    }
  };
  const navigate = (projectId: string | null) => { void mutate({ op: 'preferences', patch: { selectedProject: projectId } }); };
  const selected = snapshot?.projects.find(p => p.projectId === snapshot.preferences.selectedProject);
  const close = () => { setDialog(null); setThemePreview(null); };
  // 只缓存服务端确认的主题，不缓存设置预览或明暗状态。
  const chosenTheme = themePreview ?? snapshot?.preferences.theme ?? memory.theme ?? 'follow';
  const lastActivity = Math.max(0, ...snapshot?.projects.map(p => p.updatedAt) ?? []);
  return <div className={`wb ${chosenTheme === 'warm' ? 'c' : 'a'} ${chosenTheme} ${dark ? 'dark' : 'light'}`} data-style={chosenTheme === 'follow' ? 'dsh' : chosenTheme} data-theme={chosenTheme} data-dark={dark} style={themeStyle(chosenTheme, dark)}>
    <header className="wb-header app-header" style={!snapshot && !memory.theme ? { visibility: 'hidden' } : undefined}>
      <Brand/>
      <Search snapshot={snapshot} api={api} memory={memory} mutate={mutate} notify={notify}/>
      {snapshot && <button type="button" className="wb-sync sync flat" disabled={busy} title={`最近同步 ${dateText(snapshot.syncedAt)} · 点击刷新`} onClick={() => { if (!busy) void load().catch(() => {}); }}><i className="sync-dot"/><span>{error ? '同步中断' : '已同步'}</span>{lastActivity > 0 && <span className="header-activity">最近活动 · {dateText(lastActivity)}</span>}</button>}
      <div className="header-actions"><button type="button" className="header-add" aria-label="添加项目" title="添加项目" disabled={busy || !snapshot} onClick={() => setDialog({ kind: 'add' })}><Icon name="plus"/><span className="action-label">添加项目</span></button>
      <IconButton name="settings" label="工作台设置" disabled={!snapshot || busy} onClick={() => setDialog({ kind: 'settings' })}/>
      </div>
    </header>
    {error && <div className="wb-feedback wb-error banner" role="alert"><Icon name="alert"/><span className="banner-body">{error}{snapshot ? ` · 数据可能不是最新 · 上次同步 ${dateText(snapshot.syncedAt)}` : ''}</span><button type="button" onClick={() => void load().catch(() => {})} disabled={busy}>重试</button><IconButton name="close" label="关闭错误提示" onClick={() => setError('')}/></div>}
    {notice && <div className="wb-toast toast" data-tone={notice.tone} role="status" aria-live="polite" aria-atomic="true"><Icon name={notice.tone === 'success' ? 'check' : 'info'}/><span className="toast-message">{notice.message}</span>{notice.undo && <button type="button" disabled={busy} onClick={() => { if (notice.undo) void mutate({ op: 'restore-deleted-todo', projectId: notice.undo.projectId, token: notice.undo.token }); }}>撤销</button>}<button type="button" className="toast-dismiss" aria-label="关闭提示" title="关闭提示" onClick={() => setNotice(null)}><Icon name="close" size={14}/></button></div>}
    {busy && <span className="wb-saving" role="status">保存中…</span>}
    {!snapshot && (error ? <div className="wb-empty" aria-busy={!error}>{error ? '暂时无法读取项目，请重试。' : '正在读取 Harness 项目…'}</div> : <div className="wb-skeleton" role="status" aria-label="正在读取项目"><span className="sr-only">正在读取 Harness 项目…</span>
      <i className="s-composer"/>
      <div className="s-row"><i/><i/><i/><i/></div>
      <div className="s-row s-projects"><i/><i/><i/></div>
    </div>)}
    {snapshot?.conflicts.map(conflict => <div className="wb-binding" key={conflict.workspaceId}><p>「{conflict.title}」目录重新注册，需确认项目身份：<span>{conflict.path}</span></p>
      <button type="button" disabled={busy} onClick={() => void mutate({ op: 'binding', projectId: conflict.projectId, workspaceId: conflict.workspaceId, choice: 'restore' })}>恢复原项目</button>
      <button type="button" disabled={busy} onClick={() => void mutate({ op: 'binding', projectId: conflict.projectId, workspaceId: conflict.workspaceId, choice: 'new' })}>作为新项目</button>
    </div>)}
    {snapshot && (selected ?
      <Detail key={selected.projectId} project={selected} snapshot={snapshot} api={api} memory={memory} busy={busy} mutate={mutate}
        run={run} navigate={navigate} rename={project => setDialog({ kind: 'rename', project })}
        edit={todo => setTodoDialog({ projectId: todo.projectId, todo })} remove={todo => { void removeTodo(todo); }}
        createTodo={() => setTodoDialog({ projectId: selected.projectId })}
        archive={session => setDialog({ kind: 'archive', session })}
        renameSession={session => setDialog({ kind: 'rename-session', session, projectId: selected.projectId })}
        deleteSession={session => setDialog({ kind: 'delete-session', session, projectId: selected.projectId })}
        removeProject={project => setDialog({ kind: 'remove-project', project })} notify={notify}
        showSession={session => setDialog({kind:'read-session',project:selected,session})}/>
      : <Home snapshot={snapshot} api={api} memory={memory} busy={busy} mutate={mutate} navigate={navigate} refresh={load}
          rename={project => setDialog({ kind: 'rename', project })} removeProject={project => setDialog({ kind: 'remove-project', project })} notify={notify}/>)}
    {todoDialog && snapshot && (() => {
      const project = snapshot.projects.find(p => p.projectId === todoDialog.projectId);
      return project ? <TodoDetail key={todoDialog.todo?.id ?? `new-${project.projectId}`} api={api} project={project}
        initial={todoDialog.todo} refresh={load} onClose={() => setTodoDialog(null)}/> : null;
    })()}
    {dialog && snapshot && (dialog.kind === 'read-session' ?
      <SessionPreviewDialog api={api} project={dialog.project} session={dialog.session} onClose={close}/>
      : <Modal drawer={dialog.kind === 'settings'} title={dialog.kind === 'delete-session' ? '永久删除会话？' : dialog.kind === 'add' ? '添加项目' : dialog.kind === 'settings' ? '工作台设置' : dialog.kind === 'remove-project' ? '移除项目？' : dialog.kind === 'rename-session' ? '重命名会话' : dialog.kind === 'rename' ? '重命名项目' : '归档会话'} busy={busy} onClose={close}>
      {error && <p id={dialogErrorId} className="wb-warning" role="alert">{error}</p>}
      {dialog.kind === 'add' ? <AddProject api={api} root={snapshot.preferences.root} busy={busy} save={(path, name) => run(async () => {
        const result = await api.call({ op: 'add-project', path, ...(name ? { name } : {}) }) as { duplicate: boolean };
        return !result.duplicate;
      }, '项目已添加')} onClose={close} describedBy={error ? dialogErrorId : undefined}/>
        : dialog.kind === 'settings' ? <Settings snapshot={snapshot} busy={busy} pluginUpdateBusy={pluginUpdateBusy} preview={setThemePreview} save={mutate} call={api.call} onClose={close} dark={dark} pickDirectory={api.pickDirectory}
          describedBy={error ? dialogErrorId : undefined} onRestored={() => { close(); void load().catch(() => {}); notify('工作台状态已恢复，原数据已保留回滚副本', 'success'); }}/>
        : dialog.kind === 'delete-session' ? <><p className="dialog-description">永久删除「{dialog.session.title}」及其子 Agent 会话、转录与附件缓存。此操作无法撤销，独立的 fork 会话会保留。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-danger" disabled={busy || dialog.session.running} onClick={() => void mutate({ op: 'delete-session', projectId: dialog.projectId, sessionId: dialog.session.sessionId }).then(ok => { if (ok) close(); })}>永久删除</button></footer></>
        : dialog.kind === 'remove-project' ? <><p className="dialog-description">移除「{dialog.project.title}」的 Harness 注册。保留本地目录、待办与历史关联；重新添加同一目录可恢复。运行中会话必须先停止。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-danger" disabled={busy || dialog.project.sessions.some(s => s.running)} onClick={() => void mutate({ op: 'remove-project', projectId: dialog.project.projectId }).then(ok => { if (ok) close(); })}>确认移除</button></footer></>
        : dialog.kind === 'rename-session' ? <RenameForm key={dialog.session.sessionId} label="会话名称" initial={dialog.session.title} busy={busy} describedBy={error ? dialogErrorId : undefined}
          save={title => mutate({ op: 'rename-session', projectId: dialog.projectId, sessionId: dialog.session.sessionId, title })} onClose={close}/>
        : dialog.kind === 'rename' ? <RenameForm key={dialog.project.projectId} label="项目名称" initial={dialog.project.title} busy={busy} describedBy={error ? dialogErrorId : undefined} path={dialog.project.path}
          save={title => mutate({ op: 'rename', projectId: dialog.project.projectId, title })} onClose={close}/>
        : dialog.kind === 'archive' ? <><p className="wb-fulltext">归档「{dialog.session.title}」？会话保留，可以随时恢复。运行中的会话不会自动停止。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-primary" disabled={busy} onClick={() => void run(() => api.archiveSession(dialog.session.sessionId, true), '会话已归档，可随时恢复').then(ok => { if (ok) close(); })}>确认归档</button></footer></>
        : null}
    </Modal>)}
  </div>;
}
// 会话快速预览：轻量信息 + 完整正文（交互参考 dsh-archive-manager 的只读预览）。
function SessionPreviewDialog({ api, project, session, onClose }: { api: ClientPort; project: Project; session: HostSession; onClose(): void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; preview: SessionPreview }>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.call({ op: 'session-preview', projectId: project.projectId, sessionId: session.sessionId }, controller.signal)
      .then(value => setState({ status: 'ready', preview: value as SessionPreview }))
      .catch(error => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '预览读取失败' }); });
    return () => controller.abort();
  }, [api, project.projectId, session.sessionId, retry]);
  const preview = state.status === 'ready' ? state.preview : null;
  return <Modal title={preview?.title ?? session.title} className="session-preview-dialog" onClose={onClose}>
    <div className="session-preview-summary">
      <div className="session-preview-meta"><span className={`session-preview-status${session.running ? ' running' : ''}`}><Icon name={session.archived && !session.running ? 'archive' : 'clock'} size={13}/>{session.running ? '运行中' : session.archived ? '已归档 · 只读' : '未归档'}</span><span title={project.path}><Icon name="folder" size={13}/><span>{preview?.projectName ?? project.title}</span></span><span title={new Date(session.updatedAt).toLocaleString('zh-CN')}><Icon name="clock" size={13}/>更新于 {dateText(session.updatedAt)}</span></div>
    </div>
    <div className="session-preview-body">
    {state.status === 'loading' && <div className="session-preview-empty" role="status"><p>正在读取会话内容…</p></div>}
    {state.status === 'error' && <div className="session-preview-empty" role="alert"><strong>暂时无法读取会话内容</strong><p className="wb-warning">{state.message}</p><button type="button" onClick={() => { setState({ status: 'loading' }); setRetry(value => value + 1); }}>重新读取</button></div>}
    {preview && <div className="wb-preview-messages preview-messages" role="log" aria-label="会话内容">
      {preview.hasEarlier && <p className="wb-help preview-earlier">仅显示最近 40 条消息，更早内容请打开会话查看。</p>}
      {!preview.messages.length && <div className="session-preview-empty"><Icon name="message" size={24}/><strong>暂无可预览的正文</strong><p>会话还没有可显示的内容。</p></div>}
      {preview.messages.map(m => <article className="wb-preview-message preview-message" data-role={m.role} key={m.seq}>
        <div className="preview-role"><span aria-hidden="true">{m.role === 'user' ? '你' : 'AI'}</span><strong>{m.role === 'user' ? '用户' : '助手'}</strong></div>
        <pre className="preview-text">{m.text}</pre>
      </article>)}
    </div>}
    </div>
    <footer><button type="button" onClick={onClose}>关闭</button><button type="button" className="wb-primary" onClick={() => { api.openSession(session.sessionId); onClose(); }}>打开会话</button></footer>
  </Modal>;
}
export function RenameForm({ label, initial, busy, save, onClose, path, describedBy }: {
  label: string; initial: string; busy: boolean; save(title: string): Promise<boolean>; onClose(): void; path?: string; describedBy?: string;
}) {
  const [title, setTitle] = useState(initial);
  return <form aria-describedby={describedBy} onKeyDown={preventImeSubmit} onSubmit={e => {
    e.preventDefault();
    if (busy || !title.trim()) return;
    void save(title.trim()).then(ok => { if (ok) onClose(); });
  }}>
    <label>{label}<input autoFocus name="title" value={title} required maxLength={200} disabled={busy}
      aria-describedby={describedBy} onChange={e => setTitle(e.target.value)}/></label>
    {path && <><p className="dialog-description" style={{marginTop:14}}>名称与 Harness 同步；不改变本地文件夹名称和路径。Enter 保存，Esc 取消。</p><div className="path-preview">{path}</div></>}
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="wb-primary" disabled={busy || !title.trim()}>保存</button></footer>
  </form>;
}
export function AddProject({ api, root, busy, save, onClose, describedBy }: { api: ClientPort; root: string; busy: boolean; save(path: string, name?: string): Promise<boolean>; onClose(): void; describedBy?: string }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [picking, setPicking] = useState(false);
  return <form aria-describedby={describedBy} onKeyDown={preventImeSubmit} onSubmit={e => {
    e.preventDefault();
    if (busy || picking || (mode === 'existing' ? !path.trim() : !root || !name.trim())) return;
    void save(mode === 'existing' ? path.trim() : root, mode === 'new' ? name.trim() : undefined).then(ok => { if (ok) onClose(); });
  }}>
    <div className="wb-tabs tabs"><button type="button" aria-pressed={mode === 'existing'} className={mode === 'existing' ? 'wb-active active' : ''} disabled={busy} onClick={() => setMode('existing')}>打开已有项目</button><button type="button" aria-pressed={mode === 'new'} className={mode === 'new' ? 'wb-active active' : ''} disabled={busy} onClick={() => setMode('new')}>创建新项目</button></div>
    {/* 两种模式叠放在同一网格单元：容器高度恒等于较高者，切换不再跳动。 */}
    <div className="add-project-body">
    <div className="add-project-pane" data-active={mode === 'existing'}>
    <DirectoryInput label="项目路径" placeholder="输入或粘贴项目路径" value={path} onChange={setPath} disabled={busy || mode !== 'existing'} required={mode === 'existing'} pickDirectory={api.pickDirectory} onPickingChange={setPicking} describedBy={describedBy}/>
    <p className="wb-help" style={{ marginTop: 12 }}>也可点击右侧图标选择项目。</p>
    </div>
    <div className="add-project-pane" data-active={mode === 'new'}>
      <label>项目名称<input required={mode === 'new'} maxLength={200} value={name} disabled={busy || mode !== 'new'} aria-describedby={describedBy} onChange={e => setName(e.target.value)} placeholder="作为初始文件夹名称"/></label>
      <p className="wb-help">{root ? `创建位置：${root}` : '请先在工作台设置 → 项目配置 → 全局配置中设置默认项目根目录。'}</p>
    </div>
    </div>
    <footer><button type="button" disabled={busy || picking} onClick={onClose}>取消</button><button type="submit" className="wb-primary" disabled={busy || picking || (mode === 'existing' ? !path.trim() : !root || !name.trim())}>{mode === 'new' ? '创建项目' : '打开项目'}</button></footer>
  </form>;
}
