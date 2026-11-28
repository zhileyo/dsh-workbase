import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RSS_LIMITS, safeRssUrl, rssGroupNameReserved, type RssFeed } from '../shared/rss.js';
import type { RssStoredState } from './rss-store.js';

export const nameSchema = z.string().trim().min(1, '请填写名称').max(80, '名称最多 80 字符');
export const feedCreateSchema = z.object({ name: nameSchema, url: z.string(), groupId: z.string().default(''), enabled: z.boolean().default(true), trusted: z.boolean().default(false) });
export const feedUpdateSchema = z.object({
  id: z.string().min(1), revision: z.number().int().nonnegative(),
  name: nameSchema.optional(), url: z.string().optional(), groupId: z.string().optional(),
  enabled: z.boolean().optional(), trusted: z.boolean().optional(),
});

/** 订阅与分组的字段规则：纯函数只依赖 RssStoredState，事务编排留在 RssManager。 */
export function rssGroupIn(state: RssStoredState, id: string) {
  const group = state.config.groups.find(g => g.id === id);
  if (!group) throw new Error('分组不存在');
  return group;
}
export function validGroup(state: RssStoredState, id: string) { if (id) rssGroupIn(state, id); }
export function uniqueName(state: RssStoredState, name: string, id = '') {
  if (rssGroupNameReserved(name) || state.config.groups.some(g => g.id !== id && g.name === name)) throw new Error('分组名称重复或保留');
}
export function uniqueUrl(state: RssStoredState, raw: string, id = '') {
  const url = safeRssUrl(raw);
  if (!url) throw new Error('RSS URL 无效，仅允许无凭据的 HTTP/HTTPS');
  if (state.config.feeds.some(f => f.id !== id && f.url === url)) throw new Error('订阅地址重复');
  return url;
}
/**
 * 订阅版本的唯一自增入口：所有改订阅字段的路径都经由它，新增路径不会再漏掉 revision。
 * 创建走同一入口（初始 0 → 1），修改走 mutate 分支，版本号与字段变更永远成对发生。
 */
export function touchFeed<T extends RssFeed>(feed: T, change?: (feed: T) => void): T {
  change?.(feed);
  feed.revision++;
  return feed;
}
export function createFeed(state: RssStoredState, input: z.infer<typeof feedCreateSchema>) {
  if (state.config.feeds.length >= RSS_LIMITS.feeds) throw new Error('订阅数量超过上限');
  validGroup(state, input.groupId);
  const feed = touchFeed<RssFeed>({ ...input, url: uniqueUrl(state, input.url), id: randomUUID(), revision: 0, installedAt: Date.now() });
  state.config.feeds.push(feed);
  return feed;
}
