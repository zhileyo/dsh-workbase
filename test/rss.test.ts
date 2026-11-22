import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { RssManager } from '../src/server/rss.js';
import { RSS_RECOMMENDATIONS, rssRecentArticles, type RssFeed } from '../src/shared/rss.js';
import { english } from '../src/client/i18n-en.js';
import { RssStore, emptyRssState } from '../src/server/rss-store.js';

test('RSS卡片按所选天数统计启用源近期发布文章，不计抓取时间、未知时间或未来时间', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-summary-'));
  const now = Date.now(), day = 86400000;
  const state = emptyRssState();
  state.config.feeds = [
    { id: 'enabled', name: '启用', url: 'https://example.com/rss', groupId: '', enabled: true, trusted: false, revision: 1, installedAt: now },
    { id: 'paused', name: '暂停', url: 'https://example.com/paused', groupId: '', enabled: false, trusted: false, revision: 1, installedAt: now },
  ];
  state.cache.articles = [now - day, now - 10 * day, now - 20 * day, 0, now + day].map((publishedAt, i) => ({
    id: `article-${i}`, feedId: 'enabled', key: `key-${i}`, title: `文章${i}`, summary: '', body: '',
    url: `https://example.com/${i}`, publishedAt, fetchedAt: now, sequence: i + 1,
  }));
  state.cache.articles.push({ ...state.cache.articles[0]!, id: 'paused-article', feedId: 'paused' });
  await new RssStore(home).save(state);
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    for (const [days, count] of [[7, 1], [14, 2], [30, 3]]) {
      const summary = await manager.handle('summary', { days }) as { count: number; detail: string };
      assert.equal(summary.count, count);
      assert.match(summary.detail, new RegExp(`最近 ${days} 天`));
    }
    await assert.rejects(manager.handle('summary', { days: 0 }));
    await assert.rejects(manager.handle('summary', { days: 366 }));
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('推荐订阅迁入17项原生目录，保留分类语言与主页，说明具备英文译文', () => {
  assert.equal(RSS_RECOMMENDATIONS.length, 17);
  assert.deepEqual(RSS_RECOMMENDATIONS.map(r => r.id), ['joho-no-todai-en', 'ithome', 'sspai', 'ifanr', 'hacker-news', 'arxiv-ai', 'hugging-face', 'deepmind', 'appinn', 'harness', 'python', 'rust', 'nodejs', 'moonlight', 'simon-willison', 'nasa', 'xkcd']);
  assert.equal(new Set(RSS_RECOMMENDATIONS.map(r => r.url)).size, 17);
  assert.deepEqual([...new Set(RSS_RECOMMENDATIONS.map(r => r.category))], ['technology', 'research', 'software', 'reading', 'interests']);
  for (const entry of RSS_RECOMMENDATIONS) {
    assert.equal(new URL(entry.url).protocol, 'https:');
    assert.equal(new URL(entry.website!).protocol, 'https:');
    assert.ok(['zh', 'en'].includes(entry.language!));
    if (entry.description) assert.ok(english[entry.description]);
  }
  assert.equal(RSS_RECOMMENDATIONS[0]!.description, '');
});

const feedXml = (title = '文章', id = 'one') => `<rss version="2.0"><channel><title>本地测试</title><item><guid>${id}</guid><title>${title}</title><link>/article</link><description>摘要</description><pubDate>Thu, 19 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>`;

for (const cancelledReader of [0, 1, 'all', 'signal-free'] as const) {
  test(`A11 共享正文消费者独立取消：${cancelledReader}`, { timeout: 5000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), 'rss-readers-'));
    let reply!: () => void, started!: () => void, disconnected!: () => void, hits = 0;
    const incoming = new Promise<void>(resolve => { started = resolve; });
    const closed = new Promise<void>(resolve => { disconnected = resolve; });
    const server = createServer((req, res) => {
      if (req.url !== '/article') { res.end(feedXml()); return; }
      hits++; res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html><body><article>');
      res.on('close', disconnected);
      reply = () => res.end(`<h1>文章</h1><p>${'完整正文内容。'.repeat(100)}</p></article></body></html>`);
      started();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
    const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    try {
      await manager.handle('feed.create', { name: '源', url: base + '/rss', trusted: true });
      await manager.refresh();
      const article = (await manager.snapshot()).articles[0]!;
      const controllers = [new AbortController(), new AbortController()];
      const first = manager.fetchArticle(article.id, controllers[0]!.signal);
      await incoming;
      const second = manager.fetchArticle(article.id, cancelledReader === 'signal-free' ? undefined : controllers[1]!.signal);
      const reads = [first, second];
      const promptly = async <T,>(promise: Promise<T>): Promise<T> => {
        let timer!: ReturnType<typeof setTimeout>;
        try {
          return await Promise.race([promise, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('消费者取消未及时完成')), 500);
          })]);
        } finally { clearTimeout(timer); }
      };
      for (let i = 0; i < 20; i++) await Promise.resolve();
      if (cancelledReader === 'all') {
        const rejected = reads.map(read => assert.rejects(read, /取消/));
        controllers.forEach(controller => controller.abort());
        await promptly(Promise.all(rejected));
        await promptly(closed);
        assert.equal((await manager.readArticle(article.id)).body, '');
      } else {
        const index = cancelledReader === 'signal-free' ? 0 : cancelledReader;
        const rejected = assert.rejects(reads[index]!, /取消/);
        // Observe the survivor even if a regression rejects it before we await it.
        void reads[1 - index]!.catch(() => {});
        controllers[index]!.abort();
        await promptly(rejected);
        assert.equal(controllers[1 - index]!.signal.aborted, false);
        reply();
        assert.match((await reads[1 - index]!).body, /完整正文/);
      }
      assert.equal(hits, 1, '两个读者只触发一次原文请求');
    } finally {
      await manager.dispose(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    }
  });
}

test('A11 槽位等待中的消费者全部退出取消旧任务，立即重试不被旧清理删除', { timeout: 5000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-reader-slot-'));
  let release!: () => void, started!: () => void, secondHits = 0;
  const incoming = new Promise<void>(resolve => { started = resolve; });
  const html = `<html><head><title>正文</title></head><body><article><h1>正文</h1><p>${'完整正文内容。'.repeat(100)}</p></article></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/rss') {
      res.end('<rss><channel><item><guid>a</guid><title>A</title><link>/a</link></item>'
        + '<item><guid>b</guid><title>B</title><link>/b</link></item></channel></rss>');
    } else if (req.url === '/a') { release = () => res.end(html); started(); }
    else { secondHits++; res.end(html); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }), limits: { concurrency: 1 } });
  try {
    await manager.handle('feed.create', { name: '源', url: 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/rss', trusted: true });
    await manager.refresh();
    const articles = (await manager.snapshot()).articles;
    const active = manager.fetchArticle(articles.find(a => a.key === 'a')!.id);
    void active.catch(() => {});
    await incoming;
    const id = articles.find(a => a.key === 'b')!.id;
    const controllers = [new AbortController(), new AbortController()];
    const reads = controllers.map(controller => manager.fetchArticle(id, controller.signal));
    const rejected = reads.map(read => assert.rejects(read, /取消/));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    controllers.forEach(controller => controller.abort());
    const retry = manager.fetchArticle(id);
    void retry.catch(() => {});
    await Promise.all(rejected);
    release();
    await active;
    assert.match((await retry).body, /完整正文/);
    assert.equal(secondHits, 1);
  } finally {
    await manager.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('默认分组初始置顶，可和自定义分组一起移动并在重启后保留顺序', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  let manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    const a = await manager.handle('group.create', { name: 'A' }) as { id: string };
    const b = await manager.handle('group.create', { name: 'B' }) as { id: string };
    assert.equal((await manager.snapshot()).ungroupedPosition, 0);
    await manager.handle('move', { kind: 'group', id: '', targetId: b.id, position: 'after' });
    assert.equal((await manager.snapshot()).ungroupedPosition, 2);
    await manager.handle('move', { kind: 'group', id: a.id, targetId: '', position: 'after' });
    assert.deepEqual((await manager.snapshot()).groups.map(g => g.id), [b.id, a.id]);
    assert.equal((await manager.snapshot()).ungroupedPosition, 1);
    await manager.dispose();
    manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    assert.equal((await manager.snapshot()).ungroupedPosition, 1);
    await manager.handle('group.remove', { id: b.id });
    assert.equal((await manager.snapshot()).ungroupedPosition, 0);
    await assert.rejects(manager.handle('group.remove', { id: '' }));
    await assert.rejects(manager.handle('group.update', { id: '', name: '改名' }));
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('文章详情按原文抓取正文，复用并持久缓存，订阅刷新不覆盖已提取正文', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  const paragraph = '这是文章的完整正文，包含摘要中没有的详细项目介绍和使用方法。'.repeat(12);
  let articleHits = 0, xml = feedXml(), fail = false;
  const server = createServer((req, res) => {
    if (req.url === '/article') {
      articleHits++;
      if (fail) { res.writeHead(503); res.end(); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<html><head><title>文章</title></head><body><nav>导航噪声</nav><article><h1>文章</h1><p>${paragraph}</p><script>恶意脚本</script><img src="/tracking"></article><footer>页脚噪声</footer></body></html>`);
    } else { res.setHeader('content-type', 'application/rss+xml'); res.end(xml); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  let manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    const feed = await manager.handle('feed.create', { name: '源', url: base + '/rss', trusted: true }) as RssFeed;
    await manager.refresh();
    const article = (await manager.snapshot()).articles[0]!;
    assert.equal(articleHits, 0, '订阅刷新不批量抓原文');
    const [read, duplicate] = await Promise.all([
      manager.handle('article.fetch', { id: article.id }),
      manager.handle('article.fetch', { id: article.id }),
    ]) as { body: string; sequence: number }[];
    assert.match(read!.body, /完整正文/);
    assert.doesNotMatch(read!.body, /导航噪声|页脚噪声|恶意脚本|tracking/);
    assert.equal(duplicate!.body, read!.body);
    assert.equal(articleHits, 1);
    assert.equal(read!.sequence, article.sequence, '正文补齐不推进增量游标');
    await manager.refresh();
    assert.equal((await manager.readArticle(article.id)).body, read!.body);
    await manager.dispose();
    manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    await manager.handle('article.fetch', { id: article.id });
    assert.equal(articleHits, 1, '重启后复用持久缓存');
    assert.ok((await manager.readArticle(article.id)).bodyContent?.length);
    await manager.dispose();
    const config = JSON.parse(await readFile(join(home, 'workbase/rss/config.json'), 'utf8'));
    const cachePath = join(home, `workbase/rss/cache-${config.generation}.json`);
    const cache = JSON.parse(await readFile(cachePath, 'utf8'));
    delete cache.articles[0].bodyContent;
    await writeFile(cachePath, JSON.stringify(cache));
    manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    const upgraded = await manager.fetchArticle(article.id);
    assert.equal(articleHits, 2, '旧版原文纯文本缓存按需重新提取结构');
    assert.ok(upgraded.bodyContent?.length);
    assert.equal(upgraded.sequence, article.sequence, '结构补齐不修改已读游标');
    xml = feedXml('更新文章', 'two');
    await manager.refresh();
    const second = (await manager.snapshot()).articles.find(a => a.key === 'two')!;
    fail = true;
    await assert.rejects(manager.handle('article.fetch', { id: second.id }), /503/);
    assert.equal((await manager.readArticle(second.id)).summary, '摘要');
    assert.equal((await manager.readArticle(second.id)).body, '');
    await manager.handle('feed.update', { id: feed.id, revision: feed.revision, trusted: false });
    await assert.rejects(manager.handle('article.fetch', { id: second.id }), /私网或保留/);
  } finally {
    await manager.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('isolated subscription, fetch, cache, reading, incremental, OPML, pause and durable undo', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  let xml = feedXml(), fail = false, hits = 0;
  const server = createServer((req, res) => {
    hits++;
    if (fail) { res.writeHead(503); res.end('failure'); return; }
    res.setHeader('content-type', 'application/rss+xml');
    res.setHeader('etag', '"one"');
    if (req.headers['if-none-match'] === '"one"' && xml === feedXml()) { res.writeHead(304); res.end(); return; }
    res.end(xml);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/feed`;
  let manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    const group = await manager.handle('group.create', { name: '工程' }) as { id: string };
    const source = await manager.handle('feed.create', { name: '源', url, groupId: group.id, trusted: true }) as RssFeed;
    await assert.rejects(manager.handle('feed.create', { name: '重复', url: url + '#fragment', trusted: true }), /重复/);
    assert.equal(hits, 0, 'snapshot and CRUD do not silently fetch');
    const refreshed = await manager.handle('refresh', { feedId: source.id }) as { failed: number };
    assert.equal(refreshed.failed, 0);
    let snapshot = await manager.snapshot();
    assert.equal(snapshot.articles.length, 1);
    assert.deepEqual(await manager.summary(), { count: rssRecentArticles(snapshot, 7).length, detail: '最近 7 天发布的已缓存文章', errors: 0 });
    const read = await manager.readArticle(snapshot.articles[0]!.id);
    assert.equal(read.title, '文章');
    assert.equal((await manager.snapshot()).revision, snapshot.revision, 'reading does not mark read');
    assert.equal((await manager.readIncremental({ scope: 'session-a' })).articles.length, 1);
    assert.equal((await manager.readIncremental({ scope: 'session-a' })).articles.length, 0);
    assert.equal((await manager.readIncremental({ scope: 'session-b' })).articles.length, 1);
    await manager.handle('refresh', { feedId: source.id });
    assert.equal((await manager.snapshot()).articles.length, 1, '304 preserves cache');
    xml = feedXml('新文章', 'two');
    await manager.handle('refresh', { feedId: source.id });
    assert.equal((await manager.readIncremental({ scope: 'session-a' })).articles.length, 1);
    fail = true;
    assert.equal((await manager.handle('refresh', { feedId: source.id }) as { failed: number }).failed, 1);
    snapshot = await manager.snapshot();
    assert.equal(snapshot.articles.length, 2);
    assert.deepEqual(await manager.summary(), { count: rssRecentArticles(snapshot, 7).length, detail: '最近 7 天发布的已缓存文章 · 异常 1', errors: 1 });
    assert.match(snapshot.feeds[0]!.error ?? '', /503/);
    await manager.handle('feed.update', { id: source.id, revision: snapshot.feeds[0]!.revision, enabled: false });
    const before = hits;
    await manager.handle('refresh');
    assert.equal(hits, before, 'paused sources are not fetched');
    const exported = await manager.handle('opml.export') as string;
    const preview = await manager.handle('opml.preview', { text: exported }) as { duplicate: number };
    assert.equal(preview.duplicate, 1);
    const removed = await manager.handle('feed.remove', { id: source.id }) as { token: string };
    assert.equal((await manager.snapshot()).articles.length, 0);
    await manager.dispose();
    manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
    assert.equal((await manager.snapshot()).undo?.[0]?.token, removed.token, 'reopened panel can still offer durable undo');
    await manager.handle('group.remove', { id: group.id });
    await manager.handle('feed.undo', { token: removed.token });
    snapshot = await manager.snapshot();
    assert.equal(snapshot.feeds[0]?.id, source.id);
    assert.equal(snapshot.feeds[0]?.groupId, '');
    assert.equal(snapshot.feeds[0]?.enabled, false);
    assert.equal(snapshot.articles.length, 2);
    await assert.rejects(manager.handle('feed.undo', { token: removed.token }));
    const persisted = JSON.parse(await readFile(join(home, 'workbase/rss/config.json'), 'utf8'));
    assert.ok(!('refreshMinutes' in persisted), 'global refresh settings not duplicated');
  } finally {
    await manager.dispose();
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    await rm(home, { recursive: true, force: true });
  }
});

test('bounded article cache survives restart; lost generation reconstructs without stale validators', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  const server = createServer((_req, res) => {
    res.setHeader('etag', '"test"');
    res.end('<rss><channel>' + Array.from({ length: 10 }, (_, i) => `<item><guid>${i}</guid><title>文章 ${i}</title><description>摘要</description></item>`).join('') + '</channel></rss>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const options = { home, getConfig: () => ({ refreshMinutes: 0 as const }), limits: { articles: 3, perFeed: 2, cacheBytes: 2048 } };
  let manager = new RssManager(options);
  try {
    await manager.handle('feed.create', { name: 'A', trusted: true, url: 'http://127.0.0.1:' + (server.address() as { port: number }).port });
    assert.equal((await manager.refresh()).succeeded, 1);
    let snapshot = await manager.snapshot();
    assert.equal(snapshot.articles.length, 2);
    assert.equal(snapshot.articles[0]?.title, '文章 9');
    const config = JSON.parse(await readFile(join(home, 'workbase/rss/config.json'), 'utf8'));
    const cacheFile = join(home, 'workbase/rss/cache-' + config.generation + '.json');
    assert.ok((await stat(cacheFile)).size <= 2048);
    await manager.dispose(); manager = new RssManager(options);
    assert.equal((await manager.snapshot()).articles.length, 2);
    await manager.dispose(); await rm(cacheFile);
    manager = new RssManager(options);
    snapshot = await manager.snapshot();
    assert.equal(snapshot.articles.length, 0);
    assert.equal(snapshot.feeds[0]?.etag, undefined);
    assert.match(snapshot.feeds[0]?.error ?? '', /缓存不可用/);
    assert.equal((await manager.refresh()).succeeded, 1);
    assert.equal((await manager.snapshot()).articles.length, 2);
  } finally {
    await manager.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('undo expires at 30 seconds and rejects re-subscribed URL without duplicating identity', async context => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    let feed = await manager.handle('feed.create', { name: 'A', url: 'https://news.org/feed' }) as RssFeed;
    let removed = await manager.handle('feed.remove', { id: feed.id }) as { token: string };
    feed = await manager.handle('feed.create', { name: 'B', url: feed.url }) as RssFeed;
    await assert.rejects(manager.handle('feed.undo', { token: removed.token }), /重新订阅/);
    assert.equal((await manager.listFeeds()).length, 1);
    removed = await manager.handle('feed.remove', { id: feed.id }) as { token: string };
    context.mock.timers.tick(30_000);
    await assert.rejects(manager.handle('feed.undo', { token: removed.token }), /期限/);
    assert.equal((await manager.listFeeds()).length, 0);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); context.mock.timers.reset(); }
});

test('queued cancelled mutation never writes and auto refresh uses the live global setting', async context => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  let refreshMinutes: 0 | 15 | 30 | 60 = 0, hits = 0;
  const server = createServer((_req, res) => { hits++; res.end(feedXml()); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() });
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes }) });
  try {
    const signal = new AbortController();
    const create = manager.handle('feed.create', { name: '取消', url: 'https://news.org/cancel' }, signal.signal);
    signal.abort();
    await assert.rejects(create, /取消/);
    assert.equal((await manager.listFeeds()).length, 0);
    await manager.handle('feed.create', { name: 'A', trusted: true, url: 'http://127.0.0.1:' + (server.address() as { port: number }).port });
    context.mock.timers.tick(15 * 60_000);
    assert.equal(hits, 0, 'manual config never fetches on ticks');
    refreshMinutes = 15;
    context.mock.timers.tick(10_000);
    for (let i = 0; i < 100 && (await manager.snapshot()).refreshing.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(hits, 1);
    assert.equal((await manager.snapshot()).articles.length, 1);
  } finally {
    await manager.dispose(); context.mock.timers.reset(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('failed persistence leaves subscription unchanged and does not report removal success', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    const feed = await manager.handle('feed.create', { name: '源', url: 'https://news.org/feed' }) as RssFeed;
    await rm(join(home, 'workbase/rss/config.json'));
    await mkdir(join(home, 'workbase/rss/config.json'));
    await assert.rejects(manager.handle('feed.remove', { id: feed.id }));
    assert.equal((await manager.snapshot()).feeds[0]?.id, feed.id);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('group rename, fold, order and cross-group move preserve feed identity and revisions reject stale edits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  try {
    const a = await manager.handle('group.create', { name: 'A' }) as { id: string };
    const b = await manager.handle('group.create', { name: 'B' }) as { id: string };
    await manager.handle('group.update', { id: a.id, name: '新A', collapsed: true });
    assert.deepEqual(await manager.handle('group.update', { id: '', collapsed: true }), { id: '', name: '默认分组', collapsed: true });
    await assert.rejects(manager.handle('group.update', { id: '', name: '可改名' }), /默认分组不能重命名/);
    await assert.rejects(manager.handle('group.create', { name: '默认分组' }), /保留/);
    await manager.handle('move', { kind: 'group', id: b.id, targetId: a.id, position: 'before' });
    const f = await manager.handle('feed.create', { name: 'F', url: 'https://news.org/feed', groupId: a.id }) as RssFeed;
    await manager.handle('move', { kind: 'feed', id: f.id, groupId: b.id });
    const snapshot = await manager.snapshot();
    assert.equal(snapshot.groups[0]?.id, b.id);
    assert.equal(snapshot.groups[1]?.collapsed, true);
    assert.equal(snapshot.ungroupedCollapsed, true);
    assert.equal(snapshot.feeds[0]?.id, f.id);
    assert.equal(snapshot.feeds[0]?.installedAt, f.installedAt);
    await assert.rejects(manager.handle('feed.update', { id: f.id, revision: f.revision, name: 'stale' }), /版本/);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('OPML selection imports real feeds atomically and revalidates duplicates at commit', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }) });
  const text = '<opml version="2.0"><body><outline text="技术"><outline text="A" xmlUrl="https://news.org/a"/><outline xmlUrl="https://news.org/' + 'long'.repeat(30) + '"/><outline text="错误" xmlUrl="file:///etc/passwd"/></outline></body></opml>';
  try {
    const preview = await manager.handle('opml.preview', { text }) as { valid: number; invalid: number; candidates: { name: string }[] };
    assert.equal(preview.valid, 2); assert.equal(preview.invalid, 1);
    assert.ok(preview.candidates[1]!.name.length <= 80, 'URL-only feed has a persistable fallback name');
    await assert.rejects(manager.handle('opml.import', { text, selected: [0, 2] }));
    assert.equal((await manager.listFeeds()).length, 0, 'invalid selected candidate rolls back all additions');
    await manager.handle('feed.create', { name: '已有', url: 'https://news.org/a' });
    assert.deepEqual(await manager.handle('opml.import', { text, selected: [0, 1] }), { imported: 1, skipped: 1 });
    const exported = await manager.handle('opml.export') as string;
    assert.equal((await manager.handle('opml.preview', { text: exported }) as { duplicate: number }).duplicate, 2);
    for (const name of ['默认分组', '未分组']) {
      const fixed = `<opml version="2.0"><body><outline text="${name}"><outline text="默认来源" xmlUrl="https://news.org/${encodeURIComponent(name)}"/></outline></body></opml>`;
      await manager.handle('opml.import', { text: fixed, selected: [0] });
      assert.equal((await manager.listFeeds()).at(-1)?.groupId, '', 'new and legacy default labels share the fixed group');
      assert.equal((await manager.snapshot()).groups.some(group => group.name === name), false);
    }
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('editing URL cancels stale inflight data; duplicate refresh shares a bounded request', async () => {
  const home = await mkdtemp(join(tmpdir(), 'rss-test-'));
  let hits = 0;
  let started!: () => void;
  const incoming = new Promise<void>(resolve => { started = resolve; });
  const server = createServer((req, res) => {
    hits++; started();
    if (req.url === '/new') res.end(feedXml('新的', 'new'));
    else { res.writeHead(200); res.write('<rss>'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const manager = new RssManager({ home, getConfig: () => ({ refreshMinutes: 0 }), limits: { concurrency: 1 } });
  try {
    const feed = await manager.handle('feed.create', { name: '源', url: base + '/old', trusted: true }) as RssFeed;
    const first = manager.refresh(), second = manager.refresh();
    await incoming;
    await manager.handle('feed.update', { id: feed.id, revision: feed.revision, url: base + '/new' });
    assert.equal((await first).cancelled, 1); assert.equal((await second).cancelled, 1);
    assert.equal(hits, 1);
    assert.equal((await manager.snapshot()).articles.length, 0);
    assert.equal((await manager.refresh()).succeeded, 1);
    assert.equal((await manager.snapshot()).articles[0]?.title, '新的');
    await manager.dispose();
    await assert.rejects(manager.handle('group.create', { name: '关闭后' }), /关闭/);
  } finally {
    await manager.dispose(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
