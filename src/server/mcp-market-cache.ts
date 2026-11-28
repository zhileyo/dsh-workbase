import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mcpConfigSchema, type McpCandidate, type McpSource } from '../shared/mcp.js';
import { loadMcpMarket, MarketError } from './mcp-market.js';

const marketCandidateSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/).optional(), name: z.string().min(1).max(80),
  description: z.string().max(1000), issue: z.string().max(2000).optional(),
  config: z.union([mcpConfigSchema, z.object({}).strict()]),
  metadata: z.object({
    description: z.string().max(12000), vendor: z.string().max(200), category: z.string().max(200),
    homepage: z.string().max(2000), credentialName: z.string().max(200), credentialPlaceholder: z.string().max(500),
    credentialDescription: z.string().max(4000), credentialHelpLabel: z.string().max(200), credentialHelpUrl: z.string().max(2000),
    credentialFields: z.array(z.object({
      key: z.string().max(200), label: z.string().max(200), placeholder: z.string().max(500),
      description: z.string().max(1000), required: z.boolean(), secret: z.boolean(),
      helpLabel: z.string().max(200), helpUrl: z.string().max(2000),
      bindings: z.array(z.object({ target: z.enum(['env', 'headers']), name: z.string().max(200) })).max(100),
    })).max(100),
  }).optional(),
});
const marketCacheSchema = z.object({ version: z.literal(1), entries: z.array(z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/), candidates: z.array(marketCandidateSchema).max(500),
})).max(20) });

export interface McpMarketIssue { sourceId: string; message: string; reason?: string; cached?: boolean }

/** 仅公开已知错误类别，不能把上游错误中的地址、参数或凭据带到界面。 */
export function marketFailure(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return '请求超时';
    if (error instanceof SyntaxError) return 'JSON 格式无效';
    if (error instanceof MarketError) return error.message;
    if (error instanceof TypeError) return '网络连接失败';
  }
  return '目录读取失败';
}

/**
 * 市场目录的拉取与本地缓存文件是独立于连接器生命周期的变更原因，单独成类；
 * McpManager 只保留连接运行时与分发。
 */
export class McpMarketCache {
  private cache = new Map<string, McpCandidate[]>();
  constructor(private readonly filename: string, private readonly lifecycle: AbortSignal) {}
  async load() {
    try {
      if ((await stat(this.filename)).size <= 20 * 1024 * 1024) {
        const cache = marketCacheSchema.parse(JSON.parse(await readFile(this.filename, 'utf8')));
        this.cache = new Map(cache.entries.map(entry => [entry.key, entry.candidates]));
      }
    } catch { /* 可重建的目录缓存缺失或损坏不影响连接配置，成功拉取后重新保存。 */ }
  }
  private key(source: McpSource, query: string) {
    return createHash('sha256').update(JSON.stringify([source.id, source.url, query])).digest('hex');
  }
  cached(sources: readonly McpSource[], query: string) {
    const candidates = sources.filter(source => source.enabled).flatMap(source =>
      structuredClone(this.cache.get(this.key(source, query)) ?? []).map(row => ({ ...row, sourceId: source.id })));
    return { candidates, errors: [] as McpMarketIssue[] };
  }
  private async persist(signal?: AbortSignal) {
    const encode = () => JSON.stringify({ version: 1, entries: [...this.cache].map(([key, candidates]) => ({ key, candidates })) });
    let content = encode();
    while (Buffer.byteLength(content) > 20 * 1024 * 1024 && this.cache.size > 1) {
      this.cache.delete(this.cache.keys().next().value!);
      content = encode();
    }
    if (Buffer.byteLength(content) > 20 * 1024 * 1024) throw new Error('市场缓存超过大小限制');
    const temp = `${this.filename}.${randomUUID()}.tmp`;
    try {
      signal?.throwIfAborted(); this.lifecycle.throwIfAborted();
      await writeFile(temp, content, { mode: 0o600, flag: 'wx', signal });
      signal?.throwIfAborted(); this.lifecycle.throwIfAborted();
      await rename(temp, this.filename);
    } finally { await rm(temp, { force: true }); }
  }
  async fetch(sources: readonly McpSource[], query: string, signal?: AbortSignal) {
    const results: McpCandidate[] = [], errors: McpMarketIssue[] = [];
    const nextCache = new Map(this.cache), refreshedSources: string[] = [];
    for (const source of sources.filter(s => s.enabled)) {
      const cacheKey = this.key(source, query);
      try {
        const requestSignal = AbortSignal.any([this.lifecycle, ...(signal ? [signal] : []), AbortSignal.timeout(20_000)]);
        const page = await loadMcpMarket(source.url, query, requestSignal);
        requestSignal.throwIfAborted();
        // 成功空目录也更新缓存，不能在后续失败时复活已经移除的条目。
        nextCache.delete(cacheKey);
        nextCache.set(cacheKey, structuredClone(page.candidates));
        if (nextCache.size > 20) nextCache.delete(nextCache.keys().next().value!);
        refreshedSources.push(source.id);
        results.push(...page.candidates.map(row => ({ ...row, sourceId: source.id })));
        if (page.truncated) errors.push({ sourceId: source.id, message: '已显示前 500 条市场记录，请输入关键词缩小范围。' });
      } catch (error) {
        signal?.throwIfAborted(); this.lifecycle.throwIfAborted();
        const cached = this.cache.get(cacheKey);
        if (cached) results.push(...structuredClone(cached).map(row => ({ ...row, sourceId: source.id })));
        const issue = marketFailure(error);
        errors.push({ sourceId: source.id, reason: issue, cached: !!cached?.length, message: cached?.length
          ? `市场刷新失败：${issue}；当前显示上次成功加载的目录。`
          : `市场加载失败：${issue}；请重试或手工添加连接。` });
      }
    }
    signal?.throwIfAborted(); this.lifecycle.throwIfAborted();
    if (refreshedSources.length) {
      this.cache = nextCache;
      try { await this.persist(signal); }
      catch {
        signal?.throwIfAborted(); this.lifecycle.throwIfAborted();
        for (const sourceId of refreshedSources) errors.push({ sourceId,
          message: '市场目录已更新，但本地缓存保存失败；下次打开可能需要重新加载。' });
      }
    }
    return { candidates: results, errors };
  }
  clear() { this.cache.clear(); }
}
