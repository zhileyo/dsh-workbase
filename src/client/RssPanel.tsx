import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { extensionCall, type ClientPort, type UiMemory } from './api.js';
import { Icon, IconButton, Modal, ModalFlow, Picker, FormField, usePanelSnapshot, type Notify, type ModalState } from './ui.js';
import { RssMenu, type RssMenuItem } from './rss-menu.js';
import { rssReadingMarkdown } from './rss-reading.js';
import { errorText, languageTag, statusText, t } from './i18n.js';
import type { Project } from '../shared/model.js';
import { RSS_LIMITS, rssContentTags, safeRssUrl, rssOriginalUrl, rssRecentArticles, rssNavigationGroups as orderedRssGroups, type RssContentNode, type RssArticle, type RssArticleQuery, type RssFeed, type RssSnapshot, type RssOpmlPreview, type RssRecommendation, type RssRefreshResult } from '../shared/rss.js';

type GroupDraft = { id: string; value: string; error: string };
type MoveInput = { kind: 'feed' | 'group'; id: string; targetId?: string; groupId?: string; position?: 'before' | 'after' };
type FeedDraft = { name: string; url: string; groupId: string; enabled: boolean; trusted: boolean; revision?: number };
type Detail = { kind: 'create' | 'import' | 'detail' | 'edit' | 'read' | 'move'; id?: string; recommendation?: boolean };
interface PanelMemory {
  tab: 'subscriptions' | 'catalog'; groupId: string | undefined; feedId: string; query: string;
  scroll: number; navigationScroll: number; groupDraft?: GroupDraft;
  drafts: Record<string, FeedDraft>; importText: string; importGroup: string;
  tabViews: Record<'subscriptions' | 'catalog', { query: string; scroll: number }>;
}
const memories = new WeakMap<object, PanelMemory>();
function panelMemory(key: object, memory?: UiMemory) {
  let value = memories.get(key);
  if (!value) {
    const saved = memory?.extensions.rss;
    value = { tab: saved?.tab === 'catalog' ? 'catalog' : 'subscriptions',
      groupId: !saved?.group || saved.group === '*' ? undefined : saved.group === 'ungrouped' ? '' : saved.group,
      feedId: '', query: saved?.search ?? '', scroll: saved?.scroll ?? 0, navigationScroll: 0, drafts: {}, importText: '', importGroup: '',
      tabViews: { subscriptions: { query: saved?.tab === 'subscriptions' ? saved.search : '', scroll: saved?.tab === 'subscriptions' ? saved.scroll : 0 },
        catalog: { query: saved?.tab === 'catalog' ? saved.search : '', scroll: saved?.tab === 'catalog' ? saved.scroll : 0 } } };
    memories.set(key, value);
  }
  return value;
}
const time = (value?: number) => value ? new Date(value).toLocaleString(languageTag()) : t('发布时间未知');
const failure = (error: unknown) => errorText(error instanceof Error ? error.message : 'RSS 操作失败，请重试');
const blankDraft = (groupId = ''): FeedDraft => ({ name: '', url: '', groupId, enabled: true, trusted: false });
const rssNavigationGroups = (snapshot: RssSnapshot) => orderedRssGroups(snapshot).map(group => group.id ? group : { ...group, name: t('默认分组') });
function Original({ article, feed }: { article: RssArticle; feed?: RssFeed }) {
  const url = rssOriginalUrl(article, feed);
  return url ? <a className="rss-original-link" href={url} target="_blank" rel="noopener noreferrer" title={url} aria-label={`打开原文：${article.title}`}><Icon name="external"/>打开原文</a> : <span>暂无有效原文链接</span>;
}
export function RssReading({ article, feed, api }: { article: RssArticle; feed?: RssFeed; api?: ClientPort }) {
  const [read, setRead] = useState<{ id: string; sequence: number; body: string; content?: RssContentNode[]; loading: boolean; error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const url = rssOriginalUrl(article, feed);
  const needsFetch = !article.body || (article.bodySource === 'original' && !article.bodyContent);
  useEffect(() => {
    if (!api || !needsFetch || !url) return;
    let active = true;
    const controller = new AbortController();
    setRead({ id: article.id, sequence: article.sequence, body: '', loading: true, error: '' });
    void extensionCall<RssArticle>(api, 'rss', 'article.fetch', { id: article.id }, controller.signal)
      .then(value => { if (active) setRead({ id: article.id, sequence: article.sequence, body: value.body, content: value.bodyContent, loading: false, error: '' }); })
      .catch(error => { if (active) setRead({ id: article.id, sequence: article.sequence, body: '', loading: false, error: failure(error) }); });
    return () => { active = false; controller.abort(); };
  }, [api, article.id, article.sequence, needsFetch, url, retry]);
  const current = read?.id === article.id && read.sequence === article.sequence ? read : null;
  const body = current?.body || article.body;
  const content = current?.content || article.bodyContent;
  const loading = !!api && !!url && needsFetch && (current?.loading ?? true);
  const renderContent = (nodes: RssContentNode[], depth = 0): React.ReactNode => depth > 32 ? null : nodes.slice(0, 5000).map((node, key) => {
    if (node.text !== undefined) return node.text;
    const children = renderContent(node.children ?? [], depth + 1);
    if (!node.tag || !rssContentTags.includes(node.tag)) return children;
    const href = node.tag === 'a' ? safeRssUrl(node.href ?? '') : '';
    if (node.tag === 'a' && !href) return children;
    return React.createElement(node.tag, { key, ...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {}) }, ...(['br', 'hr'].includes(node.tag) ? [] : [children]));
  });
  return <><div className="todo-detail-summary"><div className="todo-detail-meta"><span>{feed?.name ?? '来源不可用'}</span><span>{time(article.publishedAt)}</span><Original article={article} feed={feed}/></div></div>
    <div className="integration-detail-body" aria-busy={loading}>{loading ? <div className="rss-reader-loading" role="status">
      <span>正在拉取原文正文…</span><div className="rss-reader-skeleton" aria-hidden="true">{Array.from({ length: 7 }, (_, key) => <div key={key} className={`sk-line${key % 3 === 2 ? ' short' : ''}`}/>)}</div>
    </div> : <>
      {(!body || current?.error) && <p className="rss-reader-summary-note" role="status">
        {current?.error ? <>{`正文拉取失败：${current.error}`} <button type="button" onClick={() => setRetry(value => value + 1)}>重试</button></>
          : '订阅源未提供正文，当前显示摘要。'}{url && ' 可通过原文链接阅读全文。'}</p>}
      {content?.length ? <div className="integration-reading rss-reader-content">{api?.renderMarkdown ? api.renderMarkdown(rssReadingMarkdown(content)) : renderContent(content)}</div>
        : <div className="integration-reading">{body || article.summary || '此文章暂无正文或摘要。'}</div>}
    </>}
    </div></>;
}
export function RssArticleList({ snapshot, query, recentDays, onRead, onFeed }: {
  snapshot: RssSnapshot; query: RssArticleQuery; recentDays?: number; onRead(article: RssArticle): void; onFeed(id: string): void;
}) {
  const feeds = new Map(snapshot.feeds.filter(f => (!query.feedId || f.id === query.feedId) && (query.groupId === undefined || f.groupId === query.groupId)).map(f => [f.id, f]));
  const terms = (query.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidates = recentDays === undefined ? snapshot.articles : rssRecentArticles(snapshot, recentDays);
  const articles = candidates.filter(a => feeds.has(a.feedId) && terms.every(term => (a.title + ' ' + a.summary + ' ' + feeds.get(a.feedId)!.name).toLocaleLowerCase().includes(term)))
    .sort((a, b) => b.publishedAt - a.publishedAt || b.sequence - a.sequence);
  if (!articles.length) return <div className="integration-empty" role="status"><Icon name="rss"/><strong>{terms.length ? '没有匹配的文章' : feeds.size ? recentDays === undefined ? '暂无缓存文章' : '所选时间范围内暂无更新' : '暂无订阅'}</strong><p>{terms.length ? '试试其他关键词，或清空搜索。' : recentDays === undefined ? '添加订阅后可刷新文章，暂停更新的来源保留缓存。' : '可刷新订阅，或在外观布局中调整统计时间范围。'}</p></div>;
  return <>{articles.map(a => <article className="rss-article-row" key={a.id} data-i-row={a.id}>
    <button type="button" className="rss-article-open" aria-label={`阅读 ${a.title}`} onClick={() => onRead(a)}><strong className="rss-article-title">{a.title}</strong><span className="rss-article-summary">{a.summary || '此来源未提供摘要'}</span></button>
    <div className="rss-article-meta"><button type="button" title={`仅查看 ${feeds.get(a.feedId)!.name}`} onClick={() => onFeed(a.feedId)}>{feeds.get(a.feedId)!.name}</button><span>{time(a.publishedAt)}</span>{!feeds.get(a.feedId)!.enabled && <span>已暂停更新</span>}<Original article={a} feed={feeds.get(a.feedId)}/></div>
  </article>)}</>;
}
function feedItems(feed: RssFeed, snapshot: RssSnapshot, action: (method: string, input: unknown) => void, move: (input: MoveInput) => void): RssMenuItem[] {
  const siblings = snapshot.feeds.filter(f => f.groupId === feed.groupId), index = siblings.findIndex(f => f.id === feed.id);
  return [
    { label: '编辑订阅', icon: 'pencil', action: () => action('edit', feed.id) },
    { label: feed.enabled ? '暂停更新' : '恢复更新', icon: 'clock', action: () => action('feed.update', { id: feed.id, revision: feed.revision, enabled: !feed.enabled }) },
    { label: '刷新此来源', icon: 'refresh', disabled: !feed.enabled || snapshot.refreshing.includes(feed.id), action: () => action('refresh', { feedId: feed.id }) },
    { label: '导出此来源', icon: 'archive', action: () => action('opml.export', { feedId: feed.id }) },
    ...(index > 0 ? [{ label: '上移', icon: 'arrow' as const, direction: 'up' as const, action: () => move({ kind: 'feed', id: feed.id, targetId: siblings[index - 1]!.id, position: 'before' }) }] : []),
    ...(index < siblings.length - 1 ? [{ label: '下移', icon: 'arrow' as const, direction: 'down' as const, action: () => move({ kind: 'feed', id: feed.id, targetId: siblings[index + 1]!.id, position: 'after' }) }] : []),
    { label: '移动到分组…', icon: 'folder', action: () => action('move-picker', feed.id) },
    { label: '取消订阅', icon: 'trash', danger: true, action: () => action('feed.remove', { id: feed.id }) },
  ];
}
interface NavigationProps {
  snapshot: RssSnapshot; groupId?: string; feedId: string; draft?: GroupDraft;
  onGroup(id: string | undefined): void; onFeed(id: string): void;
  onEdit(id: string): void; onDraft(value: string): void; onFinish(cancel?: boolean): void; onAdd(): void;
  onAction(method: string, input: unknown): void; onMove(input: MoveInput): void;
  onRenameFeed?(feed: RssFeed, name: string): Promise<unknown>;
}
export function RssFeedName({ feed, selected, onFeed, onRename, onEditing }: {
  feed: RssFeed; selected: boolean; onFeed(id: string): void;
  onRename?(feed: RssFeed, name: string): Promise<unknown>; onEditing?(editing: boolean): void;
}) {
  const [draft, setDraft] = useState<{ feed: RssFeed; value: string; error: string } | null>(null);
  const current = useRef(draft), saving = useRef(false), input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const update = (value: typeof draft) => { current.current = value; setDraft(value); };
  useEffect(() => { if (draft?.error) input.current?.focus({ preventScroll: true }); }, [draft?.error]);
  const begin = () => {
    if (!onRename || current.current || saving.current) return;
    update({ feed: { ...feed }, value: feed.name, error: '' }); onEditing?.(true);
  };
  const finish = async (cancel = false) => {
    const value = current.current;
    if (!value || saving.current) return;
    const close = () => { update(null); onEditing?.(false); };
    if (cancel) { close(); return; }
    const name = value.value.trim();
    if (!name) { update({ ...value, error: '订阅名称不能为空' }); return; }
    if (name.length > 80) { update({ ...value, error: '订阅名称最多 80 个字符' }); return; }
    if (name === value.feed.name) { close(); return; }
    saving.current = true; setBusy(true);
    try { await onRename!(value.feed, name); close(); }
    catch (error) { update({ ...value, error: failure(error) }); }
    finally { saving.current = false; setBusy(false); }
  };
  if (draft) return <div className="rss-source-name-editor"><div className="stats-group-entry"><Icon name="rss"/><div className="rss-group-input-wrap">
    <input ref={input} className="rss-group-name" data-rss-feed-name={feed.id} aria-label="订阅名称" aria-invalid={!!draft.error}
      aria-describedby={draft.error ? `rss-feed-error-${feed.id}` : undefined} maxLength={80} autoFocus disabled={busy} value={draft.value}
      onChange={e => update({ ...draft, value: e.target.value, error: '' })} onBlur={() => void finish()}
      onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void finish(e.key === 'Escape'); } }}/></div></div>
    {draft.error && <p className="rss-group-error" id={`rss-feed-error-${feed.id}`} role="alert">{draft.error}</p>}</div>;
  return <button type="button" className="stats-group-entry" aria-pressed={selected}
    title={`${feed.name}${feed.enabled ? '' : ' · 已暂停更新'}${feed.trusted ? ' · 可信内网源' : ''}`}
    onClick={() => onFeed(feed.id)} onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === 'F2') { e.preventDefault(); begin(); } }}>
    <Icon name="rss"/><span className="stats-group-copy"><strong>{feed.name}</strong></span>
    {feed.error ? <span className="rss-nav-warning" title={statusText(feed.error)} aria-label={statusText(feed.error)}><Icon name="alert"/></span> : !feed.enabled ? <Icon name="clock"/> : null}</button>;
}
export function RssNavigation(props: NavigationProps) {
  const { snapshot, groupId, feedId, draft, onGroup, onFeed, onEdit, onDraft, onFinish, onAdd, onAction, onMove } = props;
  const drag = useRef<{ kind: 'feed' | 'group'; id: string } | null>(null);
  const groupInput = useRef<HTMLInputElement>(null);
  const [editingFeed, setEditingFeed] = useState('');
  const latest = useRef(props);
  latest.current = props;
  const activateGroup = (id: string, expanded?: boolean) => {
    const current = latest.current;
    const group = id ? current.snapshot.groups.find(g => g.id === id) : { collapsed: current.snapshot.ungroupedCollapsed ?? false };
    if (!group || current.draft) return;
    if (expanded === undefined) current.onGroup(id);
    const collapsed = expanded === undefined ? !group.collapsed : !expanded;
    if (collapsed !== !!group.collapsed) current.onAction('group.update', { id, collapsed });
  };
  const editGroup = (id: string) => { if (id) onEdit(id); };
  useEffect(() => { if (draft?.error) groupInput.current?.focus({ preventScroll: true }); }, [draft?.error]);
  const [drop, setDrop] = useState<{ id: string; position: 'before' | 'after' | 'inside' } | null>(null);
  const groups = rssNavigationGroups(snapshot);
  const count = (id?: string) => {
    const ids = new Set(snapshot.feeds.filter(f => id === undefined || f.groupId === id).map(f => f.id));
    return snapshot.articles.filter(a => ids.has(a.feedId)).length;
  };
  const groupItems = (id: string): RssMenuItem[] => {
    const index = groups.findIndex(g => g.id === id);
    return [...(id ? [{ label: '重命名', icon: 'pencil' as const, action: () => editGroup(id) }] : []),
      ...(index > 0 ? [{ label: '上移', icon: 'arrow' as const, direction: 'up' as const, action: () => onMove({ kind: 'group', id, targetId: groups[index - 1]!.id, position: 'before' }) }] : []),
      ...(index < groups.length - 1 ? [{ label: '下移', icon: 'arrow' as const, direction: 'down' as const, action: () => onMove({ kind: 'group', id, targetId: groups[index + 1]!.id, position: 'after' }) }] : []),
      ...(id ? [{ label: '删除分组', icon: 'trash' as const, danger: true, action: () => onAction('group.remove', { id }) }] : [])];
  };
  const dragProps = (kind: 'feed' | 'group', id: string, draggable = true): React.HTMLAttributes<HTMLDivElement> => ({
    draggable, 'data-rss-drag': draggable ? kind : undefined, 'data-rss-target': kind, 'data-rss-id': id,
    'data-rss-drop': drop?.id === id ? drop.position : undefined,
    onDragStart: e => { e.stopPropagation(); drag.current = { kind, id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-dsh-rss-nav', JSON.stringify(drag.current)); },
    onDragOver: e => {
      if (!drag.current || drag.current.kind === 'group' && kind !== 'group' || drag.current.kind === kind && drag.current.id === id) return;
      e.preventDefault(); e.stopPropagation();
      const bounds = e.currentTarget.getBoundingClientRect();
      setDrop({ id, position: drag.current.kind === 'feed' && kind === 'group' ? 'inside' : e.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' });
    },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null); },
    onDrop: e => {
      e.preventDefault(); e.stopPropagation();
      const item = drag.current;
      if (item && drop) {
        onMove({ ...item, ...(kind === 'group' && item.kind === 'feed' ? { groupId: id } : { targetId: id }), position: drop.position === 'after' ? 'after' : 'before' });
      }
      drag.current = null; setDrop(null);
    },
    onDragEnd: () => { drag.current = null; setDrop(null); },
  } as React.HTMLAttributes<HTMLDivElement>);
  const button = (id: string | undefined, name: string, collapsed = false) => id === undefined
    ? <button type="button" className="stats-group-entry" aria-pressed={groupId === undefined && !feedId} title={`${name} · ${count(id)} 篇文章`} onClick={() => onGroup(id)}>
      <Icon name="grid"/><span className="stats-group-copy"><strong>{name}</strong></span><span className="stats-group-count" aria-label={`${count(id)} 篇文章`}>{count(id)}</span>
    </button>
    : <div className="stats-group-entry rss-group-entry"><button type="button" className="stats-group-copy rss-group-select" data-rss-group-select={id}
      aria-pressed={groupId === id && !feedId} aria-expanded={!collapsed} aria-controls={`rss-children-${id || 'none'}`} title={`${name} · ${count(id)} 篇文章`}
      onClick={() => { if (!drag.current) activateGroup(id); }}
      onKeyDown={e => {
        if (e.nativeEvent?.isComposing) return;
        if (id && e.key === 'F2') { e.preventDefault(); editGroup(id); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); activateGroup(id, e.key === 'ArrowRight'); }
      }}><strong className="rss-group-label">{name}</strong></button><span className="stats-group-count" aria-label={`${count(id)} 篇文章`}>{count(id)}</span></div>;
  return <aside className="integration-groups" aria-label="订阅分组与来源">
    <div className="integration-group-heading"><p className="integration-group-title">自定义分组</p><IconButton name="plus" label="添加分组" onClick={onAdd}/></div>
    <div className="integration-group-list" data-rss-navigation>
      <div className="rss-nav-row rss-all-row" data-rss-selected={groupId === undefined && !feedId}>{button(undefined, '全部订阅')}</div>
      {groups.map(group => <div className="rss-group-block" key={group.id}>
        <div className="rss-nav-row rss-group-heading" data-rss-selected={groupId === group.id && !feedId} {...dragProps('group', group.id, draft?.id !== group.id)}
          onClick={e => { if (!drag.current && !(e.target as HTMLElement).closest('button,input,textarea,select,[role="menu"]')) activateGroup(group.id); }}>
          <span className="rss-group-toggle" data-collapsed={!!group.collapsed} data-default={!group.id || undefined} aria-hidden="true">{!group.id ? <Icon name="folder"/> : snapshot.feeds.some(f => f.groupId === group.id) && <Icon name="down"/>}</span>
          {draft?.id === group.id ? <div className="rss-group-input-wrap"><input ref={groupInput} className="rss-group-name" data-rss-group-name={group.id} aria-label="分组名称" aria-invalid={!!draft.error} aria-describedby={`rss-error-${group.id}`} maxLength={80} autoFocus value={draft.value} onChange={e => onDraft(e.target.value)} onBlur={() => onFinish()}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onFinish(e.key === 'Escape'); } }}/></div> : button(group.id, group.name, group.collapsed)}
          {!!groupItems(group.id).length && <RssMenu label={`${group.name}的分组操作`} items={groupItems(group.id)}/>}
        </div>
        {draft?.id === group.id && draft.error && <p className="rss-group-error" id={`rss-error-${group.id}`} role="alert">{errorText(draft.error)}</p>}
        <div className="rss-group-children" id={`rss-children-${group.id || 'none'}`} hidden={group.collapsed}>
          {snapshot.feeds.filter(f => f.groupId === group.id).map(feed => <div className="rss-nav-row rss-source-row" key={feed.id} data-rss-selected={feedId === feed.id} {...dragProps('feed', feed.id, editingFeed !== feed.id)}>
            <RssFeedName feed={feed} selected={feedId === feed.id} onFeed={onFeed} onRename={props.onRenameFeed} onEditing={editing => setEditingFeed(current => editing ? feed.id : current === feed.id ? '' : current)}/>
            <RssMenu label={`${feed.name}的订阅操作`} items={feedItems(feed, snapshot, onAction, onMove)}/>
          </div>)}
        </div>
      </div>)}
    </div>
    <div className="integration-mobile-group rss-mobile-group-row"><Picker label="选择订阅分组" value={groupId ?? '*'} options={[{ value: '*', label: `全部订阅 · ${count()} 篇` }, ...groups.map(g => ({ value: g.id, label: `${g.name} · ${count(g.id)} 篇` }))]} onChange={v => onGroup(v === '*' ? undefined : v)}/>{groupId !== undefined && !!groupItems(groupId).length && <RssMenu label="分组操作" className="rss-mobile-group-menu" items={groupItems(groupId)}/>}</div>
    <div className="rss-mobile-source"><Picker label="选择订阅源" value={feedId} options={[{ value: '', label: '全部来源' }, ...snapshot.feeds.filter(f => groupId === undefined || f.groupId === groupId).map(f => ({ value: f.id, label: f.name + (f.enabled ? '' : '（已暂停）') }))]} onChange={onFeed}/></div>
  </aside>;
}

export interface RssPanelProps { api: ClientPort; projects?: Project[]; onClose(): void; memory?: UiMemory; navigation?: React.ReactNode; notify?: Notify; embedded?: boolean; recentDays?: number; onModalState?(state: ModalState): void; onSettings?(): void }
/** 列表、编辑与阅读通过ModalFlow共用外层，支持嵌入工作台概览。 */
export function RssPanel({ api, onClose, memory, navigation: overviewNavigation, notify, embedded, recentDays, onModalState, onSettings }: RssPanelProps) {
  const remembered = panelMemory(memory ?? api, memory);
  const [snapshot, setSnapshot] = usePanelSnapshot<RssSnapshot>(api, 'rss');
  const [tab, setTab] = useState(recentDays === undefined ? remembered.tab : 'subscriptions');
  const [groupId, setGroupId] = useState<string | undefined>(recentDays === undefined ? remembered.groupId : undefined);
  const [feedId, setFeedId] = useState(recentDays === undefined ? remembered.feedId : '');
  const [query, setQuery] = useState(recentDays === undefined ? remembered.query : '');
  const [draft, setDraft] = useState<GroupDraft | undefined>(remembered.groupDraft);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ token: string; name: string; expiresAt: number }[]>([]);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [refreshRequests, setRefreshRequests] = useState(0);
  const records = useRef<HTMLDivElement>(null), navigation = useRef<HTMLDivElement>(null);
  const alive = useRef(true), request = useRef(0), savingGroup = useRef(false), writeBusy = useRef(false);
  const pendingGroupEdit = useRef<string | undefined>(undefined);
  const scrollRestore = useRef(true);
  const initialRecentView = useRef(recentDays !== undefined);
  const readingReturn = useRef<Detail | null>(null), origin = useRef<HTMLElement | null>(null);
  const [foldValues, setFoldValues] = useState<Record<string, boolean>>({});
  const foldWrites = useRef(new Map<string, { desired: boolean; saved: boolean }>());
  const snapshotRef = useRef(snapshot);
  const newFeedNavigation = useRef('');
  snapshotRef.current = snapshot;
  const applySnapshot = useCallback((value: RssSnapshot) => { snapshotRef.current = value; setSnapshot(value); }, [setSnapshot]);
  const load = useCallback(async () => {
    const revision = ++request.current;
    try {
      const data = await extensionCall<RssSnapshot>(api, 'rss', 'snapshot');
      if (alive.current && revision === request.current) applySnapshot(data);
    } catch (e) { if (alive.current && revision === request.current) setError(failure(e)); }
  }, [api, applySnapshot]);
  useEffect(() => {
    alive.current = true; void load();
    const off = api.subscribe(() => { void load(); });
    const timer = setInterval(() => { void load(); }, 5000);
    return () => { alive.current = false; request.current++; off(); clearInterval(timer); };
  }, [api, load]);
  useEffect(() => {
    Object.assign(remembered, { tab, groupId, feedId, query, groupDraft: draft });
    if (memory) {
      memory.extensions.rss = { tab, group: groupId === undefined ? '*' : groupId || 'ungrouped', search: query, scroll: remembered.scroll };
      memory.save();
    }
  }, [tab, groupId, feedId, query, draft, memory, remembered]);
  useEffect(() => {
    if (!snapshot) return;
    if (groupId && !snapshot.groups.some(g => g.id === groupId)) { setGroupId(undefined); setFeedId(''); }
    if (feedId && !snapshot.feeds.some(f => f.id === feedId)) setFeedId('');
    if (detail?.id && ['read', 'detail', 'edit', 'move'].includes(detail.kind) && !(detail.kind === 'read' ? snapshot.articles.some(a => a.id === detail.id) : snapshot.feeds.some(f => f.id === detail.id))) setDetail(null);
    if (scrollRestore.current) {
      if (records.current) records.current.scrollTop = initialRecentView.current ? 0 : remembered.scroll;
      const nav = navigation.current?.querySelector('[data-rss-navigation]');
      if (nav) nav.scrollTop = initialRecentView.current ? 0 : remembered.navigationScroll;
      initialRecentView.current = false;
      scrollRestore.current = false;
    }
  }, [snapshot, groupId, feedId, detail, tab, remembered]);
  useEffect(() => {
    if (detail) return;
    const frame = requestAnimationFrame(() => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [detail]);
  useEffect(() => {
    if (!newFeedNavigation.current || tab !== 'subscriptions' || feedId !== newFeedNavigation.current) return;
    const selected = navigation.current?.querySelector<HTMLElement>('[data-rss-selected="true"]');
    if (selected) { selected.scrollIntoView({ block: 'nearest' }); newFeedNavigation.current = ''; }
  }, [tab, feedId, snapshot, foldValues, detail]);
  useEffect(() => {
    if (snapshot) setUndo(snapshot.undo ?? []);
  }, [snapshot]);
  useEffect(() => {
    if (!undo.length) return;
    const timer = setTimeout(() => setUndo(items => items.filter(item => item.expiresAt > Date.now())), Math.max(0, Math.min(...undo.map(item => item.expiresAt)) - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);
  const rememberScroll = () => {
    if (records.current) remembered.scroll = records.current.scrollTop;
    remembered.navigationScroll = navigation.current?.querySelector('[data-rss-navigation]')?.scrollTop ?? remembered.navigationScroll;
    remembered.tabViews[tab] = { query, scroll: remembered.scroll };
    if (memory?.extensions.rss) { memory.extensions.rss.scroll = remembered.scroll; memory.save(); }
  };
  const open = (value: Detail) => { rememberScroll(); readingReturn.current = null; origin.current = document.activeElement as HTMLElement; setDetail(value); };
  const closeDetail = () => {
    setDetail(detail?.kind === 'read' ? readingReturn.current : null);
    readingReturn.current = null; scrollRestore.current = true;
  };
  const switchTab = (value: PanelMemory['tab']) => {
    rememberScroll(); setQuery(remembered.tabViews[value].query); remembered.scroll = remembered.tabViews[value].scroll;
    setTab(value); scrollRestore.current = true;
  };
  const selectGroup = (id?: string) => { setGroupId(id); setFeedId(''); if (records.current) records.current.scrollTop = 0; remembered.scroll = 0; };
  const selectFeed = (id: string) => { setFeedId(id); if (id) setGroupId(snapshot?.feeds.find(f => f.id === id)?.groupId); if (records.current) records.current.scrollTop = 0; remembered.scroll = 0; };
  const perform = async (method: string, input?: unknown) => {
    if (writeBusy.current) throw new Error('RSS 操作正在保存，请稍后重试');
    writeBusy.current = true; setBusy(true); setError('');
    try {
      const value = await extensionCall<unknown>(api, 'rss', method, input);
      if (!alive.current) throw new Error('RSS 面板已关闭');
      if (method === 'feed.remove') { setUndo(items => [...items, value as { token: string; name: string; expiresAt: number }]); setDetail(null); }
      const messages: Record<string, string> = {
        'feed.undo': '订阅及缓存已恢复', 'feed.create': '订阅已添加', 'feed.update': '订阅设置已保存',
        'group.create': '订阅分组已添加', 'group.update': '订阅分组设置已保存',
        'group.remove': '订阅分组已移除', move: '订阅顺序与分组已保存',
      };
      if (method === 'opml.import') notify?.(t(`已导入 ${(value as { imported: number }).imported} 项订阅`), 'success');
      else if (messages[method]) notify?.(messages[method]!, 'success');
      await load();
      return value;
    } catch (e) { if (alive.current) { setError(failure(e)); } throw e; }
    finally { writeBusy.current = false; if (alive.current) setBusy(false); }
  };
  const download = async (input?: unknown) => {
    try {
      const text = await extensionCall<string>(api, 'rss', 'opml.export', input);
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/x-opml;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'subscriptions.opml'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify?.('订阅导出已发起', 'success');
    } catch (e) { setError(failure(e)); }
  };
  const refresh = async (input?: unknown) => {
    setRefreshRequests(value => value + 1);
    try {
      const value = await extensionCall<RssRefreshResult>(api, 'rss', 'refresh', input);
      if (alive.current) { notify?.(t(`刷新完成 ${value.succeeded} · 失败 ${value.failed} · 取消 ${value.cancelled}`), value.failed || value.cancelled ? 'info' : 'success'); await load(); }
    } catch (e) { if (alive.current) setError(failure(e)); }
    finally { if (alive.current) setRefreshRequests(value => value - 1); }
  };
  // 折叠先在本地显示；同组只保留最新意图并串行落盘，不锁住导航或改名。
  const saveFold = (id: string, collapsed: boolean) => {
    const current = snapshotRef.current;
    const group = id ? current?.groups.find(value => value.id === id) : current && { collapsed: current.ungroupedCollapsed ?? false };
    if (!group) return;
    setFoldValues(values => ({ ...values, [id]: collapsed }));
    const pending = foldWrites.current.get(id);
    if (pending) { pending.desired = collapsed; return; }
    const write = { desired: collapsed, saved: !!group.collapsed };
    foldWrites.current.set(id, write);
    const applySaved = (value: boolean) => {
      const base = snapshotRef.current;
      if (!alive.current || !base) return;
      // 丢弃保存前发起的读取；只补已确认的折叠字段，不覆盖名称或其他组。
      request.current++;
      applySnapshot(id ? { ...base, groups: base.groups.map(valueGroup => valueGroup.id === id ? { ...valueGroup, collapsed: value } : valueGroup) }
        : { ...base, ungroupedCollapsed: value });
    };
    const finish = () => {
      foldWrites.current.delete(id);
      if (alive.current) {
        setFoldValues(values => { const next = { ...values }; delete next[id]; return next; });
        // 补读被旧请求保护丢弃的其他字段变更；界面无需等待这次读取。
        void load();
      }
    };
    void (async () => {
      for (;;) {
        const sent = write.desired;
        try {
          await extensionCall(api, 'rss', 'group.update', { id, collapsed: sent });
          write.saved = sent;
          applySaved(sent);
        } catch (e) {
          if (write.desired !== sent) continue;
          applySaved(write.saved);
          finish();
          if (alive.current) {
            if (notify) notify(failure(e), 'info');
            else setError(failure(e));
          }
          return;
        }
        if (write.desired === sent) { finish(); return; }
      }
    })();
  };
  const action = (method: string, input: unknown) => {
    if (method === 'group.update' && input && typeof input === 'object' && 'id' in input && typeof input.id === 'string'
      && 'collapsed' in input && typeof input.collapsed === 'boolean' && !('name' in input)) { saveFold(input.id, input.collapsed); return; }
    if (method === 'edit') { open({ kind: 'edit', id: input as string }); return; }
    if (method === 'move-picker') { open({ kind: 'move', id: input as string }); return; }
    if (method === 'opml.export') { void download(input); return; }
    if (method === 'refresh') { void refresh(input); return; }
    void perform(method, input).catch(() => {});
  };
  const finishGroup = async (cancel = false) => {
    const current = remembered.groupDraft;
    if (!current || savingGroup.current) return;
    if (cancel) { pendingGroupEdit.current = undefined; remembered.groupDraft = undefined; setDraft(undefined); return; }
    const name = current.value.trim();
    if (!name || name.length > 80 || snapshot?.groups.some(g => g.id !== current.id && g.name === name) || ['全部订阅', '默认分组', '未分组'].includes(name)) {
      pendingGroupEdit.current = undefined;
      setDraft({ ...current, error: '请输入不重复的分组名称（1–80 字符）。' }); return;
    }
    savingGroup.current = true;
    try {
      await extensionCall(api, 'rss', 'group.update', { id: current.id, name });
      if (alive.current) notify?.('分组名称已更新', 'success');
      remembered.groupDraft = undefined; setDraft(undefined); await load();
      const nextGroup = snapshot?.groups.find(group => group.id === pendingGroupEdit.current);
      pendingGroupEdit.current = undefined;
      if (alive.current && nextGroup) {
        const next = { id: nextGroup.id, value: nextGroup.name, error: '' };
        remembered.groupDraft = next; setDraft(next);
      }
    } catch (e) { pendingGroupEdit.current = undefined; setDraft({ ...current, error: failure(e) }); }
    finally { savingGroup.current = false; }
  };
  const editGroup = (id: string) => {
    const group = snapshot?.groups.find(g => g.id === id);
    if (!group) return;
    if (remembered.groupDraft && remembered.groupDraft.id !== id) {
      pendingGroupEdit.current = id;
      void finishGroup();
      return;
    }
    const next = { id, value: group.name, error: '' }; remembered.groupDraft = next; setDraft(next);
  };
  const addGroup = async () => {
    if (!snapshot || draft) return;
    let index = 1, name = '新分组';
    while (snapshot.groups.some(g => g.name === name)) name = `新分组 ${++index}`;
    try {
      const group = await perform('group.create', { name }) as { id: string } | undefined;
      if (group) { const next = { id: group.id, value: name, error: '' }; remembered.groupDraft = next; setDraft(next); setGroupId(group.id); setFeedId(''); }
    } catch { /* Error already reported; no draft for an uncommitted group. */ }
  };
  const source = snapshot?.feeds.find(f => f.id === detail?.id);
  const article = snapshot?.articles.find(a => a.id === detail?.id);
  const scoped = snapshot?.feeds.find(f => f.id === feedId);
  const loading = !snapshot, refreshing = refreshRequests > 0 || !!snapshot?.refreshing.length;
  const scope = scoped?.name || snapshot?.groups.find(g => g.id === groupId)?.name || (groupId === '' ? '默认分组' : '全部文章');
  return <ModalFlow embedded={embedded} onModalState={onModalState} main={
    <Modal title="工作台概览" drawer className="stats-drawer" busy={busy} onClose={() => { rememberScroll(); onClose(); }}>
      <div className="settings-layout">{overviewNavigation}<div className="settings-content"><section className="settings-panel"><div className="integration-manager" data-integration="rss" data-rss-reading={tab === 'subscriptions' ? '' : undefined}>
        <div className="integration-heading"><h3>RSS 订阅</h3>{tab === 'subscriptions' && <button type="button" disabled={loading} onClick={() => void download()}><Icon name="archive"/>导出订阅</button>}<button type="button" className="primary" onClick={() => open({ kind: 'create' })}><Icon name="plus"/>添加订阅</button>
          {onSettings && <IconButton name="settings" label="订阅设置" outlined disabled={busy} onClick={() => { rememberScroll(); onSettings(); }}/>}</div>
        <p className="integration-caption">按分组管理订阅，阅读最新文章，发现推荐来源。</p>
        <div className="settings-subtabs" role="tablist" aria-label="RSS 订阅二级菜单">{(['subscriptions', 'catalog'] as const).map((value, index) => <button type="button" role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => switchTab(value)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'subscriptions' : e.key === 'End' ? 'catalog' : index ? 'subscriptions' : 'catalog'; switchTab(next); (e.currentTarget.parentElement?.children[next === 'catalog' ? 1 : 0] as HTMLElement)?.focus(); } }}>{value === 'subscriptions' ? '我的订阅' : '推荐订阅'}</button>)}</div>
        {error && <p className="integration-form-error" role="alert">{errorText(error)}<button type="button" onClick={() => { setError(''); void load(); }}>重新读取</button></p>}
        {undo.map(item => <div className="integration-status-line" role="status" key={item.token}>已取消订阅「{item.name}」，30 秒内可撤销。<button type="button" disabled={busy} onClick={() => void perform('feed.undo', { token: item.token }).catch(() => {})}>撤销</button></div>)}
        {loading ? <div className="integration-empty" role="status">正在读取订阅…</div> : <div className="integration-workspace" data-grouped={tab === 'subscriptions' ? 'true' : 'false'}>
          {tab === 'subscriptions' && <div ref={navigation} style={{ display: 'contents' }}><RssNavigation snapshot={{ ...snapshot,
            articles: recentDays !== undefined ? rssRecentArticles(snapshot, recentDays) : snapshot.articles,
            groups: snapshot.groups.map(group => ({ ...group, collapsed: foldValues[group.id] ?? group.collapsed })),
            ungroupedCollapsed: foldValues[''] ?? snapshot.ungroupedCollapsed }} groupId={groupId} feedId={feedId} draft={draft} onGroup={selectGroup} onFeed={selectFeed} onEdit={editGroup}
            onDraft={value => { if (draft) { const next = { ...draft, value, error: '' }; remembered.groupDraft = next; setDraft(next); } }} onFinish={cancel => void finishGroup(cancel)} onAdd={() => void addGroup()} onAction={action} onMove={input => action('move', input)}
            onRenameFeed={(feed, name) => perform('feed.update', { id: feed.id, revision: feed.revision, name })}/></div>}
          <div className="integration-main"><div className={tab === 'subscriptions' ? 'rss-toolbar' : 'integration-toolbar'}><label className="stats-group-search"><Icon name="search"/><input type="search" aria-label={`搜索${scope}的标题、摘要和来源`} placeholder={tab === 'subscriptions' ? '搜索标题、摘要、来源' : '搜索推荐来源'} value={query} onChange={e => setQuery(e.target.value)}/></label>{tab === 'subscriptions' && <><button type="button" aria-busy={refreshing} disabled={refreshing} title="刷新当前范围文章" aria-label="刷新当前范围文章" onClick={() => void refresh({ ...(groupId !== undefined ? { groupId } : {}), ...(feedId ? { feedId } : {}) })}><Icon name="refresh"/></button>{scoped && <RssMenu label={`${scoped.name}的订阅操作`} className="" items={feedItems(scoped, snapshot, action, input => action('move', input))}/>}</>}</div>
            <div className="integration-records" tabIndex={0} ref={records} aria-label="订阅文章列表" onScroll={rememberScroll}>
              {tab === 'subscriptions' ? <RssArticleList snapshot={snapshot} query={{ groupId, feedId, query }} recentDays={recentDays} onRead={a => open({ kind: 'read', id: a.id })} onFeed={selectFeed}/> : snapshot.recommendations.filter(r => (r.name + ' ' + t(r.description)).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(r => <Recommendation key={r.id} value={r} subscribed={snapshot.feeds.some(f => f.url === r.url)} onAdd={() => { remembered.drafts.create = { ...blankDraft(), name: r.name, url: r.url }; open({ kind: 'create', recommendation: true }); }}/>)}
            </div>
          </div>
        </div>}
      </div></section></div></div>
    </Modal>
    } detail={detail && snapshot && <Modal title={detail.kind === 'read' ? article?.title ?? '文章' : detail.kind === 'move' ? '移动订阅' : source?.name ?? '添加订阅'} drawer className="stats-drawer" busy={busy} onClose={closeDetail} leading={<IconButton name="back" label="返回" disabled={busy} onClick={closeDetail}/>}>
      <div className="settings-layout"><section className="integration-detail">
      {detail.kind === 'read' && article ? <RssReading key={article.id} api={api} article={article} feed={snapshot.feeds.find(f => f.id === article.feedId)}/> : detail.kind === 'move' && source ? <><div className="integration-detail-body"><Picker label="移动到分组" value={source.groupId} options={rssNavigationGroups(snapshot).map(g => ({ value: g.id, label: g.name }))} onChange={value => { void perform('move', { kind: 'feed', id: source.id, groupId: value }).then(() => closeDetail()).catch(() => {}); }}/></div></> : <RssEditor key={`${detail.id ?? 'add'}:${editorEpoch}`} api={api} snapshot={snapshot} detail={detail} source={source} remembered={remembered} busy={busy} onMode={kind => setDetail({ ...detail, kind })} onSave={async (method, input) => {
        const saved = await perform(method, input);
        if (method === 'opml.import') { remembered.importText = ''; remembered.importGroup = ''; setEditorEpoch(value => value + 1); closeDetail(); }
        else if (saved) {
          const feed = saved as RssFeed;
          delete remembered.drafts[detail.id ?? 'create']; setEditorEpoch(value => value + 1);
          if (method === 'feed.create') {
            // 使用保存结果定位，避免旧快照或旧筛选隐藏刚添加的来源。
            const base = snapshotRef.current;
            if (base && !base.feeds.some(value => value.id === feed.id)) applySnapshot({ ...base, feeds: [...base.feeds, feed] });
            switchTab('subscriptions'); setGroupId(feed.groupId); setFeedId(feed.id); setQuery('');
            newFeedNavigation.current = feed.id;
            const collapsed = foldValues[feed.groupId] ?? (feed.groupId
              ? base?.groups.find(group => group.id === feed.groupId)?.collapsed : base?.ungroupedCollapsed);
            if (collapsed) saveFold(feed.groupId, false);
            remembered.scroll = 0; remembered.tabViews.subscriptions = { query: '', scroll: 0 };
            if (records.current) records.current.scrollTop = 0;
            closeDetail(); void refresh({ feedId: feed.id });
          } else setDetail({ kind: 'detail', id: feed.id });
        }
      }} onCancel={detail.kind === 'edit' ? () => setDetail({ kind: 'detail', id: source?.id }) : closeDetail} onRead={id => { readingReturn.current = detail; setDetail({ kind: 'read', id }); }} onAction={action}/>}
      </section></div>
    </Modal>}
  />;
}
function Recommendation({ value, subscribed, onAdd }: { value: RssRecommendation; subscribed: boolean; onAdd(): void }) {
  return <article className="integration-record"><div className="integration-record-icon"><Icon name="rss"/></div><div className="integration-record-copy"><div className="integration-record-title"><button type="button" onClick={onAdd}>{value.name}</button></div><p title={t(value.attribution)}>{t(value.description)}</p><small>{t(value.attribution)}</small></div><div className="integration-record-actions"><button type="button" disabled={subscribed} onClick={onAdd}>{subscribed ? '已订阅' : '添加'}</button></div></article>;
}

function RssEditor({ api, snapshot, detail, source, remembered, busy, onMode, onSave, onCancel, onRead, onAction }: {
  api: ClientPort; snapshot: RssSnapshot; detail: Detail; source?: RssFeed; remembered: PanelMemory; busy: boolean;
  onMode(kind: Detail['kind']): void; onSave(method: string, input: unknown): Promise<void>; onCancel(): void;
  onRead(id: string): void; onAction(method: string, input: unknown): void;
}) {
  const key = detail.id ?? 'create';
  const [draft, setDraft] = useState<FeedDraft>(() => remembered.drafts[key] ?? (source ? { ...source } : blankDraft()));
  const [text, setText] = useState(remembered.importText), [defaultGroup, setDefaultGroup] = useState(() => remembered.importText ? remembered.importGroup : '');
  const [preview, setPreview] = useState<RssOpmlPreview | null>(null), [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const [readingFile, setReadingFile] = useState(false), [previewVersion, setPreviewVersion] = useState(0);
  const generation = useRef(0), fileGeneration = useRef(0), alive = useRef(true), file = useRef<HTMLInputElement>(null), submitting = useRef(false);
  useEffect(() => { remembered.drafts[key] = draft; }, [draft, key, remembered]);
  useEffect(() => { remembered.importText = text; remembered.importGroup = defaultGroup; }, [text, defaultGroup, remembered]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; fileGeneration.current++; };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    setPreview(null); setSelected([]);
    if (detail.kind !== 'import' || !text.trim()) { setPreview(null); setPending(false); return; }
    setPending(true);
    const timer = setTimeout(() => {
      void extensionCall<RssOpmlPreview>(api, 'rss', 'opml.preview', { text, defaultGroup }).then(value => {
        if (alive.current && current === generation.current) { setPreview(value); setSelected(value.candidates.filter(c => !c.error && !c.duplicate).map(c => c.index)); setError(''); }
      }, e => { if (alive.current && current === generation.current) { setError(failure(e)); setPreview(null); } })
        .finally(() => { if (alive.current && current === generation.current) setPending(false); });
    }, 200);
    return () => { clearTimeout(timer); generation.current++; };
  }, [text, defaultGroup, detail.kind, api, previewVersion]);
  const readFile = async (value?: File) => {
    if (!value) return;
    const current = ++fileGeneration.current;
    generation.current++; setPreview(null); setSelected([]); setPending(false); setReadingFile(false);
    if (value.size > RSS_LIMITS.responseBytes || !/\.(opml|xml)$/i.test(value.name)) { setError('请选择最大 2 MB 的 .opml 或 .xml 文件'); return; }
    setReadingFile(true);
    try {
      const content = await value.text();
      if (alive.current && current === fileGeneration.current) { setText(content); setPreviewVersion(v => v + 1); setError(''); }
    } catch { if (alive.current && current === fileGeneration.current) setError('文件读取失败，原草稿已保留'); }
    finally { if (alive.current && current === fileGeneration.current) setReadingFile(false); }
  };
  const submit = async () => {
    if (submitting.current || busy || pending || readingFile) return;
    submitting.current = true;
    setError('');
    try {
      if (detail.kind === 'import') await onSave('opml.import', { text, defaultGroup, selected });
      else await onSave(source ? 'feed.update' : 'feed.create', { ...draft, ...(source ? { id: source.id, revision: draft.revision } : {}) });
    } catch (e) { if (alive.current) setError(failure(e)); }
    finally { submitting.current = false; }
  };
  const input = (field: 'name' | 'url', label: string) => <FormField label={label}><input required value={draft[field]} type={field === 'url' ? 'url' : 'text'} maxLength={field === 'url' ? 2048 : 80} placeholder={field === 'url' ? 'https://example.com/feed.xml' : undefined} aria-label={field === 'name' ? '名称' : 'RSS / Atom 地址'} disabled={busy} onChange={e => setDraft({ ...draft, [field]: e.target.value })}/></FormField>;
  const privateAddress = (() => {
    try {
      const hostname = new URL(draft.url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return /^(?:localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|f[cd][\da-f]{2}:|fe80:)/.test(hostname)
        || /\.(?:localhost|local|lan)$/.test(hostname);
    } catch { return false; }
  })();
  const showTrust = draft.trusted || privateAddress || /内网|回环|私网|私有|保留地址|private/i.test(error);
  const adding = !source;
  const editing = detail.kind !== 'detail';
  const switchMode = (kind: 'create' | 'import') => {
    generation.current++; fileGeneration.current++;
    setReadingFile(false); setPending(false); setError(''); onMode(kind);
  };
  const showAddNavigation = adding && !detail.recommendation;
  return <div className="integration-detail-layout" data-single={showAddNavigation ? 'false' : 'true'}>
    {showAddNavigation && <nav className="integration-detail-nav" role="tablist" aria-label="添加订阅方式" onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || busy) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 'create' : e.key === 'End' ? 'import' : detail.kind === 'create' ? 'import' : 'create';
      switchMode(next); document.getElementById(`integration-rss-add-${next}`)?.focus();
    }}>{(['create', 'import'] as const).map(kind => <button type="button" id={`integration-rss-add-${kind}`} role="tab" aria-controls="integration-rss-add-pane" tabIndex={detail.kind === kind ? 0 : -1} aria-selected={detail.kind === kind} key={kind} disabled={busy} onClick={() => switchMode(kind)}><Icon name={kind === 'create' ? 'rss' : 'archive'}/>{kind === 'create' ? '添加订阅' : '导入订阅'}</button>)}</nav>}
    <div className="integration-detail-main">
      {source && <div className="todo-detail-summary"><div className="todo-detail-meta"><span>{source.enabled ? '已启用' : '已暂停更新'}</span><span>{snapshot.groups.find(g => g.id === source.groupId)?.name ?? '默认分组'}</span><span>{source.checkedAt ? `检查 ${time(source.checkedAt)}` : '尚未检查'}</span>{source.trusted && <span>可信内网源</span>}{!editing && <><button type="button" disabled={!source.enabled || snapshot.refreshing.includes(source.id)} onClick={() => onAction('refresh', { feedId: source.id })}>刷新</button><button type="button" onClick={() => onAction('opml.export', { feedId: source.id })}>导出此来源</button></>}</div></div>}
      <div className="integration-detail-body" id={showAddNavigation ? 'integration-rss-add-pane' : undefined} role={showAddNavigation ? 'tabpanel' : undefined} aria-labelledby={showAddNavigation ? `integration-rss-add-${detail.kind}` : undefined}>
        {detail.kind === 'import' ? <>
          <div className="integration-upload"><Icon name="archive"/><div><strong>选择 OPML 文件或粘贴订阅内容</strong><p className="integration-help">最大 2 MB，不覆盖已有订阅。</p></div><button type="button" disabled={busy} onClick={() => file.current?.click()}>选择文件</button><input ref={file} type="file" accept=".opml,.xml" hidden onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/></div>
          <label><div className="field">OPML 内容</div><textarea aria-label="OPML 内容" value={text} disabled={busy} onChange={e => { generation.current++; fileGeneration.current++; setReadingFile(false); setPreview(null); setText(e.target.value); }}/></label>
          <div className="field">默认分组</div><Picker label="导入默认分组" value={defaultGroup} options={[{ value: '', label: '默认分组' }, ...snapshot.groups.map(g => ({ value: g.name, label: g.name }))]} onChange={setDefaultGroup} disabled={busy}/>
          {(pending || readingFile) && <p className="integration-help" role="status">正在读取／预览…</p>}
          {preview && <div className="integration-import-items"><p className="integration-help">可导入 {preview.valid} 项 · 重复 {preview.duplicate} 项 · 无效 {preview.invalid} 项</p>{preview.candidates.map(c => <label className="setting-row" key={c.index}><div><strong>{c.name}</strong><small>{c.url} · 分组：{!c.groupName || ['未分组', '默认分组'].includes(c.groupName) ? t('默认分组') : c.groupName}{c.error ? ` · ${errorText(c.error)}` : c.duplicate ? ' · 已存在，跳过' : ''}</small></div><input type="checkbox" aria-label={`导入 ${c.name}`} checked={selected.includes(c.index)} disabled={!!c.error || c.duplicate || busy || pending} onChange={e => setSelected(e.target.checked ? [...selected, c.index] : selected.filter(i => i !== c.index))}/></label>)}</div>}
        </> : editing ? <div className="integration-form-grid">{input('name', '订阅名称')}<FormField label="分组"><Picker label="订阅分组" value={draft.groupId} options={[{ value: '', label: '默认分组' }, ...snapshot.groups.map(g => ({ value: g.id, label: g.name }))]} disabled={busy} onChange={value => setDraft({ ...draft, groupId: value })}/></FormField>
          <div className="integration-span">{input('url', '订阅地址')}</div>
          {showTrust && <label className="setting-row integration-span"><div><strong>可信内网源</strong><small>显式允许此地址的内网／本机访问；跨源重定向仍检查私网。仅对可信来源开启。</small></div><input type="checkbox" checked={draft.trusted} disabled={busy} onChange={e => setDraft({ ...draft, trusted: e.target.checked })}/></label>}
        </div> : <><p className="integration-help">{source?.url}</p>{source?.error && <p className="integration-form-error" role="alert">{statusText(source.error)}</p>}<h3>最近文章</h3>{snapshot.articles.filter(a => a.feedId === source?.id).slice(0, 20).map(a => <div key={a.id} className="integration-record"><button type="button" className="rss-article-open" onClick={() => onRead(a.id)}>{a.title}</button></div>)}</>}
        {error && <p className="integration-form-error" role="alert">{errorText(error)}{source && <button type="button" onClick={() => { setDraft({ ...draft, revision: source.revision }); setError('已重新读取版本，草稿保留，请核对后保存'); }}>读取最新版本</button>}</p>}
      </div>
      <footer className="dialog-footer">{editing ? <>{(source || detail.kind === 'import') && <button type="button" disabled={busy} onClick={onCancel}>取消</button>}<button type="button" className="primary" disabled={busy || pending || readingFile || detail.kind === 'import' && (!preview || !selected.length)} onClick={() => void submit()}>{busy ? '正在保存…' : detail.kind === 'import' ? '导入订阅' : source ? '保存订阅' : '添加订阅'}</button></> : <><button type="button" disabled={busy} onClick={() => onMode('edit')}>编辑订阅</button><button type="button" className="danger" disabled={busy} onClick={() => onAction('feed.remove', { id: source!.id })}>取消订阅</button></>}</footer>
    </div>
  </div>;
}
