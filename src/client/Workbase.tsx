import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command } from '../shared/commands.js';
import type { HostSession, Preferences, Project, SessionPreview, Snapshot, Todo } from '../shared/model.js';
import { readSnapshot, type ClientPort, type UiMemory } from './api.js';
import { themeStyle } from './theme.js';
import { Home } from './Home.js';
import { Detail } from './Detail.js';
import { Search } from './Search.js';
import { Settings } from './Settings.js';
import { dateText, Icon, IconButton, Modal } from './ui.js';
import { DirectoryInput } from './DirectoryInput.js';
import { Brand } from './Brand.js';

type DialogState = { kind: 'rename'; project: Project } | { kind: 'edit' | 'show' | 'delete'; todo: Todo }
  | { kind: 'archive'; session: HostSession } | { kind: 'rename-session'; session: HostSession; projectId: string }
  | { kind: 'remove-project'; project: Project } | { kind: 'read-session'; project: Project; session: HostSession } | { kind: 'settings' } | { kind: 'add' };
export function Workbase({ api, memory }: { api: ClientPort; memory: UiMemory }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
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
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = async (action: () => Promise<unknown>, successNotice = '已保存'): Promise<boolean> => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    let committed = false;
    try {
      const result = await action();
      if (result === false) {
        if (mounted.current) { await load(); setNotice('该目录已在项目列表中'); }
        return true;
      }
      committed = true;
      if (mounted.current) { await load(); if (successNotice) setNotice(successNotice); }
      return true;
    } catch (error) {
      if (mounted.current) setError(`${committed ? '操作已完成，但刷新失败：' : ''}${error instanceof Error ? error.message : '操作失败'}`);
      return committed;
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const mutate = (command: Command) => run(() => api.call(command), command.op === 'preferences' ? '' : '已保存');
  const navigate = (projectId: string | null) => { void mutate({ op: 'preferences', patch: { selectedProject: projectId } }); };
  const selected = snapshot?.projects.find(p => p.projectId === snapshot.preferences.selectedProject);
  const close = () => { setDialog(null); setThemePreview(null); };
  const chosenTheme = themePreview ?? snapshot?.preferences.theme ?? 'follow';
  const lastActivity = Math.max(0, ...snapshot?.projects.map(p => p.updatedAt) ?? []);
  return <div className={`wb ${chosenTheme === 'warm' ? 'c' : 'a'} ${chosenTheme} ${dark ? 'dark' : 'light'}`} data-style={chosenTheme === 'follow' ? 'dsh' : chosenTheme} data-theme={chosenTheme} data-dark={dark} style={themeStyle(chosenTheme, dark)}>
    <header className="wb-header app-header">
      <Brand/>
      <Search snapshot={snapshot} api={api} memory={memory} mutate={mutate} notify={setNotice}/>
      {snapshot && <button type="button" className="wb-sync sync flat" disabled={busy} title={`最近同步 ${dateText(snapshot.syncedAt)} · 点击刷新`} onClick={() => { if (!busy) void load().catch(() => {}); }}><i className="sync-dot"/><span>{error ? '同步中断' : '已同步'}</span>{lastActivity > 0 && <span className="header-activity">最近活动 · {dateText(lastActivity)}</span>}</button>}
      <div className="header-actions"><button type="button" className="header-add" aria-label="添加项目" title="添加项目" disabled={busy || !snapshot} onClick={() => setDialog({ kind: 'add' })}><Icon name="plus"/><span className="action-label">添加项目</span></button>
      <IconButton name="settings" label="工作台设置" disabled={!snapshot || busy} onClick={() => setDialog({ kind: 'settings' })}/>
      </div>
    </header>
    {error && <div className="wb-feedback wb-error banner" role="alert"><Icon name="alert"/><span className="banner-body">{error}{snapshot ? ` · 数据可能不是最新 · 上次同步 ${dateText(snapshot.syncedAt)}` : ''}</span><button type="button" onClick={() => void load().catch(() => {})} disabled={busy}>重试</button><IconButton name="close" label="关闭错误提示" onClick={() => setError('')}/></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button type="button" className="toast-dismiss" aria-label="关闭提示" onClick={() => setNotice('')}>关闭</button></div>}
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
        run={action => run(action)} navigate={navigate} rename={project => setDialog({ kind: 'rename', project })}
        edit={todo => setDialog({ kind: 'edit', todo })} show={todo => setDialog({ kind: 'show', todo })} remove={todo => setDialog({ kind: 'delete', todo })}
        archive={session => setDialog({ kind: 'archive', session })}
        renameSession={session => setDialog({ kind: 'rename-session', session, projectId: selected.projectId })}
        removeProject={project => setDialog({ kind: 'remove-project', project })} notify={setNotice}
        showSession={session => setDialog({kind:'read-session',project:selected,session})}/>
      : <Home snapshot={snapshot} api={api} memory={memory} busy={busy} mutate={mutate} navigate={navigate}
          rename={project => setDialog({ kind: 'rename', project })} removeProject={project => setDialog({ kind: 'remove-project', project })} notify={setNotice}/>)}
    {dialog && snapshot && <Modal drawer={dialog.kind === 'settings'} title={dialog.kind === 'read-session' ? '会话预览' : dialog.kind === 'add' ? '添加项目' : dialog.kind === 'settings' ? '工作台设置' : dialog.kind === 'remove-project' ? '移除项目？' : dialog.kind === 'rename-session' ? '重命名会话' : dialog.kind === 'rename' ? '重命名项目' : dialog.kind === 'delete' ? '删除待办？' : dialog.kind === 'show' ? '待办详情' : dialog.kind === 'archive' ? '归档会话' : '编辑待办'} busy={busy} onClose={close}>
      {error && <p className="wb-warning" role="alert">{error}</p>}
      {dialog.kind === 'add' ? <AddProject api={api} root={snapshot.preferences.root} busy={busy} save={(path, name) => run(async () => {
        const result = await api.call({ op: 'add-project', path, ...(name ? { name } : {}) }) as { duplicate: boolean };
        return !result.duplicate;
      }, '项目已添加')} onClose={close}/>
        : dialog.kind === 'settings' ? <Settings snapshot={snapshot} busy={busy} preview={setThemePreview} save={mutate} onClose={close} dark={dark} pickDirectory={api.pickDirectory}/>
        : dialog.kind === 'read-session' ? <SessionPreviewDialog api={api} project={dialog.project} session={dialog.session} onClose={close}/>
        : dialog.kind === 'remove-project' ? <><p className="dialog-description">移除「{dialog.project.title}」的 Harness 注册。保留本地目录、待办与历史关联；重新添加同一目录可恢复。运行中会话必须先停止。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-danger" disabled={busy || dialog.project.sessions.some(s => s.running)} onClick={() => void mutate({ op: 'remove-project', projectId: dialog.project.projectId }).then(ok => { if (ok) close(); })}>确认移除</button></footer></>
        : dialog.kind === 'rename-session' ? <form onSubmit={e => {
          e.preventDefault(); const title = new FormData(e.currentTarget).get('title') as string;
          void mutate({ op: 'rename-session', projectId: dialog.projectId, sessionId: dialog.session.sessionId, title }).then(ok => { if (ok) close(); });
        }}><label>会话名称<input autoFocus name="title" defaultValue={dialog.session.title} required maxLength={200}/></label><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" className="wb-primary" disabled={busy}>保存</button></footer></form>
        : dialog.kind === 'rename' ? <form onSubmit={e => {
          e.preventDefault(); const title = new FormData(e.currentTarget).get('title') as string;
          void mutate({ op: 'rename', projectId: dialog.project.projectId, title }).then(ok => { if (ok) close(); });
        }}><label>项目名称<input autoFocus name="title" defaultValue={dialog.project.title} required maxLength={200}/></label><p className="dialog-description" style={{marginTop:14}}>名称与 Harness 同步；不改变本地文件夹名称和路径。Enter 保存，Esc 取消。</p><div className="path-preview">{dialog.project.path}</div><footer><button type="button" disabled={busy} onClick={close}>取消</button><button className="wb-primary" type="submit" disabled={busy}>保存</button></footer></form>
        : dialog.kind === 'archive' ? <><p className="wb-fulltext">归档「{dialog.session.title}」？会话保留，可以随时恢复。运行中的会话不会自动停止。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-primary" disabled={busy} onClick={() => void run(() => api.archiveSession(dialog.session.sessionId, true)).then(ok => { if (ok) close(); })}>确认归档</button></footer></>
        : dialog.kind === 'show' ? <ReadDetails project={snapshot.projects.find(p => p.projectId === dialog.todo.projectId)!} todo={dialog.todo} onClose={close} notify={setNotice}/>
        : dialog.kind === 'delete' ? <><p className="dialog-description">「{dialog.todo.title}」将永久删除，不影响项目会话。</p><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="wb-danger" disabled={busy} onClick={() => void mutate({ op: 'delete', projectId: dialog.todo.projectId, id: dialog.todo.id, expectedVersion: dialog.todo.version }).then(ok => { if (ok) close(); })}>确认删除</button></footer></>
        : <form onSubmit={e => {
          e.preventDefault(); const data = new FormData(e.currentTarget);
          void mutate({ op: 'update', projectId: dialog.todo.projectId, id: dialog.todo.id, expectedVersion: dialog.todo.version, title: data.get('title') as string, note: data.get('note') as string }).then(ok => { if (ok) close(); });
        }}><label>待办标题<input autoFocus name="title" defaultValue={dialog.todo.title} required maxLength={500}/></label><label>备注（可选）<textarea name="note" defaultValue={dialog.todo.note} maxLength={10000} rows={3}/></label><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" className="wb-primary" disabled={busy}>保存</button></footer></form>}
    </Modal>}
  </div>;
}
// 会话快速预览：轻量信息 + 完整正文（交互参考 dsh-archive-manager 的只读预览）。
function SessionPreviewDialog({ api, project, session, onClose }: { api: ClientPort; project: Project; session: HostSession; onClose(): void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; preview: SessionPreview }>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    api.call({ op: 'session-preview', projectId: project.projectId, sessionId: session.sessionId }, controller.signal)
      .then(value => setState({ status: 'ready', preview: value as SessionPreview }))
      .catch(error => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '预览读取失败' }); });
    return () => controller.abort();
  }, [api, project.projectId, session.sessionId]);
  const preview = state.status === 'ready' ? state.preview : null;
  return <>
    <div className="read-detail-field"><strong>会话标题</strong><p className="read-detail-text">{preview?.title ?? session.title}</p></div>
    <div className="read-detail-field"><strong>状态</strong><p className="read-detail-text">{session.running ? '运行中' : session.archived ? '已归档 · 只读' : '未归档'}</p></div>
    <div className="read-detail-field"><strong>所属项目</strong><p className="read-detail-text">{preview?.projectName ?? project.title}</p></div>
    <div className="read-detail-field"><strong>时间</strong><p className="read-detail-text" title={new Date(session.updatedAt).toLocaleString('zh-CN')}>{dateText(session.updatedAt)}</p></div>
    {state.status === 'loading' && <p className="wb-help" role="status">正在读取会话内容…</p>}
    {state.status === 'error' && <p className="wb-warning" role="alert">{state.message}</p>}
    {preview && <div className="wb-preview-messages preview-messages" role="log" aria-label="会话内容">
      {preview.hasEarlier && <p className="wb-help preview-earlier">仅显示最近 40 条消息，更早内容请打开会话查看。</p>}
      {!preview.messages.length && <p className="wb-help">会话还没有可显示的正文。</p>}
      {preview.messages.map(m => <article className="wb-preview-message preview-message" data-role={m.role} key={m.seq}>
        <div className="preview-role"><span aria-hidden="true">{m.role === 'user' ? '你' : 'AI'}</span><strong>{m.role === 'user' ? '用户' : '助手'}</strong></div>
        <pre className="preview-text">{m.text}</pre>
      </article>)}
    </div>}
    <footer><button type="button" className="wb-primary" onClick={onClose}>关闭</button></footer>
  </>;
}
function ReadDetails({project,todo,onClose,notify}: {project:Project;todo:Todo;onClose():void;notify(message:string):void}) {  const field = (label:string,text:string) => <div className="read-detail-field"><strong>{label}</strong><p className="read-detail-text">{text}</p></div>;
  return <>{field('完整标题',todo.title)}
    {field('状态',todo.done ? '已完成' : '待处理')}
    {field('完整备注',todo.note || '暂无备注')}
    <div className="read-detail-field"><strong>完整目录</strong><div className="read-detail-path">{project.path}</div></div>
    {field('时间与来源',`${dateText(todo.updatedAt)} · ${todo.creator === 'agent' ? 'Agent' : '用户'} 创建`)}
    <footer><button type="button" onClick={()=>void navigator.clipboard.writeText(project.path).then(()=>notify('已复制完整路径')).catch(()=>notify('复制失败，请选择完整目录文字复制'))}>复制目录</button><button type="button" className="wb-primary" onClick={onClose}>关闭</button></footer></>;
}
function AddProject({ api, root, busy, save, onClose }: { api: ClientPort; root: string; busy: boolean; save(path: string, name?: string): Promise<boolean>; onClose(): void }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [picking, setPicking] = useState(false);
  return <form onSubmit={e => {
    e.preventDefault();
    if (busy || picking || (mode === 'existing' ? !path.trim() : !root || !name.trim())) return;
    void save(mode === 'existing' ? path.trim() : root, mode === 'new' ? name.trim() : undefined).then(ok => { if (ok) onClose(); });
  }}>
    <div className="wb-tabs tabs"><button type="button" aria-pressed={mode === 'existing'} className={mode === 'existing' ? 'wb-active active' : ''} disabled={busy} onClick={() => setMode('existing')}>打开已有目录</button><button type="button" aria-pressed={mode === 'new'} className={mode === 'new' ? 'wb-active active' : ''} disabled={busy} onClick={() => setMode('new')}>创建新项目</button></div>
    {/* 两种模式叠放在同一网格单元：容器高度恒等于较高者，切换不再跳动。 */}
    <div className="add-project-body">
    <div className="add-project-pane" data-active={mode === 'existing'}>
    <DirectoryInput label="已有项目目录" value={path} onChange={setPath} disabled={busy} required pickDirectory={api.pickDirectory} onPickingChange={setPicking}/>
    <p className="wb-help" style={{ marginTop: 12 }}>选择本地文件夹，或输入绝对路径。与 Harness 打开项目使用同一入口。</p>
    </div>
    <div className="add-project-pane" data-active={mode === 'new'}>
      <label>项目名称<input autoFocus required maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)} placeholder="作为初始文件夹名称"/></label>
      <p className="wb-help">{root ? `创建位置：${root}` : '请先在工作台设置「通用」中配置项目根目录。'}</p>
    </div>
    </div>
    <footer><button type="button" disabled={busy || picking} onClick={onClose}>取消</button><button type="submit" className="wb-primary" disabled={busy || picking || (mode === 'existing' ? !path.trim() : !root || !name.trim())}>{mode === 'new' ? '创建项目' : '打开项目'}</button></footer>
  </form>;
}
