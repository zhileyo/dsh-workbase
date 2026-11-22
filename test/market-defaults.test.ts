import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillsManager } from '../src/server/skills.js';
import type { SkillsSnapshot } from '../src/shared/skills.js';

test('内置市场首次仅开启SkillHub，拒绝新增和删除，开关持久化', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-defaults-')));
  const create = () => new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }) });
  let manager = create();
  try {
    const snapshot = await manager.handle('snapshot') as SkillsSnapshot;
    assert.deepEqual(snapshot.marketSources.map(s => [s.name, s.enabled]), [['SkillHub', true], ['ClawHub', false]]);
    await assert.rejects(readFile(join(home, 'workbase/skills/state.json')));
    await assert.rejects(manager.handle('market.source.save', { name: '其他', url: 'https://example.org' }), /仅支持内置来源/);
    await assert.rejects(manager.handle('market.source.remove', { id: snapshot.marketSources[0]!.id }), /仅支持内置来源/);
    await manager.handle('market.source.toggle', { id: snapshot.marketSources[0]!.id, enabled: false });
    await manager.dispose(); manager = create();
    assert.deepEqual((await manager.handle('snapshot') as SkillsSnapshot).marketSources.map(s => s.enabled), [false, false]);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('旧配置保留官方来源开关与标识，自定义来源留存但不展示或请求', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'market-migration-')));
  const path = join(home, 'workbase/skills/state.json');
  await mkdir(join(home, 'workbase/skills'), { recursive: true });
  const legacy = { id: 'custom', name: '旧目录', url: 'https://example.org/skills.json', enabled: true };
  await writeFile(path, JSON.stringify({ revision: 3, policies: {}, sources: [], skills: [], marketSources: [
    legacy, { id: 'old-hub', name: '旧名称', url: 'https://skillhub.cn/skills?sortBy=score', enabled: false },
    { id: 'old-claw', name: '爪子', url: 'https://clawhub.ai', enabled: true },
  ] }));
  const requests: string[] = [];
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    fetchMarket: async url => { requests.push(url); return JSON.stringify({ items: [], nextCursor: null }); } });
  try {
    const loaded = await manager.handle('market.load') as SkillsSnapshot;
    assert.deepEqual(loaded.marketSources.map(s => [s.id, s.name, s.enabled]), [['old-hub', 'SkillHub', false], ['old-claw', 'ClawHub', true]]);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]!).hostname, 'clawhub.ai');
    await assert.rejects(manager.handle('market.source.toggle', { id: 'custom', enabled: false }), /不存在/);
    await manager.handle('market.source.toggle', { id: 'old-claw', enabled: false });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).marketSources.find((s: { id: string }) => s.id === 'custom'), legacy);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});
