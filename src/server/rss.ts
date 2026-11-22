import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  RSS_LIMITS, RSS_RECOMMENDATIONS, safeRssUrl, rssOriginalUrl, rssNavigationGroups, rssRecentArticles, type RssConfig, type RssFeed, type RssArticle,
  type RssArticleQuery, type RssIncrementalQuery, type RssSnapshot, type RssSummary, type RssRefreshResult,
} from '../shared/rss.js';
import { fetchRss } from './rss-network.js';
import { parseRss, previewOpml, exportOpml } from './rss-parser.js';
import { extractRssContent } from './rss-content.js';
import { RssStore, emptyRssState, expireRssUndo, boundRssCache, rssFeedIn, rssArticleIn, type RssStoredState } from './rss-store.js';

/**
 * Host evidence, read-only inspection 2026-11-20:
 * app.asar /dsh/node_modules/@deepseek-ai/dsh-web-fetch-http (0.2.2-rc.5)
 * exports HttpFetchProvider via ctx.web; requestOnce uses global undici transport,
 * permits private networks, same-origin redirects only, readCapped truncates XML.
 * No official RSS/feed package found in the ASAR package inventory.
 * desktop node_modules/dsh-rss (0.11.4), lib/index.d.ts and lib/web.d.ts:
 * community plugin owns settings/tools and /api/dsh-rss/subscriptions; no official service.
 * Its subscriptions/cursors must not be silently reused or changed.
 * These are not equivalent safe raw RSS transports. Use pinned standalone transport.
 * A future official equivalent must be contract-verified before wiring, not tried after failure.
 */
export const RSS_HOST_EVIDENCE = {
  inspectedAt: '2026-11-20', nativeRss: false,
  http: { package: '@deepseek-ai/dsh-web-fetch-http', version: '0.2.2-rc.5', equivalent: false,
    reasons: ['private networks allowed', 'same-origin redirects only', 'response truncation', 'no caller DNS pinning policy'] },
  community: { package: 'dsh-rss', version: '0.11.4', independentOwnership: true },
} as const;

export interface RssManagerOptions {
  /** Absolute, resolved host home, not a profile subscriptions directory. One manager per home. */
  home: string;
  getConfig(): RssConfig;
  onChange?(): void;
  limits?: Partial<{ articles: number; perFeed: number; cacheBytes: number; concurrency: number; timeoutMs: number }>;
}
const idInput = z.object({ id: z.string().min(1) });
const nameSchema = z.string().trim().min(1, '请填写名称').max(80, '名称最多 80 字符');
const feedCreate = z.object({ name: nameSchema, url: z.string(), groupId: z.string().default(''), enabled: z.boolean().default(true), trusted: z.boolean().default(false) });
const feedUpdate = z.object({
  id: z.string().min(1), revision: z.number().int().nonnegative(),
  name: nameSchema.optional(), url: z.string().optional(), groupId: z.string().optional(),
  enabled: z.boolean().optional(), trusted: z.boolean().optional(),
});
const querySchema = z.object({
  feedId: z.string().optional(), groupId: z.string().optional(), query: z.string().max(1000).optional(),
  limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().nonnegative().max(100_000).optional(),
});
const message = (error: unknown) => (error instanceof Error ? error.message : 'RSS 操作失败').slice(0, 1000);
type ArticleJob = { controller: AbortController; promise: Promise<RssArticle>; consumers: number };

export class RssManager {
  private readonly store: RssStore;
  private state = emptyRssState();
  private readonly initialized: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private jobs = new Map<string, { controller: AbortController; promise: Promise<'success' | 'failed' | 'cancelled'> }>();
  private articleJobs = new Map<string, ArticleJob>();
  private active = 0;
  private waiters: (() => void)[] = [];
  private readonly limits: { articles: number; perFeed: number; cacheBytes: number; concurrency: number; timeoutMs: number };

  constructor(private readonly options: RssManagerOptions) {
    if (!isAbsolute(options.home)) throw new Error('RssManager home 必须是绝对路径');
    this.store = new RssStore(options.home);
    this.limits = { ...RSS_LIMITS, ...options.limits };
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`RSS 容量参数无效：${key}`);
    if (this.limits.articles > RSS_LIMITS.articles || this.limits.cacheBytes > RSS_LIMITS.cacheBytes || this.limits.concurrency > 16) throw new Error('RSS 容量超过硬性上限');
    this.initialized = this.store.load().then(state => {
      this.state = state;
      if (!this.disposed) {
        this.timer = setInterval(() => { void this.tick().catch(() => {}); }, 10_000);
        this.timer.unref();
      }
    });
    // Consumers see ready()/handle() errors; eager construction never leaks an unhandled rejection.
    void this.initialized.catch(() => {});
  }
  async ready() { await this.initialized; }
  private notify() { try { this.options.onChange?.(); } catch { /* Observer errors do not undo a committed transaction. */ } }
  private async transaction<T>(change: (state: RssStoredState) => T, signal?: AbortSignal): Promise<T> {
    const run = this.queue.then(async () => {
      await this.ready();
      if (this.disposed) throw new Error('RSS Manager 已关闭');
      if (signal?.aborted) throw new Error('RSS 操作已取消');
      const next = structuredClone(this.state);
      expireRssUndo(next, Date.now());
      const value = change(next);
      boundRssCache(next, this.limits);
      next.config.revision++;
      await this.store.save(next);
      this.state = next;
      this.notify();
      return structuredClone(value);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  private group(state: RssStoredState, id: string) {
    const group = state.config.groups.find(g => g.id === id);
    if (!group) throw new Error('分组不存在');
    return group;
  }
  private validGroup(state: RssStoredState, id: string) { if (id) this.group(state, id); }
  private uniqueName(state: RssStoredState, name: string, id = '') {
    if (['默认分组', '未分组', '全部订阅'].includes(name) || state.config.groups.some(g => g.id !== id && g.name === name)) throw new Error('分组名称重复或保留');
  }
  private uniqueUrl(state: RssStoredState, raw: string, id = '') {
    const url = safeRssUrl(raw);
    if (!url) throw new Error('RSS URL 无效，仅允许无凭据的 HTTP/HTTPS');
    if (state.config.feeds.some(f => f.id !== id && f.url === url)) throw new Error('订阅地址重复');
    return url;
  }
  private createFeed(state: RssStoredState, input: z.infer<typeof feedCreate>) {
    if (state.config.feeds.length >= RSS_LIMITS.feeds) throw new Error('订阅数量超过上限');
    this.validGroup(state, input.groupId);
    const feed: RssFeed = { ...input, url: this.uniqueUrl(state, input.url), id: randomUUID(), revision: 1, installedAt: Date.now() };
    state.config.feeds.push(feed);
    return feed;
  }
  async snapshot(): Promise<RssSnapshot> {
    await this.ready(); await this.queue;
    return structuredClone({ revision: this.state.config.revision, feeds: this.state.config.feeds, groups: this.state.config.groups,
      ungroupedCollapsed: this.state.config.ungroupedCollapsed,
      ungroupedPosition: this.state.config.ungroupedPosition,
      undo: this.state.config.undo.filter(item => item.expiresAt > Date.now()).map(item => ({ token: item.token, name: item.feed.name, expiresAt: item.expiresAt })),
      articles: this.state.cache.articles, refreshing: [...this.jobs.keys()], summary: this.currentSummary(), recommendations: [...RSS_RECOMMENDATIONS] });
  }
  private currentSummary(): RssSummary {
    const feeds = this.state.config.feeds;
    return { total: feeds.length, enabled: feeds.filter(f => f.enabled).length, failed: feeds.filter(f => f.error).length,
      articles: this.state.cache.articles.length, checkedAt: Math.max(0, ...feeds.map(f => f.checkedAt ?? 0)) || null };
  }
  async summary(input: unknown = {}): Promise<{ count: number; detail: string; errors: number }> {
    const { days } = z.object({ days: z.number().int().min(1).max(365).default(7) }).parse(input);
    await this.ready(); await this.queue;
    const feeds = this.state.config.feeds.filter(feed => feed.enabled);
    const count = rssRecentArticles({ feeds, articles: this.state.cache.articles }, days).length;
    const errors = feeds.filter(feed => feed.error).length;
    const unchecked = feeds.filter(feed => !feed.checkedAt).length;
    return { count, detail: `最近 ${days} 天发布的已缓存文章${unchecked ? ` · ${unchecked} 个来源尚未刷新` : ''}${errors ? ` · 异常 ${errors}` : ''}`, errors };
  }
  async listFeeds() { return (await this.snapshot()).feeds; }
  async readArticle(id: string) { await this.ready(); await this.queue; return structuredClone(rssArticleIn(this.state, z.string().min(1).parse(id))); }
  /** 详情显式请求时才补齐正文；缓存读取及订阅刷新不触发原文抓取。 */
  async fetchArticle(id: string, signal?: AbortSignal): Promise<RssArticle> {
    const article = await this.readArticle(id);
    if (this.disposed) throw new Error('RSS Manager 已关闭');
    if (signal?.aborted) throw new Error('RSS 抓取已取消');
    if (article.body && (article.bodySource !== 'original' || article.bodyContent)) return article;
    const existing = this.articleJobs.get(id);
    if (existing && !existing.controller.signal.aborted) return this.consumeArticle(id, existing, signal);
    const feed = { ...rssFeedIn(this.state, article.feedId) };
    const url = rssOriginalUrl(article, feed);
    if (!url) throw new Error('暂无有效原文链接');
    const controller = new AbortController();
    const promise = (async () => {
      let acquired = false;
      try {
        await this.slot(controller.signal); acquired = true;
        // 内网许可仅限订阅同源原文，不传播到跨域文章及重定向。
        const trusted = feed.trusted && new URL(url).origin === new URL(feed.url).origin;
        const response = await fetchRss(url, { signal: controller.signal, trusted, timeoutMs: this.limits.timeoutMs, accept: 'text/html,application/xhtml+xml' });
        const content = extractRssContent(response.text, response.url);
        return await this.transaction(state => {
          const current = rssArticleIn(state, id), source = rssFeedIn(state, article.feedId);
          if (source.url !== feed.url || source.trusted !== feed.trusted || current.url !== article.url
            || current.title !== article.title || current.summary !== article.summary || current.sequence !== article.sequence) throw new Error('文章或订阅已变化，请重新读取');
          if (!current.body || (current.bodySource === 'original' && !current.bodyContent)) {
            current.body = content.text; current.bodyContent = content.nodes; current.bodySource = 'original';
          }
          boundRssCache(state, this.limits);
          if (!state.cache.articles.some(value => value.id === id)) throw new Error('正文缓存容量不足，请打开原文阅读');
          return current;
        }, controller.signal);
      } finally {
        if (acquired) { this.active--; this.waiters.shift()?.(); }
        // An abandoned request may finish after its replacement has joined the slot queue.
        if (this.articleJobs.get(id)?.controller === controller) this.articleJobs.delete(id);
      }
    })();
    const job: ArticleJob = { controller, promise, consumers: 0 };
    this.articleJobs.set(id, job);
    return this.consumeArticle(id, job, signal);
  }
  private consumeArticle(id: string, job: ArticleJob, signal?: AbortSignal): Promise<RssArticle> {
    job.consumers++;
    return new Promise<RssArticle>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, article?: RssArticle) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        job.consumers--;
        if (!job.consumers && this.articleJobs.get(id) === job)
          job.controller.abort(new Error('RSS 抓取已取消'));
        if (article) resolve(structuredClone(article));
        else reject(error);
      };
      const cancel = () => finish(new Error('RSS 抓取已取消'));
      signal?.addEventListener('abort', cancel, { once: true });
      void job.promise.then(article => finish(undefined, article), error => finish(error));
      if (signal?.aborted) cancel();
    });
  }
  private articles(state: RssStoredState, input: RssArticleQuery) {
    const query = querySchema.parse(input), terms = (query.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const feeds = new Map(state.config.feeds.filter(f => (!query.feedId || f.id === query.feedId) && (query.groupId === undefined || f.groupId === query.groupId)).map(f => [f.id, f]));
    return state.cache.articles.filter(a => feeds.has(a.feedId) && terms.every(term => (a.title + ' ' + a.summary + ' ' + feeds.get(a.feedId)!.name).toLocaleLowerCase().includes(term)));
  }
  async searchArticles(input: RssArticleQuery = {}) {
    await this.ready(); await this.queue;
    const query = querySchema.parse(input), articles = this.articles(this.state, query).sort((a, b) => b.publishedAt - a.publishedAt || b.sequence - a.sequence);
    return structuredClone({ total: articles.length, articles: articles.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 100)) });
  }
  /** Explicit incremental read advances ONLY this scope+filter cursor, never the UI reading state. */
  async readIncremental(input: RssIncrementalQuery, signal?: AbortSignal) {
    const query = querySchema.extend({ scope: z.string().min(1).max(500) }).parse(input);
    const key = createHash('sha256').update(JSON.stringify([query.scope, query.feedId ?? null, query.groupId ?? null, query.query ?? ''])).digest('hex');
    return this.transaction(state => {
      const cursor = state.config.cursors[key]?.sequence ?? 0;
      const matches = this.articles(state, query).filter(a => a.sequence > cursor).sort((a, b) => a.sequence - b.sequence);
      const articles = matches.slice(0, query.limit ?? 100);
      const next = articles.at(-1)?.sequence ?? cursor;
      state.config.cursors[key] = { sequence: next, touchedAt: Date.now() };
      const cursors = Object.entries(state.config.cursors).sort((a, b) => b[1].touchedAt - a[1].touchedAt).slice(0, 1000);
      state.config.cursors = Object.fromEntries(cursors);
      return { articles, cursor: next, hasMore: matches.length > articles.length };
    }, signal);
  }
  async handle(method: string, input: unknown = {}, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new Error('RSS 操作已取消');
    const transaction = <T,>(change: (state: RssStoredState) => T) => this.transaction(change, signal);
    switch (method) {
      case 'snapshot': return this.snapshot();
      case 'summary': return this.summary(input);
      case 'feeds': return this.listFeeds();
      case 'articles': return this.searchArticles(querySchema.parse(input));
      case 'article': return this.readArticle(idInput.parse(input).id);
      case 'article.fetch': return this.fetchArticle(idInput.parse(input).id, signal);
      case 'articles.incremental': return this.readIncremental(input as RssIncrementalQuery, signal);
      case 'recommendations': return structuredClone(RSS_RECOMMENDATIONS);
      case 'group.create': {
        const { name } = z.object({ name: nameSchema }).parse(input);
        return transaction(state => {
          this.uniqueName(state, name);
          if (state.config.groups.length >= RSS_LIMITS.groups) throw new Error('分组数量超过上限');
          const group = { id: randomUUID(), name, collapsed: false };
          state.config.groups.push(group); return group;
        });
      }
      case 'group.update': {
        const data = z.object({ id: z.string(), name: nameSchema.optional(), collapsed: z.boolean().optional() }).parse(input);
        return transaction(state => {
          if (!data.id) {
            if (data.name !== undefined) throw new Error('默认分组不能重命名');
            if (data.collapsed !== undefined) state.config.ungroupedCollapsed = data.collapsed;
            return { id: '', name: '默认分组', collapsed: state.config.ungroupedCollapsed };
          }
          const group = this.group(state, data.id);
          if (data.name !== undefined) { this.uniqueName(state, data.name, data.id); group.name = data.name; }
          if (data.collapsed !== undefined) group.collapsed = data.collapsed;
          return group;
        });
      }
      case 'group.remove': {
        const { id } = idInput.parse(input);
        return transaction(state => {
          this.group(state, id);
          if (state.config.groups.findIndex(g => g.id === id) < state.config.ungroupedPosition) state.config.ungroupedPosition--;
          state.config.groups = state.config.groups.filter(g => g.id !== id);
          for (const feed of state.config.feeds) if (feed.groupId === id) { feed.groupId = ''; feed.revision++; }
          return { removed: true };
        });
      }
      case 'feed.create': return transaction(state => this.createFeed(state, feedCreate.parse(input)));
      case 'feed.update': {
        const data = feedUpdate.parse(input);
        const articleIds = (await this.snapshot()).articles.filter(a => a.feedId === data.id).map(a => a.id);
        const result = await transaction(state => {
          const feed = rssFeedIn(state, data.id);
          if (feed.revision !== data.revision) throw new Error('订阅版本已变化，请重新读取后保存');
          if (data.url !== undefined) {
            const url = this.uniqueUrl(state, data.url, data.id);
            if (url !== feed.url) {
              feed.url = url; delete feed.etag; delete feed.lastModified; delete feed.checkedAt; delete feed.error;
              state.cache.articles = state.cache.articles.filter(a => a.feedId !== feed.id);
            }
          }
          if (data.groupId !== undefined) { this.validGroup(state, data.groupId); feed.groupId = data.groupId; }
          if (data.name !== undefined) feed.name = data.name;
          if (data.enabled !== undefined) feed.enabled = data.enabled;
          if (data.trusted !== undefined) { feed.trusted = data.trusted; delete feed.etag; delete feed.lastModified; }
          feed.revision++;
          return feed;
        });
        this.jobs.get(data.id)?.controller.abort(new Error('订阅已编辑，抓取已取消'));
        for (const id of articleIds) this.articleJobs.get(id)?.controller.abort(new Error('订阅已编辑，抓取已取消'));
        return result;
      }
      case 'feed.remove': {
        const { id } = idInput.parse(input);
        const articleIds = (await this.snapshot()).articles.filter(a => a.feedId === id).map(a => a.id);
        const result = await transaction(state => {
          if (state.config.undo.length >= RSS_LIMITS.feeds) throw new Error('撤销记录超过上限，请在 30 秒后重试');
          const feed = rssFeedIn(state, id), token = randomUUID(), expiresAt = Date.now() + RSS_LIMITS.undoMs;
          state.config.undo.push({ token, feed: { ...feed }, index: state.config.feeds.indexOf(feed), expiresAt });
          state.cache.undo[token] = state.cache.articles.filter(a => a.feedId === id);
          state.config.feeds = state.config.feeds.filter(f => f.id !== id);
          state.cache.articles = state.cache.articles.filter(a => a.feedId !== id);
          return { token, name: feed.name, expiresAt };
        });
        this.jobs.get(id)?.controller.abort(new Error('订阅已取消'));
        for (const articleId of articleIds) this.articleJobs.get(articleId)?.controller.abort(new Error('订阅已取消'));
        return result;
      }
      case 'feed.undo': {
        const { token } = z.object({ token: z.string() }).parse(input);
        return transaction(state => {
          const undo = state.config.undo.find(u => u.token === token);
          if (!undo || undo.expiresAt <= Date.now()) throw new Error('撤销期限已过或订阅已恢复');
          if (state.config.feeds.some(f => f.url === undo.feed.url)) throw new Error('已重新订阅相同地址，不重复恢复');
          if (state.config.feeds.length >= RSS_LIMITS.feeds) throw new Error('订阅数量超过上限');
          const feed = { ...undo.feed, groupId: state.config.groups.some(g => g.id === undo.feed.groupId) ? undo.feed.groupId : '', revision: undo.feed.revision + 1 };
          state.config.feeds.splice(Math.min(undo.index, state.config.feeds.length), 0, feed);
          state.cache.articles.push(...state.cache.undo[token] ?? []);
          delete state.cache.undo[token]; state.config.undo = state.config.undo.filter(u => u.token !== token);
          return feed;
        });
      }
      case 'move': {
        const data = z.object({ kind: z.enum(['feed', 'group']), id: z.string(), targetId: z.string().optional(), groupId: z.string().optional(), position: z.enum(['before', 'after']).default('before') }).parse(input);
        return transaction(state => {
          if (data.kind === 'group') {
            if (data.targetId === undefined) throw new Error('分组不存在');
            const groups = rssNavigationGroups({ groups: state.config.groups, ungroupedPosition: state.config.ungroupedPosition, ungroupedCollapsed: state.config.ungroupedCollapsed });
            const item = groups.find(g => g.id === data.id), target = groups.find(g => g.id === data.targetId);
            if (!item || !target) throw new Error('分组不存在');
            if (item.id !== target.id) {
              const reordered = groups.filter(g => g.id !== item.id);
              reordered.splice(reordered.indexOf(target) + Number(data.position === 'after'), 0, item);
              state.config.ungroupedPosition = reordered.findIndex(g => g.id === '');
              state.config.groups = reordered.filter(g => g.id !== '');
            }
            return item;
          }
          const item = rssFeedIn(state, data.id), target = data.targetId ? rssFeedIn(state, data.targetId) : undefined;
          const groupId = target?.groupId ?? data.groupId ?? item.groupId;
          this.validGroup(state, groupId);
          if (target?.id === item.id) return item;
          item.groupId = groupId; item.revision++;
          state.config.feeds = state.config.feeds.filter(f => f.id !== item.id);
          const index = target ? state.config.feeds.indexOf(target) + Number(data.position === 'after') : state.config.feeds.length;
          state.config.feeds.splice(index, 0, item);
          if (groupId) this.group(state, groupId).collapsed = false;
          else state.config.ungroupedCollapsed = false;
          return item;
        });
      }
      case 'opml.preview': {
        const data = z.object({ text: z.string(), defaultGroup: z.string().max(80).default('') }).parse(input);
        return previewOpml(data.text, await this.listFeeds(), data.defaultGroup);
      }
      case 'opml.import': {
        const data = z.object({ text: z.string(), defaultGroup: z.string().max(80).default(''), selected: z.array(z.number().int().nonnegative()).max(1000), trusted: z.boolean().default(false) }).parse(input);
        return transaction(state => {
          const preview = previewOpml(data.text, state.config.feeds, data.defaultGroup), selected = new Set(data.selected);
          if ([...selected].some(index => !preview.candidates.some(c => c.index === index))) throw new Error('OPML 候选已变化，请重新预览');
          let imported = 0, skipped = 0;
          for (const candidate of preview.candidates.filter(c => selected.has(c.index))) {
            if (candidate.error) throw new Error(candidate.error);
            if (candidate.duplicate) { skipped++; continue; }
            let groupId = '';
            if (candidate.groupName && !['默认分组', '未分组'].includes(candidate.groupName)) {
              let group = state.config.groups.find(g => g.name === candidate.groupName);
              if (!group) {
                this.uniqueName(state, candidate.groupName);
                if (state.config.groups.length >= RSS_LIMITS.groups) throw new Error('分组数量超过上限');
                group = { id: randomUUID(), name: candidate.groupName, collapsed: false }; state.config.groups.push(group);
              }
              groupId = group.id;
            }
            this.createFeed(state, { name: candidate.name, url: candidate.url, groupId, enabled: true, trusted: data.trusted }); imported++;
          }
          return { imported, skipped };
        });
      }
      case 'opml.export': {
        const { feedId } = z.object({ feedId: z.string().optional() }).parse(input);
        const snapshot = await this.snapshot();
        if (feedId && !snapshot.feeds.some(f => f.id === feedId)) throw new Error('订阅源不存在');
        const feeds = snapshot.feeds.filter(f => !feedId || f.id === feedId);
        return exportOpml(feeds, snapshot.groups.filter(g => !feedId || feeds.some(f => f.groupId === g.id)));
      }
      case 'refresh': return this.refresh(querySchema.pick({ feedId: true, groupId: true }).parse(input), signal);
      case 'refresh.cancel': {
        const { feedId } = z.object({ feedId: z.string().optional() }).parse(input);
        for (const [id, job] of this.jobs) if (!feedId || feedId === id) job.controller.abort(new Error('RSS 抓取已取消'));
        return { cancelled: true };
      }
      default: throw new Error(`未知 RSS 方法：${method}`);
    }
  }
  private async slot(signal: AbortSignal) {
    while (this.active >= this.limits.concurrency) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => { signal.removeEventListener('abort', abort); resolve(); };
        const abort = () => { this.waiters = this.waiters.filter(w => w !== wake); reject(new Error('RSS 抓取已取消')); };
        if (signal.aborted) { reject(new Error('RSS 抓取已取消')); return; }
        this.waiters.push(wake); signal.addEventListener('abort', abort, { once: true });
      });
    }
    if (signal.aborted) throw new Error('RSS 抓取已取消');
    this.active++;
  }
  private job(feed: RssFeed, signal?: AbortSignal) {
    const existing = this.jobs.get(feed.id);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error('RSS 抓取已取消'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const promise = (async (): Promise<'success' | 'failed' | 'cancelled'> => {
      let acquired = false;
      try {
        await this.slot(controller.signal); acquired = true;
        const response = await fetchRss(feed.url, { signal: controller.signal, trusted: feed.trusted, timeoutMs: this.limits.timeoutMs, etag: feed.etag, lastModified: feed.lastModified });
        const parsed = response.status === 304 ? null : parseRss(response.text, response.url);
        const applied = await this.transaction(state => {
          const current = state.config.feeds.find(f => f.id === feed.id);
          if (!current || current.url !== feed.url || current.revision !== feed.revision || !current.enabled || controller.signal.aborted) return false;
          if (parsed) {
            const articles = new Map(state.cache.articles.map(a => [a.id, a]));
            for (const entry of parsed.articles) {
              const id = createHash('sha256').update(feed.id + '\0' + entry.key).digest('hex');
              const old = articles.get(id);
              const sameEntry = old && old.title === entry.title && old.summary === entry.summary && old.url === entry.url && old.publishedAt === entry.publishedAt;
              const retained = sameEntry && !entry.body && old.bodySource === 'original';
              if (sameEntry && old.body === entry.body && entry.bodyContent && !old.bodyContent) old.bodyContent = entry.bodyContent;
              const unchanged = sameEntry && (retained || (old.body === entry.body && JSON.stringify(old.bodyContent) === JSON.stringify(entry.bodyContent)));
              if (!unchanged) articles.set(id, { ...entry, id, feedId: feed.id, fetchedAt: Date.now(), sequence: ++state.config.sequence });
            }
            state.cache.articles = [...articles.values()];
          } else if (!feed.etag && !feed.lastModified) throw new Error('无缓存条件的 304 响应');
          current.checkedAt = Date.now(); delete current.error;
          if (parsed) { delete current.etag; delete current.lastModified; }
          if (response.etag) current.etag = response.etag;
          if (response.lastModified) current.lastModified = response.lastModified;
          return true;
        });
        return controller.signal.aborted || !applied ? 'cancelled' : 'success';
      } catch (error) {
        if (controller.signal.aborted || this.disposed) return 'cancelled';
        await this.transaction(state => {
          const current = state.config.feeds.find(f => f.id === feed.id);
          if (current && current.url === feed.url && current.revision === feed.revision) { current.error = message(error); current.checkedAt = Date.now(); }
        });
        return 'failed';
      } finally {
        if (acquired) { this.active--; this.waiters.shift()?.(); }
        signal?.removeEventListener('abort', cancel);
        this.jobs.delete(feed.id); this.notify();
      }
    })();
    this.jobs.set(feed.id, { controller, promise }); this.notify();
    return promise;
  }
  async refresh(input: { feedId?: string; groupId?: string } = {}, signal?: AbortSignal): Promise<RssRefreshResult> {
    await this.ready(); await this.queue;
    if (this.disposed) throw new Error('RSS Manager 已关闭');
    if (input.feedId) rssFeedIn(this.state, input.feedId);
    const feeds = this.state.config.feeds.filter(f => f.enabled && (!input.feedId || f.id === input.feedId) && (input.groupId === undefined || f.groupId === input.groupId));
    const results = await Promise.all(feeds.map(feed => this.job({ ...feed }, signal)));
    return { succeeded: results.filter(r => r === 'success').length, failed: results.filter(r => r === 'failed').length,
      cancelled: results.filter(r => r === 'cancelled').length,
      errors: feeds.flatMap((f, i) => results[i] === 'failed' ? [{ feedId: f.id, message: this.state.config.feeds.find(x => x.id === f.id)?.error ?? 'RSS 抓取失败' }] : []) };
  }
  private async tick() {
    if (this.disposed) return;
    const config = this.options.getConfig();
    if (![0, 15, 30, 60].includes(config.refreshMinutes)) return;
    if (this.state.config.undo.some(u => u.expiresAt <= Date.now())) await this.transaction(() => undefined);
    if (!config.refreshMinutes) return;
    const due = this.state.config.feeds.filter(f => f.enabled && !this.jobs.has(f.id) && Date.now() - (f.checkedAt ?? f.installedAt) >= config.refreshMinutes * 60_000);
    await Promise.all(due.map(f => this.job({ ...f })));
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true; clearInterval(this.timer);
    for (const job of this.jobs.values()) job.controller.abort(new Error('RSS Manager 已关闭'));
    for (const job of this.articleJobs.values()) job.controller.abort(new Error('RSS Manager 已关闭'));
    await Promise.allSettled([...this.jobs.values(), ...this.articleJobs.values()].map(j => j.promise));
    await this.queue; await this.initialized.catch(() => {});
  }
}
