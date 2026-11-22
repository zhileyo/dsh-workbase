import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { assertSupportedJsonSchema, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { registerExtensionTools } from '../src/server/extension-tools.js';
import { RssManager } from '../src/server/rss.js';
import { RssStore, emptyRssState } from '../src/server/rss-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('RSS读取工具符合宿主schema且增量scope只能由当前会话产生', async () => {
  const definitions: ToolDefinition[] = [], scopes: string[] = [];
  const rss = {
    listFeeds: async () => [],
    searchArticles: async () => ({ total: 0, articles: [] }),
    readArticle: async () => ({}),
    readIncremental: async (input: { scope: string }) => { scopes.push(input.scope); return { articles: [], cursor: 0, hasMore: false }; },
  } as unknown as RssManager;
  registerExtensionTools({
    effect: (fn: () => unknown) => fn(),
    tools: { register: (definition: ToolDefinition) => { definitions.push(definition); return () => {}; } },
  } as unknown as Context, rss);
  assert.equal(definitions.length, 5);
  for (const definition of definitions) {
    assert.doesNotThrow(() => assertSupportedJsonSchema(definition.parameters));
    assert.doesNotThrow(() => assertSupportedJsonSchema(definition.output!.schema));
  }
  const incremental = definitions.find(item => item.name === 'workbase_read_rss_incremental')!;
  const context = (id?: string) => ({ signal: new AbortController().signal,
    ...(id ? { agent: { session: { id } } } : {}) }) as ToolRunContext;
  await assert.rejects(incremental.execute({}, context()), /Agent/);
  await assert.rejects(incremental.execute({ scope: 'someone-else' }, context('one')));
  await incremental.execute({}, context('one'));
  await incremental.execute({}, context('two'));
  assert.deepEqual(scopes, ['session:one', 'session:two']);
});

test('A07 RSS工具排队取消不推进游标，后续同会话仍能读取文章', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-tool-cancel-'));
  const state = emptyRssState();
  state.config.feeds = [{ id: 'feed', name: '测试', url: 'https://example.com/rss', groupId: '',
    enabled: true, trusted: false, revision: 1, installedAt: 1 }];
  state.config.sequence = 1;
  state.cache.articles = [{ id: 'article', feedId: 'feed', key: 'one', title: '文章', summary: '',
    body: '', url: 'https://example.com/article', publishedAt: 1, fetchedAt: 1, sequence: 1 }];
  await new RssStore(home).save(state);
  const rss = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  let release!: () => void;
  const definitions: ToolDefinition[] = [];
  try {
    await rss.ready();
    registerExtensionTools({ effect: (fn: () => unknown) => fn(),
      tools: { register: (definition: ToolDefinition) => { definitions.push(definition); return () => {}; } },
    } as unknown as Context, rss);
    const tool = definitions.find(item => item.name === 'workbase_read_rss_incremental')!;
    // Hold the actual transaction queue before the tool's cursor mutation starts.
    (rss as unknown as { queue: Promise<unknown> }).queue = new Promise<void>(resolve => { release = resolve; });
    const controller = new AbortController();
    const execution = { signal: controller.signal, agent: { session: { id: 'one' } } } as ToolRunContext;
    const pending = tool.execute({}, execution);
    const rejected = assert.rejects(pending, /取消/);
    controller.abort(); release();
    await rejected;
    assert.equal((await rss.readIncremental({ scope: 'session:one' })).articles.length, 1);
    await rss.dispose();
    const reopened = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    try { assert.equal((await reopened.readIncremental({ scope: 'session:one' })).articles.length, 0); }
    finally { await reopened.dispose(); }
  } finally { release?.(); await rss.dispose(); await rm(home, { recursive: true, force: true }); }
});
