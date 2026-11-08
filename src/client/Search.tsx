import { useEffect, useRef, useState } from 'react';
import type { Command } from '../shared/commands.js';
import { defaultDetail, type SessionSearch, type Snapshot } from '../shared/model.js';
import { readSnapshot, type ClientPort, type UiMemory } from './api.js';
import { Icon, Tabs } from './ui.js';

export function Search({ snapshot, api, memory, mutate, notify }: {
  snapshot: Snapshot | null; api: ClientPort; memory: UiMemory;
  mutate(command: Command): Promise<boolean>; notify(message: string): void;
}) {
  const [text, setText] = useState(memory.search);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'all' | 'project' | 'session' | 'todo'>('all');
  const [remote, setRemote] = useState<SessionSearch>({ items: [], hasMore: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(-1);
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = text.trim().toLocaleLowerCase();
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
        e.preventDefault(); setOpen(true); input.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', shortcut); document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', shortcut); document.removeEventListener('pointerdown', outside); };
  }, []);
  useEffect(() => {
    setRemote({ items: [], hasMore: false }); setError(''); setIndex(-1);
    if (!open || !query) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    const timer = setTimeout(() => {
      void api.call({ op: 'search-sessions', query: text.trim() }, controller.signal).then(value => {
        if (!controller.signal.aborted) setRemote(value as SessionSearch);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '会话全文搜索失败'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, retry, snapshot?.revision, api]);
  type Hit = { key: string; id: string; projectId: string; kind: 'project' | 'session' | 'todo'; title: string; context: string; rank: number; body: boolean; reason: string; excerpt?: string; state?: string };
  const match = (value: string) => value.toLocaleLowerCase().includes(query);
  const snippets = new Map(remote.items.map(item => [item.sessionId, item.snippet]));
  const hits: Hit[] = query && snapshot ? snapshot.projects.flatMap(p => {
    const project: Hit[] = match(`${p.title} ${p.path}`) ? [{ key: `p:${p.projectId}`, id: p.projectId, projectId: p.projectId, kind: 'project', title: p.title, context: p.path, rank: match(p.title) ? 0 : 1, body: false, reason: match(p.title) ? '项目名称' : '目录路径' }] : [];
    const sessions: Hit[] = p.sessions.filter(s => match(s.title) || snippets.has(s.sessionId)).map(s => ({
      key: `s:${s.sessionId}`, id: s.sessionId, projectId: p.projectId, kind: 'session', title: s.title,
      context: p.title, excerpt: snippets.get(s.sessionId), state: s.archived ? '已归档 · 只读' : undefined,
      rank: match(s.title) ? 0 : 1, body: snippets.has(s.sessionId), reason: match(s.title) ? '会话标题' : '会话全文',
    }));
    const todos: Hit[] = p.todos.filter(t => match(`${t.title} ${t.note}`)).map(t => ({
      key: `t:${t.id}`, id: t.id, projectId: p.projectId, kind: 'todo', title: t.title,
      context: p.title, state: t.done ? '已完成' : '待处理', excerpt: !match(t.title) ? t.note.slice(Math.max(0, t.note.toLocaleLowerCase().indexOf(query) - 30), t.note.toLocaleLowerCase().indexOf(query) + query.length + 100) : undefined,
      rank: match(t.title) ? 0 : 1, body: false, reason: match(t.title) ? '待办标题' : '待办备注',
    }));
    return [...project, ...sessions, ...todos];
  }).filter(hit => kind === 'all' || hit.kind === kind).sort((a,b) => ['project','session','todo'].indexOf(a.kind) - ['project','session','todo'].indexOf(b.kind) || a.rank - b.rank) : [];
  const selected = Math.min(index, Math.max(0, hits.length - 1));
  useEffect(() => { root.current?.querySelector('[data-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const show = async (hit: Hit) => {
    try {
      // 导航前重新读取权限与归属，不能打开已经移除或删除的旧结果。
      const latest = await readSnapshot(api);
      const p = latest.projects.find(p => p.projectId === hit.projectId);
      if (!p) throw new Error('项目已移除，请更新搜索结果');
      if (hit.kind === 'session') {
        if (!p.sessions.some(s => s.sessionId === hit.id)) throw new Error('会话已删除或不可访问');
        if (hit.body) notify('Harness 当前不支持定位匹配消息，已打开原会话。正文检索只提供摘录，不提供命中次数。');
        api.openSession(hit.id);
      } else if (hit.kind === 'todo') {
        const todo = p.todos.find(t => t.id === hit.id);
        if (!todo) throw new Error('待办已删除，请更新搜索结果');
        memory.targetTodo = hit.id; memory.detail(p.projectId).tab = 'todos';
        if (!await mutate({ op: 'preferences', patch: { selectedProject: p.projectId, detail: { [p.projectId]: { ...(latest.preferences.detail[p.projectId] ?? defaultDetail()), group: todo.done ? 'done' : 'pending' } } } })) return;
      } else if (!await mutate({ op: 'preferences', patch: { selectedProject: p.projectId } })) return;
      setOpen(false);
    } catch (e) { notify(e instanceof Error ? e.message : '打开失败'); setRetry(n => n + 1); }
  };
  const highlight = (value: string) => {
    if (!query) return value;
    const parts: React.ReactNode[] = [];
    let start = 0, at = value.toLocaleLowerCase().indexOf(query);
    while (at >= 0) {
      parts.push(value.slice(start,at),<mark key={at}>{value.slice(at,at+query.length)}</mark>);
      start = at + query.length; at = value.toLocaleLowerCase().indexOf(query,start);
    }
    parts.push(value.slice(start)); return parts;
  };
  const labels = { project: '项目', session: '会话', todo: '待办' };
  return <div className={`wb-search global-search ${query ? 'has-query' : ''}`} ref={root} onKeyDown={e => {
    // 从结果按钮返回输入框会触发 onFocus，最后关闭以免被它重新打开。
    if (e.key === 'Escape') { e.preventDefault(); input.current?.focus(); setOpen(false); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setIndex(n => hits.length ? (n + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length : 0); }
    if (e.key === 'Enter' && e.target === input.current && open && hits[selected]) { e.preventDefault(); void show(hits[selected]!); }
  }}>
    <div className="search"><Icon name="search"/><input ref={input} role="combobox" aria-autocomplete="list" aria-label="搜索项目、会话和待办" placeholder="搜索项目、会话全文、待办…" value={text} maxLength={500}
      aria-expanded={open} aria-controls="wb-global-results" onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onChange={e => { setText(e.target.value); memory.search = e.target.value; setOpen(true); }}/><kbd>⌘ K</kbd></div>
    {open && <section className="wb-search-popover search-panel" id="wb-global-results" aria-label="搜索结果">
      <Tabs value={kind} options={[{ value: 'all', label: '全部' }, { value: 'project', label: '项目' }, { value: 'session', label: '会话' }, { value: 'todo', label: '待办' }]} onChange={value => { setKind(value); setIndex(0); }}/>
      <div className="wb-search-scroll search-results" role="listbox" aria-label="全局搜索结果">
        {!query && <p className="search-placeholder">搜索项目名称、目录、会话标题与正文、待办标题与备注</p>}
        {hits.map((hit, i) => <div key={hit.key}>
          {(i === 0 || hits[i-1]?.kind !== hit.kind) && <div className="search-group"><span>{labels[hit.kind]}</span><span>{hits.filter(item => item.kind === hit.kind).length} 条</span></div>}
          <button type="button" role="option" className="wb-search-hit search-hit" aria-selected={i === selected} data-selected={i === selected} onClick={() => void show(hit)} onFocus={() => setIndex(i)}>
            <span className="hit-icon"><Icon name={hit.kind === 'project' ? 'folder' : hit.kind === 'session' ? 'message' : 'check'}/></span><span className="hit-content"><span className="hit-title">{highlight(hit.title)}</span><span className="hit-meta">{highlight(hit.context)}</span>{hit.excerpt && <span className="hit-excerpt">{highlight(hit.excerpt)}</span>}<span className="hit-badges"><span>{hit.reason}</span>{hit.state && <span>{hit.state}</span>}</span></span>
          </button>
        </div>)}
        {loading && <p className="wb-help" role="status">正在检索会话正文…</p>}
        {error && <p className="wb-warning" role="alert">标题、项目与待办结果仍可用。{error}<button type="button" onClick={() => setRetry(n => n + 1)}>重试全文检索</button></p>}
        {query && !loading && !hits.length && <p className="search-placeholder">{error ? '当前可搜索范围没有匹配结果' : '没有匹配结果'}</p>}
        {remote.hasMore && <p className="wb-help">宿主只返回前 20 条正文结果，请缩小搜索范围。</p>}
      </div>
      <div className="search-foot"><span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span><span>跨项目搜索 · 全文与备注匹配</span></div>
    </section>}
  </div>;
}
