import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionSearch } from '../src/server/session-search.js';

const ACTIVE = 2;

function provider() {
  const calls: any[] = [];
  const engine = {
    searchSessions: async (request: any, options: any) => {
      calls.push({ request, signal: options.signal });
      return { items: hits, nextCursor: cursor };
    },
  };
  let hits: any[] = [];
  let cursor: unknown;
  return { engine, calls, set(hits2: any[], nextCursor?: unknown) { hits = hits2; cursor = nextCursor; } };
}

function wiring(options: { disabled?: boolean; listedByDefault?: boolean; packageError?: string } = {}) {
  const { engine, calls, set } = provider();
  const groupFiber = { state: ACTIVE, provisions: [], ctx: { get: () => undefined } };
  const groupEntry: any = { options: { id: 'optional-session-search', name: 'cordis:group', group: true },
    fiber: groupFiber, parent: { ctx: { fiber: {} } }, disabled: options.disabled ?? false };
  const engineEntry: any = { options: { id: 'optional-session-query-sqlite', name: '@deepseek-ai/dsh-session-query-sqlite' },
    fiber: { state: ACTIVE, provisions: [{ name: 'sessionQuery', value: engine }], ctx: { get: (name: string) => name === 'sessionQuery' ? engine : undefined } },
    parent: { ctx: { fiber: groupFiber } }, disabled: false };
  const toolsEntry: any = { options: { id: 'optional-tool-session-query', name: '@deepseek-ai/dsh-tool-session-query' },
    fiber: { state: ACTIVE, provisions: [], ctx: { get: () => undefined } }, parent: { ctx: { fiber: groupFiber } }, disabled: false };
  const state = { entries: [groupEntry, engineEntry, toolsEntry] as any[], listedByDefault: options.listedByDefault };
  const ctx: any = {
    get: (name: string) => name === 'loader'
      ? { entries: () => state.entries, config: { baseUrl: 'file:///repo/' } }
      : name === 'pluginPackages'
        ? { packageOf: () => state.listedByDefault === undefined ? undefined : { name: '@deepseek-ai/dsh-experimental-session-search', manifest: { dsh: { bundle: { listedByDefault: state.listedByDefault } } } },
          metaOf: () => options.packageError ? { error: options.packageError } : { version: '1' } }
        : undefined,
  };
  return { ctx, calls, set, state, groupEntry, engineEntry };
}

test('隔离组与索引子节点都就绪时启用正文搜索，并把请求限定在可见会话与当前表面', async () => {
  const w = wiring();
  w.set([{ header: { id: 's1' }, bestMatch: { sessionId: 's1', surface: 'current', type: 'user/message', snippet: '命中' } }]);
  // loader 的 baseUrl 供状态查询用；包元数据缺省时不推荐安装
  w.state.listedByDefault = true;
  const search = createSessionSearch(w.ctx);
  assert.deepEqual(search.status(), { enabled: true, showDependency: false });

  const result = await search('关键词', new AbortController().signal, ['s1', 's2']);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], { sessionId: 's1', snippet: '命中' });
  assert.equal(result.hasMore, false);
  const request = w.calls[0]!.request;
  assert.equal(request.query, '关键词');
  assert.equal(request.limit, 20);
  assert.deepEqual(request.sessionFilters, [{ kind: 'id', values: ['s1', 's2'] }]);
  assert.deepEqual(request.eventFilters.map((filter: any) => filter.kind), ['type', 'surface']);
});

test('命中按可见性、表面与去重过滤，摘要截到 240 个字符，游标存在才算还有更多', async () => {
  const w = wiring();
  w.state.listedByDefault = true;
  const long = '正'.repeat(300);
  w.set([
    { header: { id: 's1' }, bestMatch: { sessionId: 's1', surface: 'current', type: 'assistant/message', snippet: long } },
    { header: { id: 's1' }, bestMatch: { sessionId: 's1', surface: 'current', type: 'user/message', snippet: '重复' } },
    { header: { id: 'hidden' }, bestMatch: { sessionId: 'hidden', surface: 'current', type: 'user/message', snippet: '不可见' } },
    { header: { id: 's2' }, bestMatch: { sessionId: 's2', surface: 'summary', type: 'user/message', snippet: '其它表面' } },
    { header: { id: 's3' }, bestMatch: { sessionId: 's3', surface: 'current', type: 'tool/result', snippet: '其它事件' } },
    { header: { id: 's4' }, bestMatch: { sessionId: 'other', surface: 'current', type: 'user/message', snippet: '错配' } },
  ], 'cursor-1');
  const search = createSessionSearch(w.ctx);
  const result = await search('q', new AbortController().signal, ['s1', 's2', 's3', 's4']);
  assert.deepEqual(result.items.map(item => item.sessionId), ['s1']);
  assert.equal(Array.from(result.items[0]!.snippet).length, 240);
  assert.equal(result.hasMore, true);
});

test('没有可见会话或没有索引时不向服务发请求，中止信号原样抛出', async () => {
  const w = wiring();
  w.state.listedByDefault = true;
  const search = createSessionSearch(w.ctx);
  assert.deepEqual(await search('q', new AbortController().signal, []), { items: [], hasMore: false });
  assert.equal(w.calls.length, 0);

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(search('q', aborted.signal, ['s1']), { name: 'AbortError' });

  const missing = createSessionSearch({ get: () => undefined } as any);
  assert.deepEqual(await missing('q', new AbortController().signal, ['s1']), { items: [], hasMore: false });
  assert.deepEqual(missing.status(), { enabled: false, showDependency: false });
});

test('套件卸载后不发布在途结果也不抛出旧服务的错误，仍挂载时错误照原样抛出', async () => {
  const w = wiring();
  w.state.listedByDefault = true;
  let fail = false;
  const engine = w.engineEntry.fiber.ctx.get('sessionQuery');
  const original = engine.searchSessions;
  engine.searchSessions = async () => { if (fail) throw new Error('索引损坏'); return original({} as any, {} as any); };
  const search = createSessionSearch(w.ctx);
  fail = true;
  await assert.rejects(search('q', new AbortController().signal, ['s1']), /索引损坏/);

  // 服务在请求期间消失：provision 不再一致 → 当作空结果，不把旧错误抛给上层
  let release: (() => void) | undefined;
  engine.searchSessions = () => new Promise((_resolve, reject) => { release = () => reject(new Error('索引损坏')); });
  const pending = search('q', new AbortController().signal, ['s1']);
  await Promise.resolve();
  w.state.entries = [];
  release!();
  assert.deepEqual(await pending, { items: [], hasMore: false });
});

test('未启用时只在套件可安装且默认未隐藏时提示依赖', () => {
  const dormant = wiring({ disabled: true });
  dormant.state.listedByDefault = true;
  assert.deepEqual(createSessionSearch(dormant.ctx).status(), { enabled: false, showDependency: true });

  const hidden = wiring({ disabled: true });
  hidden.state.listedByDefault = false;
  assert.deepEqual(createSessionSearch(hidden.ctx).status(), { enabled: false, showDependency: false });

  const broken = wiring({ disabled: true, packageError: '元数据损坏' });
  broken.state.listedByDefault = true;
  assert.deepEqual(createSessionSearch(broken.ctx).status(), { enabled: false, showDependency: false });

  const absent: any = { get: (name: string) => name === 'loader' ? { entries: () => [], config: {} } : undefined };
  assert.deepEqual(createSessionSearch(absent).status(), { enabled: false, showDependency: false });
});
