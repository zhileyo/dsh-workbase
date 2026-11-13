import type { Context } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import type { PluginPackages } from '@deepseek-ai/dsh-app-boot';
import type { SessionQueryEngine, SessionSearchRequest } from '@deepseek-ai/dsh-session-query';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionSearch, SessionSearchStatus } from '../shared/model.js';

// Cordis 公开 const enum 的 ACTIVE 值；该枚举没有 JavaScript 导出。
const ACTIVE = 2;
const bundleName = '@deepseek-ai/dsh-experimental-session-search';
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * 只借用官方 optional-session-search 隔离组的服务，不使用宿主主索引。
 * Entry.disabled、fiber.state 和 Context.get 来自 Cordis 公开生命周期合同。
 */
export function createSessionSearch(ctx: Context) {
  const resolve = () => {
    const loader = ctx.get('loader') as Context['loader'] | undefined;
    if (!loader || typeof loader.entries !== 'function') return;
    const entries = [...loader.entries()];
    const active = (entry: Entry) => !entry.disabled && entry.fiber?.state === ACTIVE;
    const group = entries.find(entry => entry.options.id === 'optional-session-search'
      && entry.options.name === 'cordis:group' && entry.options.group === true && active(entry));
    if (!group) return;
    const child = (id: string, name: string) => entries.find(entry => entry.options.id === id
      && entry.options.name === name && entry.parent.ctx.fiber === group.fiber && active(entry));
    const engine = child('optional-session-query-sqlite', '@deepseek-ai/dsh-session-query-sqlite');
    const tools = child('optional-tool-session-query', '@deepseek-ai/dsh-tool-session-query');
    if (!engine?.fiber || !tools?.fiber) return;
    const provision = [...engine.fiber.provisions].find(impl => impl.name === 'sessionQuery' && impl.value);
    const provider = engine.fiber.ctx.get('sessionQuery') as SessionQueryEngine | undefined;
    // 必须由索引子节点实际提供服务，拒绝父级服务回落。
    if (!provision || !provider || typeof provider.searchSessions !== 'function') return;
    return { provider, provision };
  };
  const status = (): SessionSearchStatus => {
    if (resolve()) return { enabled: true, showDependency: false };
    try {
      const loader = ctx.get('loader') as Context['loader'] | undefined;
      const packages = ctx.get('pluginPackages') as PluginPackages | undefined;
      if (!loader || !packages) return { enabled: false, showDependency: false };
      const baseUrl = loader.config.baseUrl ?? import.meta.url;
      const pkg = packages.packageOf(bundleName, baseUrl);
      const bundle = record(record(pkg?.manifest.dsh)?.bundle);
      const meta = packages.metaOf(bundleName, baseUrl);
      const platforms = bundle?.platforms;
      const group = [...loader.entries()].find(entry => entry.options.id === 'optional-session-search');
      // 缺失、默认隐藏、元数据错误或启用未就绪时，均不推荐添加套件。
      const available = pkg?.name === bundleName && !!bundle && !!meta && !meta.error
        && bundle.listedByDefault !== false
        && (platforms === undefined || Array.isArray(platforms) && platforms.includes(process.platform))
        && (!group || group.disabled);
      return { enabled: false, showDependency: available };
    } catch {
      return { enabled: false, showDependency: false };
    }
  };
  const search = async (query: string, signal: AbortSignal, sessionIds: readonly string[]): Promise<SessionSearch> => {
    signal.throwIfAborted();
    const resolved = resolve();
    if (!resolved) return { items: [], hasMore: false };
    const { provider, provision } = resolved;
    if (!sessionIds.length) return { items: [], hasMore: false };
    const visible = new Set(sessionIds);
    const request: SessionSearchRequest = {
      query, limit: 20,
      sessionFilters: [{ kind: 'id', values: sessionIds as readonly SessionId[] }],
      eventFilters: [
        { kind: 'type', values: ['user/message', 'assistant/message'] },
        { kind: 'surface', values: ['current'] },
      ],
    };
    const page = await provider.searchSessions(request, { signal }).catch(error => {
      signal.throwIfAborted();
      if (resolve()?.provision !== provision) return { items: [], nextCursor: undefined };
      throw error;
    });
    signal.throwIfAborted();
    // 套件卸载或重载后，不发布旧服务的在途结果。
    if (resolve()?.provision !== provision) return { items: [], hasMore: false };
    const seen = new Set<string>();
    const items = page.items.flatMap(hit => {
      const id = hit.header.id, match = hit.bestMatch;
      if (!visible.has(id) || seen.has(id) || match.sessionId !== id || match.surface !== 'current'
        || !['user/message', 'assistant/message'].includes(match.type)) return [];
      seen.add(id);
      return [{ sessionId: id, snippet: Array.from(match.snippet).slice(0, 240).join('') }];
    });
    return { items, hasMore: page.nextCursor !== undefined };
  };
  return Object.assign(search, { status });
}
