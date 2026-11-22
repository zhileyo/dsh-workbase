import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, realpath, rm, writeFile, stat, mkdir } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpManager } from '../src/server/mcp.js';
import { SkillsManager, type SkillsManagerOptions } from '../src/server/skills.js';
import { skillMarkdown, type SkillMarketItem, type SkillsSnapshot } from '../src/shared/skills.js';
import { builtinMcpSource, type McpCandidate } from '../src/shared/mcp.js';
import { canonicalSkillMarketUrl, loadSkillMarket, readMarketSkill, readMarketZip } from '../src/server/skills-market.js';

async function useMarket(manager: SkillsManager, name: 'SkillHub' | 'ClawHub', both = false) {
  const snapshot = await manager.handle('snapshot') as SkillsSnapshot;
  for (const source of snapshot.marketSources)
    await manager.handle('market.source.toggle', { id: source.id, enabled: both || source.name === name });
  return await manager.handle('snapshot') as SkillsSnapshot;
}

test('滚动分页首批只读一页，独立续页去重，失败可重试，旧查询不能追加', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-pages-')));
  const requests: URL[] = [];
  let fail = true;
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async address => {
      const url = new URL(address); requests.push(url);
      const page = Number(url.searchParams.get('page') ?? 1);
      if (page === 2 && fail) throw new Error('下一页失败');
      return JSON.stringify({ code: 0, data: { total: 48, skills: Array.from({ length: 24 }, (_, i) => ({
        slug: `skill-${page === 1 ? i : i + 23}`, name: `Skill ${i}`, description: '说明',
      })) } });
    },
  });
  type PageSnapshot = SkillsSnapshot & { marketPage: { token: string; query: string; hasMore: boolean } };
  try {
    await useMarket(manager, 'SkillHub');
    const first = await manager.handle('market.load', {}) as PageSnapshot;
    assert.equal(requests.length, 1);
    assert.equal(first.market.length, 24);
    assert.equal(first.marketPage.hasMore, true);
    const failed = await manager.handle('market.load', { pageToken: first.marketPage.token }) as PageSnapshot;
    assert.equal(failed.market.length, 24);
    assert.match(failed.marketSources[0]!.issue!, /下一页失败/);
    fail = false;
    const next = await manager.handle('market.load', { pageToken: failed.marketPage.token }) as PageSnapshot;
    assert.equal(next.market.length, 47);
    assert.equal(next.marketPage.hasMore, false);
    assert.equal(requests.at(-1)!.searchParams.get('page'), '2');
    const searched = await manager.handle('market.load', { query: 'react' }) as PageSnapshot;
    const count = requests.length;
    const stale = await manager.handle('market.load', { pageToken: first.marketPage.token }) as PageSnapshot;
    assert.equal(requests.length, count, '过期页令牌不发请求');
    assert.equal(stale.marketPage.query, searched.marketPage.query);
    await manager.handle('market.source.toggle', { id: first.marketSources[0]!.id, enabled: false });
    const disabled = await manager.handle('market.load', { pageToken: searched.marketPage.token }) as PageSnapshot;
    assert.equal(disabled.market.length, 0);
    assert.equal(requests.length, count, '停用源不再加载');
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('多市场续页分别使用游标和页码，取消整批不发布部分结果', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-multi-page-')));
  const requests: URL[] = [];
  let abort: AbortController | undefined;
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async address => {
      const url = new URL(address); requests.push(url);
      if (url.hostname === 'clawhub.ai') {
        if (url.searchParams.has('cursor')) abort?.abort();
        return JSON.stringify({
        items: [{ ownerHandle: 'owner', slug: url.searchParams.has('cursor') ? 'second' : 'first', displayName: '示例' }],
        nextCursor: url.searchParams.has('cursor') ? null : 'claw-next',
        });
      }
      return JSON.stringify({ code: 0, data: { total: 48, skills: [{ slug: 'hub', name: 'Hub' }] } });
    },
  });
  try {
    await useMarket(manager, 'ClawHub', true);
    const first = await manager.handle('market.load') as SkillsSnapshot;
    abort = new AbortController();
    await assert.rejects(manager.handle('market.load', { pageToken: first.marketPage!.token }, abort.signal));
    const unchanged = await manager.handle('snapshot') as SkillsSnapshot;
    assert.equal(unchanged.market.length, 2, '第一个源已读取的第二页也不发布');
    assert.equal(unchanged.marketPage!.token, first.marketPage!.token);
    abort = undefined;
    const next = await manager.handle('market.load', { pageToken: first.marketPage!.token }) as SkillsSnapshot;
    assert.equal(next.market.length, 3);
    assert.equal(next.marketPage!.hasMore, false);
    assert.equal(requests.at(-1)!.searchParams.get('cursor'), 'claw-next');
    assert.equal(requests.at(-2)!.searchParams.get('page'), '2');
    assert.equal(requests.at(-2)!.searchParams.has('cursor'), false);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('ClawHub混合搜索按实际来源下载skills.sh候选，不误走ClawHub文件接口', async () => {
  const page = await loadSkillMarket({ id: 'claw', name: 'ClawHub', url: 'https://clawhub.ai', enabled: true },
    'react', new AbortController().signal, async () => JSON.stringify({ results: [
      { source: 'skills-sh', slug: 'react', displayName: 'React', ownerHandle: 'owner',
        sourceIdentity: { owner: 'owner', repo: 'repo' }, summary: '组件' },
      { source: 'unknown', slug: 'react', displayName: '不可识别', ownerHandle: 'owner' },
    ] }));
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0]!.catalog?.kind, 'skillsh');
  const requests: string[] = [];
  await readMarketSkill(page.rows[0]!, new AbortController().signal, async url => {
    requests.push(url); return JSON.stringify({ files: [{ path: 'SKILL.md', contents: skillMarkdown({ name: 'react', description: '组件', body: '正文' }) }] });
  });
  assert.equal(requests[0], 'https://skills.sh/api/download/owner/repo/react');
});

test('SkillHub评分页面接入关键词目录，命名空间与固定版本贯穿正文和完整包', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-skillhub-')));
  const requests: URL[] = [];
  const document = skillMarkdown({ name: 'test-skill', description: '中文说明', body: '真实正文' });
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async value => {
      const url = new URL(value); requests.push(url);
      if (url.pathname.endsWith('/file')) return document;
      return JSON.stringify({ code: 0, data: { total: 234000, skills: [
        { slug: 'test-skill', name: '测试技能', description: '英文说明', description_zh: '中文说明', namespace: { handle: 'author' }, version: '1.2.3' },
        { slug: 'test-skill', name: '另一作者', description: '其他说明', namespace: { handle: 'second' }, version: '1.0.0' },
        { slug: '../bad', name: '越界', namespace: { handle: 'author' } },
      ] } });
    },
    fetchMarketResource: async value => {
      requests.push(new URL(value));
      return zip([{ path: 'SKILL.md', text: document }, { path: 'assets/data.bin', text: '\0资源' }]);
    },
  });
  try {
    const saved = await useMarket(manager, 'SkillHub');
    assert.equal(saved.marketSources[0]!.url, 'https://api.skillhub.cn/api/skills?sortBy=score&order=desc');
    assert.equal(canonicalSkillMarketUrl('https://skillhub.cn'), saved.marketSources[0]!.url);
    const snapshot = await manager.handle('market.load', { query: '测试' }) as SkillsSnapshot;
    assert.equal(snapshot.market.length, 2);
    assert.equal(new Set(snapshot.market.map(row => row.id)).size, 2, '同名但命名空间不同不合并');
    assert.equal(snapshot.market[0]!.description, '中文说明');
    assert.equal(snapshot.market[0]!.body, '');
    assert.equal(requests[0]!.searchParams.get('keyword'), '测试');
    assert.equal(requests[0]!.searchParams.get('sortBy'), 'score');
    assert.equal(requests.length, 1, '目录不预读正文');
    const detail = await manager.handle('market.detail', { id: snapshot.market[0]!.id }) as SkillMarketItem;
    assert.equal(detail.name, 'test-skill');
    assert.equal(detail.body, '真实正文');
    assert.equal(requests[1]!.searchParams.get('namespace'), 'author');
    assert.equal(requests[1]!.searchParams.get('version'), '1.2.3');
    await manager.handle('market.install', { marketId: detail.id, name: detail.name, description: detail.description,
      body: detail.body, scope: 'global', projectIds: [] });
    assert.equal(requests[2]!.pathname, '/api/v1/download');
    assert.equal(requests[2]!.searchParams.get('namespace'), 'author');
    assert.equal(requests[2]!.searchParams.get('version'), '1.2.3');
    assert.equal(await readFile(join(home, 'skills/test-skill/assets/data.bin'), 'utf8'), '\0资源');
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('SkillHub业务错误不是空成功，缺版本详情固定真实最新版本', async () => {
  const source = { id: 'hub', name: 'SkillHub', url: 'https://skillhub.cn/skills?sortBy=score', enabled: true };
  await assert.rejects(loadSkillMarket(source, '', new AbortController().signal,
    async () => JSON.stringify({ code: 500, message: '维护中', data: { skills: [] } })), /维护中/);
  const page = await loadSkillMarket(source, '', new AbortController().signal,
    async () => JSON.stringify({ code: 0, data: { total: 1, skills: [{ slug: 'demo', name: 'Demo', description: '说明' }] } }));
  const requests: URL[] = [];
  const detail = await readMarketSkill(page.rows[0]!, new AbortController().signal, async value => {
    const url = new URL(value); requests.push(url);
    return url.pathname.endsWith('/file') ? skillMarkdown({ name: 'demo', description: '说明', body: '正文' })
      : JSON.stringify({ latestVersion: { version: '2.0.0' } });
  });
  assert.equal(requests[1]!.searchParams.get('version'), '2.0.0');
  assert.equal(detail.item.catalog?.kind, 'skillhub');
});

test('停用内置市场保留已安装技能；写入拒绝保留来源和预览', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-remove-')));
  let denied = false;
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    authorize: async (_paths, operation) => { if (denied && operation === 'write') throw new Error('拒绝写入'); },
    fetchMarket: async url => url.includes('/file') ? skillMarkdown({ name: 'keep-skill', description: '说明', body: '正文' })
      : JSON.stringify({ items: [{ ownerHandle: 'owner', slug: 'keep-skill', displayName: 'keep-skill' }], nextCursor: null }),
    fetchMarketResource: async () => zip([{ path: 'SKILL.md', text: skillMarkdown({ name: 'keep-skill', description: '说明', body: '正文' }) }]),
  });
  try {
    await useMarket(manager, 'ClawHub');
    const loaded = await manager.handle('market.load', {}) as SkillsSnapshot;
    const id = loaded.marketSources.find(s => s.name === 'ClawHub')!.id, candidate = loaded.market[0]!;
    const detail = await manager.handle('market.detail', { id: candidate.id }) as SkillMarketItem;
    await manager.handle('market.install', { marketId: detail.id, name: detail.name, description: detail.description,
      body: detail.body, scope: 'global', projectIds: [] });
    denied = true;
    await assert.rejects(manager.handle('market.source.toggle', { id, enabled: false }), /拒绝写入/);
    assert.equal((await manager.handle('snapshot') as SkillsSnapshot).marketSources.find(s => s.id === id)!.enabled, true);
    assert.equal((await manager.handle('market.detail', { id: candidate.id }) as SkillMarketItem).name, candidate.name);
    denied = false;
    await assert.rejects(manager.handle('market.source.toggle', { id, enabled: false, extra: true }));
    await assert.rejects(manager.handle('market.source.toggle', { id: 'missing', enabled: false }), /市场数据源不存在/);
    const removed = await manager.handle('market.source.toggle', { id, enabled: false }) as SkillsSnapshot;
    assert.equal(removed.marketSources.length, 2);
    assert.equal(removed.market.length, 0);
    assert.equal(removed.skills.length, 1);
    assert.equal(JSON.parse(await readFile(join(home, 'workbase/skills/state.json'), 'utf8')).marketSources.find((s: { id: string }) => s.id === id).enabled, false);
    assert.match(await readFile(join(home, 'skills/keep-skill/SKILL.md'), 'utf8'), /正文/);
    await assert.rejects(manager.handle('market.detail', { id: candidate.id }), /不存在/);
    await assert.rejects(manager.handle('market.install', { marketId: detail.id, name: detail.name, description: detail.description,
      body: detail.body, scope: 'global', projectIds: [] }), /预览已失效/);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('正常市场榜单截断不计为来源错误', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-truncated-')));
  let page = 0;
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async () => JSON.stringify({ items: Array.from({ length: 50 }, (_, i) => ({
      slug: `skill-${i}`, displayName: `Skill ${i}`, summary: '说明', owner: { handle: 'tester' },
    })), nextCursor: `next-${++page}` }),
  });
  try {
    await useMarket(manager, 'ClawHub');
    const snapshot = await manager.handle('market.load', {}) as SkillsSnapshot;
    assert.equal(snapshot.market.length, 50);
    assert.equal(snapshot.marketSources.find(s => s.name === 'ClawHub')!.issue, undefined);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

function zip(files: { path: string; text: string; mode?: number }[]) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path), content = Buffer.from(file.text), packed = deflateRawSync(content);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(((file.mode ?? 0x8000) << 16) >>> 0, 38); entry.writeUInt32LE(offset, 42);
    local.push(header, name, packed); central.push(entry, name); offset += header.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.reduce((sum, item) => sum + item.length, 0), 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

async function mcpCatalog(payload: unknown, query = '') {
  const home = await mkdtemp(join(tmpdir(), 'market-mcp-'));
  const manager = new McpManager({ home, projects: () => [] });
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload));
  try {
    await manager.handle('sourceToggle', { id: builtinMcpSource.id, enabled: false });
    await manager.handle('sourceSave', { name: '目录', url: 'https://example.org/catalog.json' });
    return await manager.handle('market', { query }) as { candidates: McpCandidate[]; errors: unknown[] };
  } finally { globalThis.fetch = fetch; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
}

test('MCP 社区目录拆分多个服务，保留认证模式及待填写变量', async () => {
  const result = await mcpCatalog({ connectors: [{
    id: 'docs', name: '文档', summary: '搜索文档', auth: { mode: 'api-key', apiKeyHeader: 'X-Docs-Key' },
    servers: [
      { serverKey: 'search', serverName: 'docs-search', transport: 'streamable-http', url: 'https://example.org/search',
        headers: { Accept: 'application/json', 'X-Docs-Key': '${credential:key}' } },
      { serverKey: 'local', serverName: 'docs-local', transport: 'stdio', command: 'npx',
        args: ['-y', 'docs-mcp'], env: { DOCS_KEY: '${credential:key}' } },
    ],
  }] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(row => row.config.transport), ['http', 'stdio']);
  assert.equal(result.candidates[0]!.config.auth, 'api-key');
  assert.equal(result.candidates[0]!.config.keyHeader, 'X-Docs-Key');
  assert.equal(result.candidates[0]!.config.headers?.Accept, 'application/json');
  assert.equal(result.candidates[0]!.config.headers?.['X-Docs-Key'], '');
  assert.deepEqual(result.candidates[1]!.config.env, { DOCS_KEY: '' });
  assert.equal(result.candidates[1]!.config.auth, 'none');
});

test('MCP 连接器保留完整介绍和显式凭据绑定，不导入凭据原文或危险链接', async () => {
  const result = await mcpCatalog({ connectors: [{
    name: '地图', summary: '地图搜索', description: '完整功能与接入说明', vendor: '地图平台', category: '出行',
    homepage: 'https://example.org/docs',
    auth: { mode: 'api-key', credentialDescription: '申请后填写',
      credentialHelpUrl: 'javascript:alert(1)', credentialFields: [
        { key: 'apiKey', label: '地图 Key', placeholder: '请输入 Key', required: true, secret: true, value: 'never-copy' },
        { key: 'region', label: '区域', required: false, secret: false },
      ] },
    servers: [{ transport: 'stdio', command: 'npx', args: ['-y', 'maps'],
      credentialBindings: { MAP_KEY: 'apiKey', SEARCH_KEY: 'apiKey', REGION: 'region', INVALID: 'unknown' } }],
  }] });
  const candidate = result.candidates[0]!;
  assert.equal(candidate.metadata?.description, '完整功能与接入说明');
  assert.equal(candidate.metadata?.vendor, '地图平台');
  assert.equal(candidate.metadata?.homepage, 'https://example.org/docs');
  assert.equal(candidate.metadata?.credentialHelpUrl, '');
  assert.deepEqual(candidate.metadata?.credentialFields[0]?.bindings, [
    { target: 'env', name: 'MAP_KEY' }, { target: 'env', name: 'SEARCH_KEY' },
  ]);
  assert.deepEqual(candidate.config.env, { MAP_KEY: '', SEARCH_KEY: '', REGION: '' });
  assert.ok(!JSON.stringify(candidate).includes('never-copy'));
});

test('MCP 多请求头凭据字段独立绑定，普通单密钥保留目录名称和提示', async () => {
  const result = await mcpCatalog({ connectors: [{
    name: '双密钥', auth: { mode: 'none', headerCredentialFields: [
      { key: 'clientId', label: '客户端 ID', required: true, secret: false },
      { key: 'clientSecret', label: '客户端密钥', required: true, secret: true },
    ] }, servers: [{ url: 'https://example.org/mcp', headerCredentialBindings: {
      'X-Client-Id': 'clientId', 'X-Client-Secret': 'clientSecret',
    } }],
  }, {
    name: '单密钥', auth: { mode: 'bearer', credentialName: '服务 Token', credentialPlaceholder: '填写 Token' },
    servers: [{ url: 'https://example.org/token' }],
  }] });
  assert.deepEqual(result.candidates[0]!.metadata?.credentialFields.map(field => field.bindings), [
    [{ target: 'headers', name: 'X-Client-Id' }], [{ target: 'headers', name: 'X-Client-Secret' }],
  ]);
  assert.equal(result.candidates[1]!.metadata?.credentialName, '服务 Token');
  assert.equal(result.candidates[1]!.metadata?.credentialPlaceholder, '填写 Token');
});

test('MCP 官方 Registry 展开远程服务及 npm／PyPI 包，过滤下架版本', async () => {
  const result = await mcpCatalog({ servers: [
    { server: { name: 'org.test/demo', title: '示例', description: '测试目录', remotes: [
      { type: 'streamable-http', url: 'https://example.org/mcp' },
    ], packages: [
      { registryType: 'npm', identifier: '@test/mcp', version: '1.2.0', transport: { type: 'stdio' },
        environmentVariables: [{ name: 'TOKEN', isSecret: true }] },
      { registryType: 'pypi', identifier: 'demo-mcp', version: '2.0.0', transport: { type: 'stdio' } },
    ] } },
    { server: { name: 'removed', remotes: [{ type: 'streamable-http', url: 'https://example.org/removed' }] },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deleted' } } },
  ] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0]!.config.url, 'https://example.org/mcp');
  assert.deepEqual(result.candidates[1]!.config.args, ['-y', '@test/mcp@1.2.0']);
  assert.deepEqual(result.candidates[1]!.config.env, { TOKEN: '' });
  assert.equal(result.candidates[2]!.config.command, 'uvx');
  assert.deepEqual(result.candidates[2]!.config.args, ['demo-mcp==2.0.0']);
});

test('MCP 保留旧目录格式，非法条目不丢掉有效条目，SSE不伪装HTTP', async () => {
  const legacy = await mcpCatalog({ servers: [
    { name: '旧目录', description: '保留', config: { transport: 'http', url: 'https://example.org/mcp' } },
    null,
  ] });
  assert.equal(legacy.candidates[0]?.config.url, 'https://example.org/mcp');
  const result = await mcpCatalog([{ id: 'legacy-sse', name: '旧SSE', servers: [
    { serverName: 'legacy', transport: 'sse', url: 'https://example.org/sse' },
  ] }]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]!.config.url, undefined);
  assert.match((result.candidates[0] as McpCandidate & { issue: string }).issue, /SSE/);
});

test('MCP 官方市场地址搜索并沿同源游标分页，重复版本去重', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-pages-'));
  const manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch, requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); requests.push(url);
    return new Response(JSON.stringify({ servers: [
      { server: { name: 'test/service', remotes: [{ type: 'streamable-http', url: 'https://example.org/mcp' }] } },
    ], metadata: requests.length === 1 ? { nextCursor: 'next:1' } : {} }));
  };
  try {
    await manager.handle('sourceToggle', { id: builtinMcpSource.id, enabled: false });
    await manager.handle('sourceSave', { name: '官方', url: 'https://registry.modelcontextprotocol.io' });
    const result = await manager.handle('market', { query: 'service' }) as { candidates: McpCandidate[] };
    assert.equal(requests[0]!.pathname, '/v0.1/servers');
    assert.equal(requests[0]!.searchParams.get('search'), 'service');
    assert.equal(requests[1]!.searchParams.get('cursor'), 'next:1');
    assert.equal(result.candidates.length, 1);
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('连接器市场刷新失败保留同源同查询的成功目录，成功空结果替换旧目录', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-refresh-'));
  const manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch;
  let mode: 'data' | 'fail' | 'empty' = 'data';
  globalThis.fetch = async () => mode === 'fail' ? new Response('', { status: 503 })
    : new Response(JSON.stringify({ connectors: mode === 'empty' ? [] : [{
      name: '文档服务', servers: [{ url: 'https://example.org/mcp' }],
    }] }));
  type Result = { candidates: McpCandidate[]; errors: { sourceId: string; message: string }[] };
  try {
    const first = await manager.handle('market', { query: '文档' }) as Result;
    assert.equal(first.candidates.length, 1);
    mode = 'fail';
    const failed = await manager.handle('market', { query: '文档' }) as Result;
    assert.deepEqual(failed.candidates, first.candidates, '失败不能把成功目录覆盖为空列表');
    assert.match(failed.errors[0]!.message, /HTTP 503/);
    assert.match(failed.errors[0]!.message, /上次成功/);
    const another = await manager.handle('market', { query: '地图' }) as Result;
    assert.equal(another.candidates.length, 0, '不同搜索不能显示旧查询缓存');
    mode = 'empty';
    const empty = await manager.handle('market', { query: '文档' }) as Result;
    assert.equal(empty.candidates.length, 0);
    assert.equal(empty.errors.length, 0);
    mode = 'fail';
    assert.equal(((await manager.handle('market', { query: '文档' })) as Result).candidates.length, 0,
      '成功空目录之后失败也不能复活旧条目');
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('连接器市场缓存按来源地址隔离，停用和移除不显示缓存，取消不返回缓存', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-source-cache-'));
  const manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch;
  let fail = false, abort: AbortController | undefined;
  globalThis.fetch = async () => {
    abort?.abort();
    if (fail) throw new TypeError('fetch failed: https://private.example.invalid/secret');
    return new Response(JSON.stringify({ connectors: [{ name: '示例', servers: [{ url: 'https://example.org/mcp' }] }] }));
  };
  type Result = { candidates: McpCandidate[]; errors: { message: string }[] };
  try {
    await manager.handle('sourceToggle', { id: builtinMcpSource.id, enabled: false });
    const source = await manager.handle('sourceSave', { name: '目录', url: 'https://example.org/a' }) as { id: string };
    assert.equal(((await manager.handle('market')) as Result).candidates.length, 1);
    fail = true;
    const cached = await manager.handle('market') as Result;
    assert.equal(cached.candidates.length, 1);
    assert.match(cached.errors[0]!.message, /网络连接失败/);
    assert.ok(!cached.errors[0]!.message.includes('private.example'), '不泄露原始错误中的路径和服务地址');
    await manager.handle('sourceSave', { id: source.id, name: '目录', url: 'https://example.org/b' });
    assert.equal(((await manager.handle('market')) as Result).candidates.length, 0);
    await manager.handle('sourceSave', { id: source.id, name: '目录', url: 'https://example.org/a' });
    abort = new AbortController();
    await assert.rejects(manager.handle('market', {}, abort.signal));
    abort = undefined;
    await manager.handle('sourceToggle', { id: source.id, enabled: false });
    assert.equal(((await manager.handle('market')) as Result).candidates.length, 0);
    await manager.handle('sourceRemove', { id: source.id });
    assert.equal(((await manager.handle('market')) as Result).candidates.length, 0);
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('连接器市场本地缓存重启可直接读取，远端成功更新和空目录均同步落盘', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-local-'));
  let manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch;
  let name = '旧目录', requests = 0, fail = false;
  globalThis.fetch = async () => {
    requests++;
    if (fail) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ connectors: name ? [{ name, auth: { mode: 'api-key', headerCredentialFields: [
      { key: 'key', label: '服务密钥', required: true },
    ] }, servers: [{ url: 'https://example.org/mcp', headerCredentialBindings: { 'X-Service-Key': 'key' } }] }] : [] }));
  };
  type Result = { candidates: McpCandidate[]; errors: { message: string }[] };
  try {
    await manager.handle('market');
    const file = join(home, 'workbase/mcp-market.json');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await manager.dispose();
    manager = new McpManager({ home, projects: () => [] });
    fail = true;
    const before = requests;
    const cached = await manager.handle('market.cached') as Result;
    assert.equal(cached.candidates[0]!.name, '旧目录');
    assert.equal(cached.candidates[0]!.config.headers?.['X-Service-Key'], '');
    assert.deepEqual(cached.candidates[0]!.metadata?.credentialFields[0]!.bindings,
      [{ target: 'headers', name: 'X-Service-Key' }], '本地恢复仍保留安装所需凭据字段与绑定，不保存密钥值');
    assert.equal(requests, before, '读取本地缓存不能等待或请求远端');
    assert.equal(((await manager.handle('market')) as Result).candidates[0]!.name, '旧目录');
    fail = false; name = '新目录';
    await manager.handle('market');
    await manager.dispose();
    manager = new McpManager({ home, projects: () => [] });
    assert.equal(((await manager.handle('market.cached')) as Result).candidates[0]!.name, '新目录');
    name = '';
    await manager.handle('market');
    await manager.dispose();
    manager = new McpManager({ home, projects: () => [] });
    assert.equal(((await manager.handle('market.cached')) as Result).candidates.length, 0,
      '重启也不能复活成功空响应之前的旧目录');
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('本地市场缓存损坏不阻塞配置及远端加载，写入失败保留在线结果并提示', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-local-errors-'));
  const file = join(home, 'workbase/mcp-market.json');
  await mkdir(join(home, 'workbase'));
  await writeFile(file, '{invalid JSON');
  const manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ connectors: [
    { name: '在线目录', servers: [{ url: 'https://example.org/mcp' }] },
  ] }));
  type Result = { candidates: McpCandidate[]; errors: { message: string }[] };
  try {
    assert.equal(((await manager.handle('market.cached')) as Result).candidates.length, 0);
    assert.equal(((await manager.handle('market')) as Result).candidates[0]!.name, '在线目录');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 1, '成功拉取后重建损坏缓存');
    await rm(file);
    await mkdir(file);
    const response = await manager.handle('market') as Result;
    assert.equal(response.candidates[0]!.name, '在线目录', '落盘失败不能丢掉已经拉取的在线目录');
    assert.match(response.errors[0]!.message, /本地缓存保存失败/);
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('连接器市场分别报告超时和目录格式错误，不把失败伪装成正常空目录', async () => {
  const home = await mkdtemp(join(tmpdir(), 'market-errors-'));
  const manager = new McpManager({ home, projects: () => [] });
  const original = globalThis.fetch;
  type Result = { candidates: McpCandidate[]; errors: { message: string }[] };
  try {
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.match(((await manager.handle('market')) as Result).errors[0]!.message, /请求超时/);
    globalThis.fetch = async () => new Response('<html>upstream error</html>');
    assert.match(((await manager.handle('market')) as Result).errors[0]!.message, /JSON 格式无效/);
    globalThis.fetch = async () => new Response(JSON.stringify({ unsupported: true }));
    assert.match(((await manager.handle('market')) as Result).errors[0]!.message, /目录格式不支持/);
  } finally { globalThis.fetch = original; await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('技能市场 skills.sh 搜索结果按需下载正文，保留关联文件', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-skills-')));
  const requests: string[] = [];
  const options: SkillsManagerOptions & { fetchMarket: (url: string) => Promise<string> } = {
    home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async url => {
      requests.push(url);
      if (url.includes('/search')) return JSON.stringify({ results: [
        { source: 'skills-sh', sourceIdentity: { owner: 'owner', repo: 'repo' }, slug: 'test-skill', displayName: 'test-skill', installs: 10 },
        { source: '../../evil', skillId: '../bad', name: 'bad' },
      ] });
      return JSON.stringify({ files: [
        { path: 'SKILL.md', contents: '---\nname: test-skill\ndescription: 详细说明\ndisable-model-invocation: true\nmetadata:\n  category: test\n---\n真实正文' },
        { path: 'scripts/help.txt', contents: '关联文件' },
      ] });
    },
  };
  const manager = new SkillsManager(options);
  try {
    await useMarket(manager, 'ClawHub');
    const snapshot = await manager.handle('market.load', { query: 'react' }) as SkillsSnapshot;
    assert.equal(snapshot.market.length, 1);
    assert.equal(snapshot.market[0]!.body, '');
    assert.equal(new URL(requests[0]!).searchParams.get('q'), 'react');
    assert.equal(requests.length, 1, '目录加载不提前下载技能正文');
    const detail = await manager.handle('market.detail', { id: snapshot.market[0]!.id }) as SkillMarketItem & { files: string[] };
    assert.equal(detail.description, '详细说明');
    assert.equal(detail.body, '真实正文');
    assert.deepEqual(detail.files, ['SKILL.md', 'scripts/help.txt']);
    assert.match(requests[1]!, /\/api\/download\/owner\/repo\/test-skill$/);
    await manager.handle('market.install', { marketId: detail.id, name: detail.name, description: detail.description,
      body: '编辑后的正文', scope: 'global', projectIds: [] });
    assert.equal(await readFile(join(home, 'skills/test-skill/scripts/help.txt'), 'utf8'), '关联文件');
    const instruction = await readFile(join(home, 'skills/test-skill/SKILL.md'), 'utf8');
    assert.match(instruction, /disable-model-invocation: true/);
    assert.match(instruction, /  category: test/);
    assert.match(instruction, /编辑后的正文/);
    await assert.rejects(manager.handle('market.detail', { id: 'unregistered' }), /市场/);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('市场ZIP解包保留二进制文件，拒绝穿越、链接、重复路径和损坏归档', () => {
  const document = skillMarkdown({ name: 'test-skill', description: '说明', body: '正文' });
  const archive = zip([{ path: 'SKILL.md', text: document }, { path: 'assets/data.bin', text: '\0二进制' }]);
  assert.equal(readMarketZip(archive).get('assets/data.bin')!.toString(), '\0二进制');
  for (const file of [
    { path: '../escape', text: 'bad' }, { path: '/absolute', text: 'bad' },
    { path: 'C:\\escape', text: 'bad' }, { path: 'link', text: 'target', mode: 0xa000 },
    { path: 'SKILL.md', text: 'duplicate' },
  ]) assert.throws(() => readMarketZip(zip([{ path: 'SKILL.md', text: document }, file])));
  const corrupt = Buffer.from(archive);
  const firstCentral = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupt.writeUInt32LE(0, firstCentral + 16);
  assert.throws(() => readMarketZip(corrupt), /校验失败/);
  assert.throws(() => readMarketZip(archive.subarray(0, archive.length - 1)), /ZIP/);
});

test('市场详情及安装保留原始显示名称', async () => {
  const candidate: SkillMarketItem = { id: 'react', marketSourceId: 'claw', name: 'React', description: '', body: '',
    catalog: { kind: 'clawhub', owner: 'owner', slug: 'react' } };
  const result = await readMarketSkill(candidate, new AbortController().signal,
    async () => '---\nname: React\ndescription: React技能\n---\n正文');
  assert.equal(result.item.name, 'React');
  assert.equal(candidate.name, 'React');
  assert.match(result.bundle.get('SKILL.md')!.toString(), /name: React/);
});

test('ClawHub安装保留完整包；预览后版本变化或来源停用不写入', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-install-')));
  const markdown = skillMarkdown({ name: 'test-skill', description: '说明', body: '正文' });
  let changed = true;
  const manager = new SkillsManager({
    home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async (address: string) => address.includes('/file') ? markdown
      : JSON.stringify({ items: [{ ownerHandle: 'owner', slug: 'test-skill', displayName: '测试技能' }], nextCursor: null }),
    fetchMarketResource: async () => zip([
      { path: 'SKILL.md', text: changed ? markdown.replace('正文', '新正文') : markdown },
      { path: 'helper.bin', text: '\0关联文件' },
    ]),
  });
  try {
    await useMarket(manager, 'ClawHub');
    const snapshot = await manager.handle('market.load') as SkillsSnapshot;
    const detail = await manager.handle('market.detail', { id: snapshot.market[0]!.id }) as SkillMarketItem;
    const input = { marketId: detail.id, name: detail.name, description: detail.description, body: detail.body, scope: 'global' };
    await assert.rejects(manager.handle('market.install', input), /版本已变化/);
    await assert.rejects(readFile(join(home, 'skills/test-skill/SKILL.md')));
    const source = snapshot.marketSources.find(s => s.name === 'ClawHub')!;
    await manager.handle('market.source.toggle', { id: source.id, enabled: false });
    await assert.rejects(manager.handle('market.install', input), /预览已失效/);
    await manager.handle('market.source.toggle', { id: source.id, enabled: true });
    changed = false;
    await manager.handle('market.install', input);
    assert.equal(await readFile(join(home, 'skills/test-skill/helper.bin'), 'utf8'), '\0关联文件');
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('旧技能源仍可预览，市场文件路径越界在保存前拒绝', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-old-')));
  let invalid = false;
  const markdown = skillMarkdown({ name: 'test-skill', description: '说明', body: '正文' });
  const manager = new SkillsManager({
    home, projects: () => [], config: () => ({ defaultSourceId: '', defaultEnabled: true }),
    fetchMarket: async (address: string) => address.includes('/api/search')
      ? JSON.stringify({ skills: [{ source: 'owner/repo', skillId: 'test-skill', name: 'test-skill' }] })
      : address.includes('/api/download')
        ? JSON.stringify({ files: [{ path: invalid ? '../SKILL.md' : 'SKILL.md', contents: markdown }] }) : markdown,
  });
  try {
    const old = await loadSkillMarket({ id: 'legacy', name: '旧目录', url: 'https://example.org/SKILL.md', enabled: true }, '', new AbortController().signal, async () => markdown);
    assert.equal(old.rows[0]!.body, '正文');
    const oldDetail = await readMarketSkill(old.rows[0]!, new AbortController().signal, async () => markdown);
    assert.equal(oldDetail.item.name, 'test-skill');
    invalid = true;
    const loaded = await loadSkillMarket({ id: 'legacy-skills', name: 'skills.sh', url: 'https://skills.sh', enabled: true }, 'test', new AbortController().signal,
      async () => JSON.stringify({ skills: [{ source: 'owner/repo', skillId: 'test-skill', name: 'test-skill' }] }));
    const remote = loaded.rows.find(row => row.catalog)!;
    await assert.rejects(readMarketSkill(remote, new AbortController().signal, async () => JSON.stringify({ files: [{ path: '../SKILL.md', contents: markdown }] })), /非法/);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('技能市场 ClawHub 空查询榜单分页、搜索与文件详情，兼容常见YAML说明块', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-claw-')));
  const requests: URL[] = [];
  const manager = new SkillsManager({
    home, projects: () => [], config: () => ({ defaultSourceId: '', defaultEnabled: true }),
    fetchMarket: async (address: string) => {
      const url = new URL(address); requests.push(url);
      if (url.pathname.endsWith('/file')) return '---\nname: test-skill\ndescription: >-\n  多行\n  说明\nmetadata:\n  category: test\n---\n正文';
      const row = { ownerHandle: 'owner', slug: 'test-skill', displayName: '测试技能', summary: '摘要' };
      return JSON.stringify(url.pathname.endsWith('/search') ? { results: [row] }
        : { items: [row], nextCursor: url.searchParams.has('cursor') ? null : 'page-2' });
    },
  } as SkillsManagerOptions);
  try {
    await useMarket(manager, 'ClawHub');
    const listed = await manager.handle('market.load') as SkillsSnapshot;
    assert.equal(requests.length, 1, '首批只加载一页');
    await manager.handle('market.load', { pageToken: (listed as SkillsSnapshot & { marketPage: { token: string } }).marketPage.token });
    assert.equal(listed.market.length, 1, '跨页重复技能去重');
    assert.equal(requests[1]!.searchParams.get('cursor'), 'page-2');
    const searched = await manager.handle('market.load', { query: 'test' }) as SkillsSnapshot;
    assert.equal(requests.at(-1)!.pathname, '/api/v1/search');
    const detail = await manager.handle('market.detail', { id: searched.market[0]!.id }) as SkillMarketItem;
    assert.equal(detail.name, 'test-skill');
    assert.equal(detail.description, '多行 说明');
    assert.equal(detail.body, '正文');
    assert.equal(requests.at(-1)!.searchParams.get('owner'), 'owner');
    assert.equal(requests.at(-1)!.searchParams.get('path'), 'SKILL.md');
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('C01 市场安装及再次编辑、重启保留复杂frontmatter与list/get调用限制', async () => {
  const { Context } = await import('@deepseek-ai/cordis');
  const { SkillRegistry } = await import('@deepseek-ai/dsh-skill');
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-invocation-')));
  const ctx = new Context(), registry = new SkillRegistry(ctx);
  const markdown = '---\nname: test-skill\ndescription: >-\n  original\n  description\ndisable-model-invocation: true\nuser-invocable: false\nmetadata:\n  category: audit\n---\nbody';
  const options = { ctx, home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async (url: string) => url.includes('/file') ? markdown
      : JSON.stringify({ items: [{ ownerHandle: 'owner', slug: 'test-skill', displayName: 'test-skill' }], nextCursor: null }),
    fetchMarketResource: async () => zip([{ path: 'SKILL.md', text: markdown }, { path: 'helper.txt', text: 'helper' }]),
  };
  let manager = new SkillsManager(options);
  try {
    await useMarket(manager, 'ClawHub');
    const listed = await manager.handle('market.load') as SkillsSnapshot;
    const detail = await manager.handle('market.detail', { id: listed.market[0]!.id }) as SkillMarketItem;
    let receipt = await manager.handle('market.install', { marketId: detail.id, name: detail.name,
      description: detail.description, body: detail.body, scope: 'global' }) as import('../src/shared/skills.js').SkillReceipt;
    const check = async () => {
      const expected = { modelInvocable: false, userInvocable: false };
      assert.deepEqual((await registry.list()).find(skill => skill.name === 'test-skill')?.invocation, expected);
      assert.deepEqual((await registry.get('test-skill'))?.invocation, expected);
      const text = await readFile(join(home, 'skills', 'test-skill', 'SKILL.md'), 'utf8');
      assert.match(text, /disable-model-invocation: true/);
      assert.match(text, /user-invocable: false/);
      assert.match(text, /metadata:\n  category: audit/);
      assert.equal(await readFile(join(home, 'skills', 'test-skill', 'helper.txt'), 'utf8'), 'helper');
    };
    await check();
    receipt = await manager.handle('save', { id: receipt.skill.id, version: receipt.skill.version, name: detail.name,
      description: 'edited description', body: 'edited body', scope: 'global' }) as typeof receipt;
    await check();
    const edited = await readFile(join(home, 'skills', 'test-skill', 'SKILL.md'), 'utf8');
    assert.ok(!edited.includes('  original'));
    assert.match(edited, /edited body/);
    await manager.dispose(); manager = new SkillsManager(options);
    await check();
    assert.deepEqual((await manager.snapshot()).skills[0]?.invocation, { modelInvocable: false, userInvocable: false });
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});
