import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../shared/model.js';
import { Icon } from './ui.js';

export interface StatEntry {
  id: string;
  title: string;
  detail: string;
  detailHint?: string;
  sessionId?: string;
  project: Pick<Project, 'projectId' | 'title' | 'path'>;
  open?(): void;
  actions?: { label: string; disabled?: boolean; danger?: boolean; hint?: string; run(): void }[];
}
export interface StatCategory {
  id: string;
  title: string;
  entries: readonly StatEntry[];
  empty: string;
  emptyDetail?: string;
}
export function groupStatEntries(entries: readonly StatEntry[]) {
  const groups = new Map<string, { project: StatEntry['project']; entries: StatEntry[] }>();
  for (const entry of entries) {
    let group = groups.get(entry.project.projectId);
    if (!group) {
      group = { project: entry.project, entries: [] };
      groups.set(entry.project.projectId, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

export function StatsProjectPanel({ entries, empty, emptyDetail, categories, resultHeader }: {
  entries: readonly StatEntry[]; empty: string; emptyDetail?: string; categories?: readonly StatCategory[];
  resultHeader?(category: string | null, count: number): ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const groups = categories
    ? categories.map(category => ({ ...category, path: '' }))
    : groupStatEntries(entries).map(group => ({
      id: group.project.projectId, title: group.project.title, path: group.project.path, entries: group.entries, empty, emptyDetail,
    }));
  const search = query.trim().toLocaleLowerCase();
  // 诊断按类型导航，搜索具体异常的项目、路径和会话信息，零异常类型仍保留。
  const filtered = categories ? groups.map(group => ({
    ...group, entries: group.entries.filter(entry => `${group.title}\n${entry.title}\n${entry.detail}\n${entry.detailHint ?? ''}\n${entry.project.path}`.toLocaleLowerCase().includes(search)),
  })) : groups.filter(group => `${group.title}\n${group.path}`.toLocaleLowerCase().includes(search));
  const group = filtered.find(group => group.id === selected);
  // 快照更新后项目可能消失，自动回到全部结果，避免留下不可恢复的空分组。
  const chosen = group?.id ?? null;
  const ids = new Set(filtered.map(group => group.id));
  const visible = group?.entries ?? (categories ? filtered.flatMap(group => group.entries) : entries.filter(entry => ids.has(entry.project.projectId)));
  const total = filtered.reduce((sum, item) => sum + item.entries.length, 0);
  useEffect(() => { if (results.current) results.current.scrollTop = 0; }, [chosen, query]);
  return <div className="stats-project-browser">
    <aside className="stats-project-groups" aria-label={categories ? '诊断类型分组' : '统计项目分组'}>
      <label className="stats-group-search"><Icon name="search" size={15}/>
        <input type="search" aria-label={categories ? '搜索诊断异常' : '搜索统计项目'} placeholder={categories ? '搜索异常' : '搜索项目'} value={query}
          onChange={event => { setQuery(event.target.value); setSelected(null); }}/></label>
      <nav className="stats-group-items" aria-label={categories ? '选择诊断类型' : '选择统计项目'}>
        <button type="button" className="stats-group-entry" {...(categories ? { 'data-diagnostic-group': '' } : { 'data-project-group': '' })}
          aria-pressed={chosen === null} onClick={() => setSelected(null)}>
          <Icon name="grid" size={16}/><span className="stats-group-copy"><strong>{categories ? '全部异常' : '全部项目'}</strong></span><span className="stats-group-count">{total}</span>
        </button>
        {filtered.map(({ id, title, path, entries: items }) => <button type="button" className="stats-group-entry" key={id}
          {...(categories ? { 'data-diagnostic-group': id } : { 'data-project-group': id })}
          aria-pressed={chosen === id} title={path || undefined} onClick={() => setSelected(id)}>
          <Icon name={categories ? 'alert' : 'folder'} size={16}/><span className="stats-group-copy"><strong>{title}</strong></span>
          <span className="stats-group-count">{items.length}</span>
        </button>)}
        {!filtered.length && <p className="stats-group-empty">{search ? '没有匹配的项目' : '暂无相关项目'}</p>}
      </nav>
    </aside>
    <div className={`stats-group-content${resultHeader ? ' diagnostic-group-content' : ''}`}>
    {resultHeader?.(chosen, visible.length)}
    <div className={`stats-group-results${categories && !visible.length ? ' diagnostic-results-empty' : ''}`} ref={results} role="region" aria-label={categories ? '诊断分组内容' : '统计分组内容'} tabIndex={0}>
      {visible.map(entry => entry.actions || !entry.open ? <div className="wb-stat-item stats-item diagnostic-item" key={entry.id}>
        <span className="stats-item-copy"><strong title={entry.title}>{entry.title}</strong><small title={entry.detailHint ?? entry.detail}>{entry.detail}</small>
          {entry.sessionId && <span className="diagnostic-session-id">{entry.sessionId}</span>}</span>
        {entry.actions?.map(action => <button type="button" key={action.label} disabled={action.disabled}
          className={action.danger ? 'danger' : undefined} title={action.hint} onClick={action.run}>{action.label}</button>)}
      </div> : <button className="wb-stat-item stats-item" type="button" key={entry.id} data-stat-entry={entry.id} onClick={entry.open}>
        <span className="stats-item-copy"><strong title={entry.title}>{entry.title}</strong><small title={entry.detailHint ?? entry.detail}>{entry.detail}</small></span><Icon name="chevron"/>
      </button>)}
      {!visible.length && (categories ? <div className="diagnostic-empty" role="status">
        <strong>{search ? '没有匹配的异常' : group?.empty ?? empty}</strong>
        <p>{search ? '请尝试其他关键词或清空搜索' : group?.emptyDetail ?? emptyDetail}</p>
      </div> : <p className="stats-empty" role="status">{search ? '没有匹配项目的记录' : group?.empty ?? empty}</p>)}
    </div>
    </div>
  </div>;
}
