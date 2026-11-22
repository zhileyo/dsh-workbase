import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSkillRepository } from '../src/server/skills-repository.js';
import { publicSkillAddress, pinnedSkillLookup } from '../src/server/skills-network.js';
import { skillMarkdown } from '../src/shared/skills.js';

const sha = 'a'.repeat(40);
const content = { name: 'repository-skill', description: '仓库技能', body: '真实字节' };
const fixture = (mode = '100644', truncated = false) => {
  const urls: string[] = [];
  return { urls, async fetch(url: string) {
    urls.push(url);
    if (url.endsWith('/repo')) return Buffer.from(JSON.stringify({ default_branch: 'main' }));
    if (url.includes('/commits/')) return Buffer.from(JSON.stringify({ sha }));
    if (url.includes('/git/trees/')) return Buffer.from(JSON.stringify({ truncated, tree: [
      { path: 'skills/example/SKILL.md', mode: '100644', type: 'blob', size: 100 },
      { path: 'skills/example/asset.bin', mode, type: 'blob', size: 3 },
      { path: 'unrelated.txt', mode: '100644', type: 'blob', size: 50 },
    ] }));
    if (url.endsWith('SKILL.md')) return Buffer.from(skillMarkdown(content));
    if (url.endsWith('asset.bin')) return Buffer.from([0, 255, 128]);
    throw new Error(`不应下载 ${url}`);
  } };
};
test('仓库目录固定提交并完整保留二进制关联文件，不下载无关源码', async () => {
  const f = fixture();
  const rows = await readSkillRepository('https://github.com/example/repo/tree/main/skills/example', new AbortController().signal, f.fetch);
  assert.equal(rows.length, 1); assert.equal(rows[0]?.commit, sha);
  assert.equal(rows[0]?.content.name, content.name);
  assert.deepEqual(rows[0]?.bundle.get('asset.bin'), Buffer.from([0, 255, 128]));
  assert.ok(f.urls.filter(url => url.includes('raw.githubusercontent')).every(url => url.includes(sha)));
  assert.ok(!f.urls.some(url => url.endsWith('unrelated.txt')));
});
test('仓库拒绝链接、不完整索引及不受支持的凭据地址', async () => {
  const symlink = fixture('120000'), truncated = fixture('100644', true);
  await assert.rejects(readSkillRepository('https://github.com/example/repo', new AbortController().signal, symlink.fetch), /符号链接/);
  await assert.rejects(readSkillRepository('https://github.com/example/repo', new AbortController().signal, truncated.fetch), /不完整/);
  await assert.rejects(readSkillRepository('https://token@github.com/example/repo', new AbortController().signal), /无凭据/);
  await assert.rejects(readSkillRepository('file:///tmp/repo', new AbortController().signal), /GitHub/);
});
test('市场和仓库网络共同拒绝回环、私网及IPv6本地地址', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1'])
    assert.equal(publicSkillAddress(address), false, address);
  assert.equal(publicSkillAddress('8.8.8.8'), true);
});
test('固定DNS lookup同时遵循Node单地址与all地址回调契约', () => {
  const address = { address: '8.8.8.8', family: 4 }, lookup = pinnedSkillLookup(address);
  let checked = 0;
  lookup('example.com', { all: false }, (error, value, family) => {
    assert.equal(error, null); assert.equal(value, address.address); assert.equal(family, 4); checked++;
  });
  lookup('example.com', { all: true }, (error, value) => {
    assert.equal(error, null); assert.deepEqual(value, [address]); checked++;
  });
  assert.equal(checked, 2);
});

test('C14 JSON保留2 MiB上限，3 MiB资源使用剩余20 MiB预算', async () => {
  const markdown = Buffer.from(skillMarkdown(content)), limit = 20 * 1024 * 1024;
  const limits: number[] = [];
  const rows = await readSkillRepository('https://github.com/example/repo/tree/main', new AbortController().signal,
    async (url, _signal, redirects = 0, maxBytes = 2 * 1024 * 1024) => {
      assert.equal(redirects, 0);
      if (!url.includes('raw.githubusercontent')) {
        assert.equal(maxBytes, 2 * 1024 * 1024);
        return Buffer.from(JSON.stringify(url.includes('/commits/') ? { sha } : { truncated: false, tree: [
          { path: 'SKILL.md', mode: '100644', type: 'blob', size: markdown.length },
          { path: 'asset.bin', mode: '100644', type: 'blob', size: 3 * 1024 * 1024 },
        ] }));
      }
      const data = url.endsWith('SKILL.md') ? markdown : Buffer.alloc(3 * 1024 * 1024);
      limits.push(maxBytes);
      if (data.length > maxBytes) throw new Error('transport limit exceeded');
      return data;
    });
  assert.equal(rows[0]!.bundle.get('asset.bin')!.length, 3 * 1024 * 1024);
  assert.deepEqual(limits, [limit, limit - markdown.length]);
});

for (const declared of [true, false]) test(`C14 总量超过20 MiB拒绝，${declared ? '可信索引预检' : '实际下载复核'}`, async () => {
  let resources = 0;
  await assert.rejects(readSkillRepository('https://github.com/example/repo/tree/main', new AbortController().signal,
    async url => {
      if (url.includes('/commits/')) return Buffer.from(JSON.stringify({ sha }));
      if (url.includes('/git/trees/')) return Buffer.from(JSON.stringify({ truncated: false, tree: [
        { path: 'SKILL.md', mode: '100644', type: 'blob', size: 100 },
        { path: 'asset.bin', mode: '100644', type: 'blob', size: declared ? 20 * 1024 * 1024 : 1 },
      ] }));
      resources++;
      return url.endsWith('SKILL.md') ? Buffer.from(skillMarkdown(content)) : Buffer.alloc(20 * 1024 * 1024);
    }), /20 MB/);
  assert.equal(resources, declared ? 1 : 2);
});

test('C14 实际下载总量恰好20 MiB允许，索引大小缺失仍逐文件限制预算', async () => {
  const markdown = Buffer.from(skillMarkdown(content)), limit = 20 * 1024 * 1024;
  const rows = await readSkillRepository('https://github.com/example/repo/tree/main', new AbortController().signal,
    async (url, _signal, _redirects, maxBytes = 2 * 1024 * 1024) => {
      if (url.includes('/commits/')) return Buffer.from(JSON.stringify({ sha }));
      if (url.includes('/git/trees/')) return Buffer.from(JSON.stringify({ truncated: false, tree: [
        { path: 'SKILL.md', mode: '100644', type: 'blob' },
        { path: 'asset.bin', mode: '100644', type: 'blob' },
      ] }));
      const data = url.endsWith('SKILL.md') ? markdown : Buffer.alloc(limit - markdown.length);
      assert.equal(maxBytes, url.endsWith('SKILL.md') ? limit : limit - markdown.length);
      return data;
    });
  assert.equal([...rows[0]!.bundle.values()].reduce((sum, data) => sum + data.length, 0), limit);
});
