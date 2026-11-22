import { mkdir, open, readFile, rename, unlink, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RSS_LIMITS, rssArticleSchema, rssFeedSchema, rssGroupSchema, type RssArticle, type RssFeed } from '../shared/rss.js';

const undoSchema = z.object({ token: z.string(), feed: rssFeedSchema, index: z.number().int(), expiresAt: z.number() });
const configSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), sequence: z.number().int().nonnegative(),
  generation: z.string().regex(/^(?:|[a-f0-9-]{36})$/),
  groups: z.array(rssGroupSchema).max(RSS_LIMITS.groups), feeds: z.array(rssFeedSchema).max(RSS_LIMITS.feeds),
  ungroupedCollapsed: z.boolean().default(false),
  ungroupedPosition: z.number().int().nonnegative().max(RSS_LIMITS.groups).default(0),
  undo: z.array(undoSchema).max(RSS_LIMITS.feeds),
  cursors: z.record(z.string(), z.object({ sequence: z.number().int().nonnegative(), touchedAt: z.number() })),
});
export type RssStoredConfig = z.infer<typeof configSchema>;
const cacheSchema = z.object({ articles: z.array(rssArticleSchema).max(RSS_LIMITS.articles), undo: z.record(z.string(), z.array(rssArticleSchema)) });
export type RssStoredCache = z.infer<typeof cacheSchema>;
export interface RssStoredState { config: RssStoredConfig; cache: RssStoredCache }
export const emptyRssState = (): RssStoredState => ({
  config: { version: 1, revision: 0, sequence: 0, generation: '', groups: [], feeds: [], ungroupedCollapsed: false, ungroupedPosition: 0, undo: [], cursors: {} },
  cache: { articles: [], undo: {} },
});
export function expireRssUndo(state: RssStoredState, now: number) {
  const tokens = new Set(state.config.undo.filter(u => u.expiresAt > now).map(u => u.token));
  state.config.undo = state.config.undo.filter(u => tokens.has(u.token));
  for (const token of Object.keys(state.cache.undo)) if (!tokens.has(token)) delete state.cache.undo[token];
}
export function boundRssCache(state: RssStoredState, limits: { articles: number; perFeed: number; cacheBytes: number }) {
  const feeds = new Set(state.config.feeds.map(f => f.id)), counts = new Map<string, number>();
  const sorted = state.cache.articles.filter(a => feeds.has(a.feedId)).sort((a, b) => b.publishedAt - a.publishedAt || b.sequence - a.sequence);
  state.cache.articles = sorted.filter(a => {
    const count = counts.get(a.feedId) ?? 0;
    counts.set(a.feedId, count + 1);
    return count < limits.perFeed;
  });
  const reserved = Object.values(state.cache.undo).flat();
  let bytes = Buffer.byteLength(JSON.stringify({ articles: [], undo: state.cache.undo }));
  let count = reserved.length;
  state.cache.articles = state.cache.articles.filter(a => {
    const size = Buffer.byteLength(JSON.stringify(a)) + 1;
    if (count >= limits.articles || bytes + size > limits.cacheBytes - 64) return false;
    bytes += size; count++; return true;
  });
  if (bytes > limits.cacheBytes || count > limits.articles) throw new Error('撤销缓存容量不足，请稍后重试');
}
export class RssStore {
  readonly directory: string;
  constructor(home: string) { this.directory = join(home, 'workbase', 'rss'); }
  async load(): Promise<RssStoredState> {
    let config: RssStoredConfig;
    try {
      const file = join(this.directory, 'config.json');
      if ((await stat(file)).size > 2 * 1024 * 1024) throw new Error('RSS 配置超过上限');
      config = configSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRssState();
      throw new Error('RSS 配置读取失败，保留原文件', { cause: error });
    }
    const ids = new Set(config.groups.map(g => g.id));
    if (ids.size !== config.groups.length || ids.has('') || new Set(config.feeds.map(f => f.id)).size !== config.feeds.length) throw new Error('RSS 配置身份重复');
    for (const feed of config.feeds) if (feed.groupId && !ids.has(feed.groupId)) feed.groupId = '';
    let cache: RssStoredCache = { articles: [], undo: {} };
    if (config.generation) {
      try {
        const file = join(this.directory, `cache-${config.generation}.json`);
        if ((await stat(file)).size > RSS_LIMITS.cacheBytes) throw new Error('RSS 缓存超过上限');
        cache = cacheSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Cache is reconstructible; never overwrite a corrupt subscription config.
        for (const feed of config.feeds) { delete feed.etag; delete feed.lastModified; feed.error = '缓存不可用，请重新刷新'; }
        config.undo = [];
      }
    }
    const state = { config, cache };
    expireRssUndo(state, Date.now());
    return state;
  }
  private async atomic(path: string, value: unknown) {
    const temporary = path + '.' + randomUUID() + '.tmp';
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async save(state: RssStoredState): Promise<void> {
    configSchema.parse(state.config);
    cacheSchema.parse(state.cache);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const generation = randomUUID(), cachePath = join(this.directory, `cache-${generation}.json`);
    await this.atomic(cachePath, state.cache);
    try {
      // Immutable cache generation first; one atomic config pointer is the transaction commit.
      await this.atomic(join(this.directory, 'config.json'), { ...state.config, generation });
    } catch (error) { await unlink(cachePath).catch(() => {}); throw error; }
    state.config.generation = generation;
    // Only our generation files are collectible. Unknown files and original plugin data are untouched.
    for (const name of await readdir(this.directory).catch(() => [] as string[])) {
      if (/^cache-[a-f0-9-]{36}\.json$/.test(name) && name !== `cache-${generation}.json`) await unlink(join(this.directory, name)).catch(() => {});
    }
  }
}
export function rssFeedIn(state: RssStoredState, id: string): RssFeed {
  const feed = state.config.feeds.find(f => f.id === id);
  if (!feed) throw new Error('订阅源不存在');
  return feed;
}
export function rssArticleIn(state: RssStoredState, id: string): RssArticle {
  const article = state.cache.articles.find(a => a.id === id && state.config.feeds.some(f => f.id === a.feedId));
  if (!article) throw new Error('文章缓存已不可用');
  return article;
}
