import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry, isModelInvocable, isUserInvocable, type SkillCandidate } from '@deepseek-ai/dsh-skill';
import { createScope } from '@deepseek-ai/dsh-scope';
import { mkdtemp, realpath, mkdir, rm, writeFile, readFile, readdir, symlink, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillsManager } from '../src/server/skills.js';
import { skillMarkdown } from '../src/shared/skills.js';
import { fileTransaction, readBundle, digest } from '../src/server/skills-files.js';
import type { SkillReceipt, SkillsSnapshot } from '../src/shared/skills.js';
import { skillInvocationName } from '../src/server/skills-document.js';
const content = { name: 'real-registry', description: 'registry 验证', body: '正文', scope: 'global' as const, projectIds: [] };
test('中文显示名通过官方注册表稳定调用，停用撤回且恢复后保持标识', async () => {
  const f = await existingFixture(), name = '团队 Code Review', invocationName = skillInvocationName(name)!;
  try {
    const receipt = await f.manager.handle('save', { ...content, name }) as SkillReceipt;
    assert.equal(receipt.effective, 'effective');
    assert.equal((await f.registry.get(invocationName))?.content, content.body);
    const row = (await f.manager.snapshot()).skills.find(row => row.id === receipt.skill.id)!;
    assert.equal(row.name, name);
    await f.manager.handle('toggle', { id: row.id, enabled: false });
    assert.equal(isModelInvocable((await f.registry.get(invocationName))!), false);
    await f.manager.handle('toggle', { id: row.id, enabled: true });
    assert.equal((await f.registry.get(invocationName))?.content, content.body);
    assert.match(await readFile(join(f.home, 'skills', name, 'SKILL.md'), 'utf8'), /团队 Code Review/);
  } finally { await f.close(); }
});

test('真实 SkillRegistry list/get 与当前和后续视图在停用后撤回本模块技能', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-registry-')));
  const project = join(home, 'project'); await mkdir(project);
  const ctx = new Context(), registry = new SkillRegistry(ctx);
  const manager = new SkillsManager({ ctx, home, projects: () => [{ projectId: 'p', title: 'P', path: project, available: true, archived: false }],
    config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }) });
  try {
    const added = await manager.handle('save', content) as { skill: { id: string; version: number }; effective: string };
    assert.equal(added.effective, 'effective');
    assert.equal((await registry.get(content.name))?.content, '正文');
    assert.equal((await registry.list())[0]?.provider, 'workbase-skills');
    const existing = { cwd: project };
    await registry.list(existing);
    await manager.handle('toggle', { id: added.skill.id, enabled: false });
    assert.equal(isModelInvocable((await registry.list(existing))[0]!), false);
    assert.equal(isUserInvocable((await registry.list({ cwd: project }))[0]!), false);
    assert.equal(isModelInvocable((await registry.get(content.name, existing))!), false);
    await manager.handle('toggle', { id: added.skill.id, enabled: true });
    assert.equal((await registry.get(content.name, existing))?.content, '正文');
    await manager.handle('save', { ...content, id: added.skill.id, version: 3, scope: 'project', projectIds: ['p'] });
    assert.equal((await registry.list()).length, 0);
    assert.equal((await registry.list({ cwd: project })).length, 1);
    assert.equal((await registry.list({ cwd: join(home, 'project-other') })).length, 0);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
  assert.equal((await registry.list({ cwd: project })).length, 0);
});
test('真实 registry 按宿主 rank 优先，不抢占更近原生提供器；读取 summary 反映外部变更', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-rank-')));
  const ctx = new Context(), registry = new SkillRegistry(ctx);
  const manager = new SkillsManager({ ctx, home, projects: () => [], config: () => ({ defaultSourceId: '', defaultEnabled: true }) });
  const candidate: SkillCandidate = { name: content.name, description: '原生优先', source: 'project-dsh', provider: 'native',
    invocation: { modelInvocable: true, userInvocable: true }, rank: 100, locator: '', path: '/native/SKILL.md' };
  const nativeDispose = registry.registerProvider(() => ({ name: 'native', list: async () => [candidate],
    get: async () => ({ ...candidate, content: 'native' }) }));
  try {
    const added = await manager.handle('save', content) as { effective: string };
    assert.equal(added.effective, 'shadowed');
    assert.equal((await registry.get(content.name))?.content, 'native');
    nativeDispose();
    assert.equal((await manager.handle('summary') as { count: number }).count, 1);
    await writeFile(join(home, 'skills', content.name, 'SKILL.md'), 'outside change');
    const summary = await manager.handle('summary') as { count: number; errors: number };
    assert.equal(summary.count, null); assert.ok(summary.errors > 0);
  } finally { nativeDispose(); await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});
test('宿主授权拒绝不转为本机写入', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-deny-')));
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: '', defaultEnabled: true }),
    authorize: async (_paths, operation) => { if (operation === 'write') throw new Error('permission denied'); } });
  try {
    await assert.rejects(manager.handle('save', content), /permission denied/);
    await assert.rejects(readFile(join(home, 'skills', content.name, 'SKILL.md')));
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});
test('目录事务在状态持久化失败时恢复原文件，临时文件不暴露在原生扫描名称内', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-rollback-')));
  const old = join(home, 'skill'); await mkdir(old); await writeFile(join(old, 'SKILL.md'), 'old');
  const previous = await readBundle(old), next = new Map([['SKILL.md', Buffer.from('next')]]);
  try {
    await assert.rejects(fileTransaction(home, [{ path: old, expected: digest(previous), next }], async () => { throw new Error('state write failed'); }));
    assert.equal(await readFile(join(old, 'SKILL.md'), 'utf8'), 'old');
    assert.deepEqual(await readdir(home), ['skill']);
  } finally { await rm(home, { recursive: true, force: true }); }
});

async function existingFixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-policy-')));
  const ctx = new Context(), registry = new SkillRegistry(ctx);
  const projects: { projectId: string; title: string; path: string; available: boolean; archived: boolean }[] = [];
  const options = { ctx, home, agentsHome: join(home, 'agents'), projects: () => projects,
    config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }) };
  const document = skillMarkdown(content);
  const instruction = join(home, 'skills', content.name, 'SKILL.md');
  await mkdir(join(home, 'skills', content.name), { recursive: true });
  await writeFile(instruction, document);
  const native: SkillCandidate = { name: content.name, description: content.description, provider: 'native',
    source: 'user-dsh', rank: 400, locator: '', path: instruction,
    invocation: { modelInvocable: true, userInvocable: true } };
  const nativeDispose = registry.registerProvider(() => ({ name: 'native', list: async () => [native],
    get: async () => ({ ...native, content: content.body }) }));
  let manager = new SkillsManager(options);
  return { home, ctx, registry, projects, options, instruction, document, native,
    get manager() { return manager; },
    async restart() { await manager.dispose(); manager = new SkillsManager(options); },
    async close() { await manager.dispose(); nativeDispose(); await rm(home, { recursive: true, force: true }); } };
}

test('既有原生技能的来源与单技能策略共同生效，扫描和重启不丢失，原文件不变', async () => {
  const f = await existingFixture();
  try {
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    const row = snapshot.skills.find(skill => skill.name === content.name)!;
    assert.equal(row.owner, 'external');
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: false });
    let winner = (await f.registry.list()).find(skill => skill.name === content.name)!;
    assert.equal(isModelInvocable(winner), false);
    assert.equal(isUserInvocable(winner), false);
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: true });
    const receipt = await f.manager.handle('toggle', { id: row.id, enabled: false }) as SkillReceipt;
    assert.equal(receipt.effective, 'disabled');
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), false);
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: false });
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: true });
    assert.equal((await f.manager.handle('scan') as SkillsSnapshot).skills.find(skill => skill.id === row.id)?.enabled, false);
    await f.restart();
    assert.equal(isUserInvocable((await f.registry.get(content.name))!), false);
    await f.manager.handle('toggle', { id: row.id, enabled: true });
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), true);
    assert.equal(await readFile(f.instruction, 'utf8'), f.document);
    await assert.rejects(f.manager.handle('save', { ...content, id: row.id, version: row.version }), /仅可读取/);
  } finally { await f.close(); }
});

test('外部来源提供真实正文，关闭后让出 bundled，同名启用副本优先于停用原生副本', async () => {
  const f = await existingFixture();
  try {
    const root = join(f.home, 'custom');
    await mkdir(join(root, 'nested', content.name), { recursive: true });
    await writeFile(join(root, 'nested', content.name, 'SKILL.md'), skillMarkdown({ ...content, body: 'custom body' }));
    const added = await f.manager.handle('source.add', { path: root }) as { source: { id: string } };
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: false });
    assert.equal((await f.registry.get(content.name))?.content, 'custom body');
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), true);
    await f.manager.handle('source.toggle', { id: added.source.id, enabled: false });
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), false);
    const other = { ...content, name: 'external-only', body: 'external only' };
    await mkdir(join(root, other.name)); await writeFile(join(root, other.name, 'SKILL.md'), skillMarkdown(other));
    const bundled: SkillCandidate = { ...f.native, name: other.name, provider: 'bundled', source: 'bundled', rank: 600,
      path: '/bundled/SKILL.md' };
    const stop = f.registry.registerProvider(() => ({ name: 'bundled', list: async () => [bundled],
      get: async () => ({ ...bundled, content: 'bundled body' }) }));
    try {
      await f.manager.handle('scan');
      assert.equal((await f.registry.get(other.name))?.provider, 'bundled');
      await f.manager.handle('source.toggle', { id: added.source.id, enabled: true });
      assert.equal((await f.registry.get(other.name))?.content, other.body);
      const row = (await f.manager.handle('scan') as SkillsSnapshot).skills.find(skill => skill.name === other.name)!;
      await f.manager.handle('toggle', { id: row.id, enabled: false });
      assert.equal(isModelInvocable((await f.registry.get(other.name))!), false);
      await f.manager.handle('source.toggle', { id: added.source.id, enabled: false });
      assert.equal(isModelInvocable((await f.registry.get(other.name))!), false);
    } finally { stop(); }
  } finally { await f.close(); }
});

test('原生分发链接继承同一真实文件的停用策略，原始调用通道限制保留', async () => {
  const f = await existingFixture();
  try {
    const root = join(f.home, 'custom');
    await mkdir(root);
    await symlink(join(f.home, 'skills', content.name), join(root, 'alias'), 'dir');
    const added = await f.manager.handle('source.add', { path: root }) as { source: { id: string } };
    const row = (await f.manager.handle('scan') as SkillsSnapshot).skills.find(skill => skill.sourceId === added.source.id)!;
    assert.equal(row.name, content.name);
    await f.manager.handle('toggle', { id: row.id, enabled: false });
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), false);
    await f.manager.handle('toggle', { id: row.id, enabled: true });
    await writeFile(f.instruction, `---\nname: ${content.name}\ndescription: >-\n  block description\n  continued\nmodel-invocable: false\nuser-invocable: true\n---\nbody`);
    await f.manager.handle('scan');
    const winner = await f.registry.get(content.name);
    assert.ok(winner);
    assert.equal(winner.description, 'block description continued');
    assert.equal(isModelInvocable(winner), false);
    assert.equal(isUserInvocable(winner), true);
  } finally { await f.close(); }
});

test('已有与后续 Agent 作用域均阻断预设原生提供器，刷新与卸载覆盖全部注册', async () => {
  const f = await existingFixture();
  const agents: { id: string; ctx: Context; session: { header: { cwd: string } } }[] = [];
  const createAgent = (id: string) => {
    const agent = { id, ctx: f.ctx, session: { header: { cwd: f.home } } };
    const scope = createScope(f.ctx, agent); agent.ctx = scope.ctx;
    scope.ctx.skills.registerProvider(() => ({ name: 'preset', list: async () => [{ ...f.native, rank: 100, provider: 'preset' }],
      get: async () => ({ ...f.native, provider: 'preset', content: 'preset' }) }));
    agents.push(agent);
    return { agent, scope };
  };
  const first = createAgent('existing');
  f.ctx.provide('agents', { list: () => agents });
  const events: string[] = [];
  f.ctx.on('commands/change', () => { events.push('commands/change'); });
  try {
    await f.restart();
    await f.manager.handle('scan');
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: false });
    assert.equal(isModelInvocable((await f.registry.get(content.name, { scope: first.agent, cwd: f.home }))!), false);
    const second = createAgent('new');
    try {
      await f.ctx.serial('agent/created', { agent: second.agent as unknown as import('@deepseek-ai/dsh-agent').Agent, source: 'startup' });
      assert.equal(isUserInvocable((await f.registry.get(content.name, { scope: second.agent, cwd: f.home }))!), false);
      await f.manager.handle('source.toggle', { id: 'dsh', enabled: true });
      assert.equal(isModelInvocable((await f.registry.get(content.name, { scope: second.agent, cwd: f.home }))!), true);
      assert.ok(events.length > 0);
      await f.manager.dispose();
      assert.equal((await f.registry.get(content.name, { scope: first.agent }))?.provider, 'preset');
      assert.equal((await f.registry.get(content.name, { scope: second.agent }))?.provider, 'preset');
    } finally { await second.scope.dispose(); }
  } finally { await first.scope.dispose(); await f.close(); }
});

test('策略写入被拒绝时不改原文件或当前策略', async () => {
  const f = await existingFixture();
  try {
    await f.manager.dispose();
    const manager = new SkillsManager({ ...f.options, authorize: async (_paths, operation) => {
      if (operation === 'write') throw new Error('policy denied');
    } });
    try {
      const row = (await manager.handle('scan') as SkillsSnapshot).skills[0]!;
      await assert.rejects(manager.handle('toggle', { id: row.id, enabled: false }), /policy denied/);
      await assert.rejects(manager.handle('source.toggle', { id: 'dsh', enabled: false }), /policy denied/);
      assert.equal(isModelInvocable((await f.registry.get(content.name))!), true);
      assert.equal(await readFile(f.instruction, 'utf8'), f.document);
    } finally { await manager.dispose(); }
  } finally { await f.close(); }
});

test('项目策略只作用于登记项目，保留另一项目和全局同名技能', async () => {
  const f = await existingFixture();
  try {
    for (const id of ['one', 'two']) {
      const path = join(f.home, id);
      f.projects.push({ projectId: id, title: id, path, available: true, archived: false });
      await mkdir(join(path, '.dsh', 'skills', content.name), { recursive: true });
      await writeFile(join(path, '.dsh', 'skills', content.name, 'SKILL.md'), skillMarkdown({ ...content, body: id }));
    }
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    const row = snapshot.skills.find(skill => skill.projectIds.includes('one'))!;
    await f.manager.handle('toggle', { id: row.id, enabled: false });
    assert.equal((await f.registry.get(content.name, { cwd: join(f.home, 'one') }))?.content, content.body);
    assert.equal((await f.registry.get(content.name, { cwd: join(f.home, 'two') }))?.content, 'two');
    assert.equal((await f.registry.get(content.name))?.content, content.body);
    assert.equal((await f.registry.get(content.name, { cwd: join(f.home, 'one-other') }))?.content, content.body);
  } finally { await f.close(); }
});

test('工作台自有技能的分发链接继承启停，保存正文能清除旧关闭策略', async () => {
  const f = await existingFixture();
  try {
    const added = await f.manager.handle('save', { ...content, name: 'owned' }) as SkillReceipt;
    const root = join(f.home, 'custom'); await mkdir(root);
    await symlink(join(f.home, 'skills', 'owned'), join(root, 'owned-alias'), 'dir');
    await f.manager.handle('source.add', { path: root });
    await f.manager.handle('toggle', { id: added.skill.id, enabled: false });
    assert.equal(isModelInvocable((await f.registry.get('owned'))!), false);
    const row = (await f.manager.handle('scan') as SkillsSnapshot).skills.find(skill => skill.id === added.skill.id)!;
    await f.manager.handle('save', { ...content, name: 'owned', id: row.id, version: row.version, enabled: true });
    assert.equal(isUserInvocable((await f.registry.get('owned'))!), true);
    await f.manager.handle('source.toggle', { id: 'dsh', enabled: false });
    assert.equal(isModelInvocable((await f.registry.get('owned'))!), false);
  } finally { await f.close(); }
});

test('未知调用策略不会扩大权限；已有来源解析失败不误报生效', async () => {
  const f = await existingFixture();
  try {
    await f.manager.handle('scan');
    await writeFile(f.instruction, `---\nname: ${content.name}\ndescription: test\ndisable-model-invocation: unknown\n---\nbody`);
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    assert.equal(snapshot.skills[0]?.effective, 'error');
    assert.equal(snapshot.summary.count, null);
    assert.equal((await f.registry.snapshot()).complete, false);
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), false);
  } finally { await f.close(); }
});

test('来源文件变化刷新已缓存目录与会话斜杠菜单', { timeout: 5000 }, async () => {
  const f = await existingFixture();
  try {
    const selected: [string, string][] = [];
    f.ctx.provide('sessions', { list: () => [{ id: 'session', header: { agentPreset: 'preset' } }] });
    const stopSelected = f.ctx.on('agent-preset/selected', (id, preset) => { selected.push([id, preset]); });
    try {
      await f.manager.handle('scan');
      assert.equal(isModelInvocable((await f.registry.list())[0]!), true);
      let resolveChange!: () => void;
      let changeTimeout!: ReturnType<typeof setTimeout>;
      const changed = new Promise<void>((resolve, reject) => {
        resolveChange = resolve;
        // 非持久监听不保活；Node 22 的 test timeout 也不保活，等待事件需自带有界计时器。
        changeTimeout = setTimeout(() => reject(new Error('等待来源文件变化通知超时')), 4000);
      });
      const stop = f.ctx.on('commands/change', () => { resolveChange(); });
      try {
        await writeFile(f.instruction, `---\nname: ${content.name}\ndescription: test\ndisable-model-invocation: true\n---\nbody`);
        await changed;
        assert.equal(isModelInvocable((await f.registry.list())[0]!), false);
        assert.ok(selected.some(([id, preset]) => id === 'session' && preset === 'preset'));
      } finally { clearTimeout(changeTimeout); stop(); }
    } finally { stopSelected(); }
  } finally { await f.close(); }
});

test('更高优先级提供器仍允许调用时，停用反馈为冲突而非成功', async () => {
  const f = await existingFixture();
  const stop = f.registry.registerProvider(() => ({ name: 'higher', list: async () => [{ ...f.native, rank: -10, provider: 'higher' }],
    get: async () => ({ ...f.native, content: 'other', provider: 'higher' }) }));
  try {
    const row = (await f.manager.handle('scan') as SkillsSnapshot).skills[0]!;
    const receipt = await f.manager.handle('toggle', { id: row.id, enabled: false }) as SkillReceipt;
    assert.equal(receipt.effective, 'shadowed');
    assert.match(receipt.message, /停用尚未确认/);
    assert.equal(isModelInvocable((await f.registry.get(content.name))!), true);
    assert.equal(await readFile(f.instruction, 'utf8'), f.document);
  } finally { stop(); await f.close(); }
});

test('旧版物理停用安装在首次启用时事务恢复，后续停用保留原位置', async () => {
  const f = await existingFixture();
  try {
    const added = await f.manager.handle('save', { ...content, name: 'legacy' }) as SkillReceipt;
    await f.manager.dispose();
    const statePath = join(f.home, 'workbase', 'skills', 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const row = state.skills.find((skill: { id: string }) => skill.id === added.skill.id);
    const disabled = join(f.home, 'workbase', 'skills', 'disabled', row.id, '0', row.name);
    await mkdir(join(disabled, '..'), { recursive: true });
    await rename(row.installations[0].path, disabled);
    row.installations[0].path = disabled; row.enabled = false; delete state.policies;
    await writeFile(statePath, JSON.stringify(state));
    await f.restart();
    assert.equal((await f.manager.handle('snapshot') as SkillsSnapshot).legacyStagedCount, 1);
    await f.manager.handle('toggle', { id: row.id, enabled: true });
    assert.equal((await f.manager.handle('snapshot') as SkillsSnapshot).legacyStagedCount, 0);
    const active = join(f.home, 'skills', 'legacy', 'SKILL.md');
    await access(active); await assert.rejects(access(disabled));
    await f.manager.handle('toggle', { id: row.id, enabled: false });
    await access(active);
    assert.equal(isUserInvocable((await f.registry.get('legacy'))!), false);
  } finally { await f.close(); }
});

test('各作用域复用目录发现，读取一个正文不重读其他技能指令', async () => {
  const f = await existingFixture();
  let reads = 0;
  try {
    for (let i = 0; i < 12; i++) {
      const path = join(f.home, 'skills', `cached-${i}`);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, 'SKILL.md'), skillMarkdown({ ...content, name: `cached-${i}` }));
    }
    await f.manager.dispose();
    const agent = { id: 'cached-agent', ctx: f.ctx };
    const scope = createScope(f.ctx, agent); agent.ctx = scope.ctx;
    f.ctx.provide('agents', { list: () => [agent] });
    const manager = new SkillsManager(f.options);
    const measured = manager as unknown as { readInstruction(path: string): Promise<string> };
    const read = measured.readInstruction.bind(manager);
    measured.readInstruction = async path => { reads++; return read(path); };
    try {
      await manager.handle('scan');
      assert.ok(reads <= 13, `首次扫描重复读取指令 ${reads} 次`);
      reads = 0;
      assert.equal((await f.registry.get('cached-0'))?.content, content.body);
      assert.equal((await f.registry.get('cached-1', { scope: agent }))?.content, content.body);
      assert.ok(reads <= 2, `两个正文读取了 ${reads} 次指令`);
      reads = 0;
      await manager.handle('summary');
      assert.equal(reads, 0, '没有文件变化的摘要不应重读全部指令');
    } finally { await manager.dispose(); await scope.dispose(); }
  } finally { await f.close(); }
});

test('普通技能发现不读取大型关联资源，目录导入仍核完整文件与容量', async () => {
  const f = await existingFixture();
  try {
    await writeFile(join(f.home, 'skills', content.name, 'large.bin'), Buffer.alloc(21 * 1024 * 1024));
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    assert.equal(snapshot.skills[0]?.effective, 'effective');
    assert.equal((await f.registry.get(content.name))?.content, content.body);
    const preview = await f.manager.handle('import.preview', { sourceId: 'dsh' }) as { issue?: string }[];
    assert.match(preview[0]?.issue ?? '', /20 MB/);
  } finally { await f.close(); }
});

test('并发作用域共享首次读取，缓存命中仍复核指令授权，拒绝后可以恢复', async () => {
  const f = await existingFixture();
  let denied = false, reads = 0;
  await f.manager.dispose();
  const manager = new SkillsManager({ ...f.options, authorize: async paths => {
    if (denied && paths.includes(f.instruction)) throw new Error('read denied');
  } });
  const measured = manager as unknown as {
    readInstruction(path: string): Promise<string>;
    providerCandidates(options: object, scoped: boolean): Promise<{ candidates: SkillCandidate[]; complete: boolean }>;
  };
  const read = measured.readInstruction.bind(manager);
  measured.readInstruction = async path => { reads++; return read(path); };
  try {
    const views = await Promise.all([false, true, true].map(scoped => measured.providerCandidates({}, scoped)));
    assert.ok(views.every(view => view.complete && view.candidates.length === 1));
    assert.equal(reads, 1);
    denied = true;
    const blocked = await measured.providerCandidates({}, false);
    assert.equal(blocked.complete, false);
    assert.equal(blocked.candidates.length, 0);
    denied = false;
    assert.equal((await measured.providerCandidates({}, false)).candidates.length, 1);
  } finally { await manager.dispose(); await f.close(); }
});

test('摘要在监听回调前发现指令修改、新增与删除，详情按需枚举资源', async () => {
  const f = await existingFixture();
  // 明确模拟监听尚未到达；真实回调可能在scan的生效确认期间使目录失效。
  // 此处独立验证元数据扫描兜底，真实监听由“来源文件变化刷新…”用例覆盖。
  (f.manager as unknown as { watchSources(): Promise<void> }).watchSources = async () => {};
  try {
    await f.manager.handle('scan');
    await writeFile(f.instruction, skillMarkdown({ ...content, description: '新说明', body: '新正文' }));
    await mkdir(join(f.home, 'skills', 'second'));
    await writeFile(join(f.home, 'skills', 'second', 'SKILL.md'), skillMarkdown({ ...content, name: 'second' }));
    assert.equal((await f.manager.handle('summary') as { count: number }).count, 2);
    const row = (await f.manager.snapshot()).skills.find(row => row.name === content.name)!;
    assert.equal(row.description, '新说明');
    await mkdir(join(f.home, 'skills', content.name, 'scripts'));
    await writeFile(join(f.home, 'skills', content.name, 'scripts', 'run.sh'), 'echo ready');
    const detail = await f.manager.handle('detail', { id: row.id }) as { body: string; files: string[] };
    assert.equal(detail.body, '新正文');
    assert.deepEqual(detail.files, ['scripts/run.sh', 'SKILL.md'].sort());
    await rm(join(f.home, 'skills', 'second'), { recursive: true });
    assert.equal((await f.manager.handle('summary') as { count: number }).count, 1);
  } finally { await f.close(); }
});

test('导入确认检测预览后关联资源变化，受管安装缓存也检测资源篡改', async () => {
  const f = await existingFixture();
  try {
    const incoming = join(f.home, 'incoming'), path = join(incoming, 'imported');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), skillMarkdown({ ...content, name: 'imported' }));
    await writeFile(join(path, 'helper.txt'), 'old');
    const added = await f.manager.handle('source.add', { path: incoming }) as { source: { id: string } };
    const sourceId = added.source.id;
    await f.manager.handle('import.preview', { sourceId });
    await writeFile(join(path, 'helper.txt'), 'new');
    const conflict = await f.manager.handle('import.confirm', {
      fromSourceId: sourceId, names: ['imported'], scope: 'global',
    }) as { receipts: SkillReceipt[]; error: string };
    assert.equal(conflict.receipts.length, 0);
    assert.match(conflict.error, /变化/);
    await f.manager.handle('import.preview', { sourceId });
    const imported = await f.manager.handle('import.confirm', {
      fromSourceId: sourceId, names: ['imported'], scope: 'global',
    }) as { receipts: SkillReceipt[] };
    assert.equal(imported.receipts[0]?.saved, true);
    await f.manager.handle('source.toggle', { id: sourceId, enabled: false });
    await f.manager.handle('summary');
    await writeFile(join(f.home, 'skills', 'imported', 'helper.txt'), 'modified');
    await f.manager.handle('summary');
    const row = (await f.manager.snapshot()).skills.find(row => row.owner === 'workbase' && row.name === 'imported')!;
    assert.equal(row.effective, 'error');
    assert.match(row.issue!, /外部修改/);
  } finally { await f.close(); }
});

test('目录未完成时每批核对每个作用域只收集一次，不随技能数量重复扫描', async () => {
  const f = await existingFixture();
  let collections = 0;
  const stop = f.registry.registerProvider(() => ({ name: 'incomplete', list: async () => {
    collections++; return { candidates: [], complete: false };
  }, get: async () => undefined }));
  try {
    for (let i = 0; i < 8; i++) {
      const path = join(f.home, 'skills', `pending-${i}`);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, 'SKILL.md'), skillMarkdown({ ...content, name: `pending-${i}` }));
    }
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    assert.equal(snapshot.summary.count, null);
    assert.ok(snapshot.skills.every(row => row.effective === 'pending'));
    assert.ok(collections <= 2, `单作用域目录未完成导致收集 ${collections} 次`);
  } finally { stop(); await f.close(); }
});

test('只读快照不等待正在进行的宿主生效检查，取消的快照仍拒绝', async () => {
  const f = await existingFixture();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const stop = f.registry.registerProvider(() => ({ name: 'slow', list: async () => {
    started(); await gate; return { candidates: [], complete: false };
  }, get: async () => undefined }));
  const pending = f.manager.handle('summary');
  try {
    await entered;
    const snapshot = f.manager.handle('snapshot') as Promise<SkillsSnapshot>;
    const ready = await Promise.race([snapshot.then(() => true), new Promise<false>(resolve => setTimeout(() => resolve(false), 100))]);
    assert.equal(ready, true, '快照被串行队列中尚未结束的生效检查阻塞');
    assert.equal((await snapshot).sources.length, 2);
    const controller = new AbortController(); controller.abort(new Error('snapshot cancelled'));
    await assert.rejects(f.manager.handle('snapshot', {}, controller.signal), /snapshot cancelled/);
  } finally { release(); await pending; stop(); await f.close(); }
});

test('外部大写名称以宿主调用名称接入，保留显示名和路径且不阻断正常技能', async () => {
  const f = await existingFixture();
  const name = 'TRAE-browseruse', path = join(f.home, 'skills', name);
  const document = skillMarkdown({ ...content, name, body: 'uppercase body' });
  try {
    await mkdir(path); await writeFile(join(path, 'SKILL.md'), document);
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    const row = snapshot.skills.find(row => row.name === name)!;
    assert.equal(row.effective, 'effective');
    assert.equal(snapshot.skills.find(row => row.name === content.name)?.effective, 'effective');
    assert.equal(snapshot.summary.errors, 0);
    assert.equal((await f.registry.snapshot()).complete, true);
    assert.equal((await f.registry.get('trae-browseruse'))?.content, 'uppercase body');
    await f.manager.handle('toggle', { id: row.id, enabled: false });
    assert.equal(isModelInvocable((await f.registry.get('trae-browseruse'))!), false);
    await f.manager.handle('toggle', { id: row.id, enabled: true });
    assert.equal((await f.registry.get('trae-browseruse'))?.content, 'uppercase body');
    assert.equal(await readFile(join(path, 'SKILL.md'), 'utf8'), document);
  } finally { await f.close(); }
});

test('无法接入宿主的名称不会提交非法候选，正常技能待确认不累计为错误', async () => {
  const f = await existingFixture();
  try {
    const path = join(f.home, 'skills', 'bad-name');
    await mkdir(path);
    await writeFile(join(path, 'SKILL.md'), skillMarkdown({ ...content, name: '../invalid' }));
    const snapshot = await f.manager.handle('scan') as SkillsSnapshot;
    const observed = await f.registry.snapshot();
    assert.equal(observed.complete, false);
    assert.ok(observed.skills.every(skill => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)));
    assert.equal(snapshot.skills.find(row => row.name === content.name)?.effective, 'pending');
    assert.equal(snapshot.summary.errors, 1);
    const bad = snapshot.skills.find(row => row.name !== content.name)!;
    assert.equal(bad.effective, 'error');
  } finally { await f.close(); }
});
