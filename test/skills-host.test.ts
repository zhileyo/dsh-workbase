import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm, access, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import { SkillsManager } from '../src/server/skills.js';
import { skillMarkdown, type SkillsSnapshot, type SkillReceipt, type SkillMarketItem } from '../src/shared/skills.js';
import { copyOfficialPackages } from './official-host.js';

test('实际官方沙箱允许技能安装、编辑和跨目录范围切换，提交拒绝恢复原文件', {
  skip: process.env.DSH_SKILLS_HOST_TEST !== '1', timeout: 90_000,
}, async () => {
  // 位于系统临时目录之外，避免沙箱默认允许 temp 掩盖写入根目录错误。
  const home = await realpath(await mkdtemp(join(homedir(), '.wb-skills-install-test-')));
  let manager: SkillsManager | undefined;
  try {
    await copyOfficialPackages(home, ['@deepseek-ai/cordis', '@deepseek-ai/dsh-fs-sandbox',
      '@deepseek-ai/dsh-sandbox-local']);
    const load = (name: string) => import(pathToFileURL(join(home, 'node_modules', name, 'lib/index.js')).href);
    const { Context } = await load('@deepseek-ai/cordis');
    const { SandboxedFileSystem } = await load('@deepseek-ai/dsh-fs-sandbox');
    const { LocalSandboxProvider } = await load('@deepseek-ai/dsh-sandbox-local');
    const ctx = new Context(), project = join(home, 'project');
    await mkdir(project);
    ctx.provide('sandboxPolicy', { defaultMode: 'workspace-write',
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: project }) });
    const fs = new SandboxedFileSystem(ctx, { cwd: home, diffBasisMaxBytes: 1024 * 1024 });
    const sandbox = new LocalSandboxProvider(ctx, { runnerCommand: [], runnerFailureSignatures: [], probeTimeoutMs: 5_000 });
    const originalConfine = sandbox.confine.bind(sandbox);
    sandbox.confine = async (...args: Parameters<SandboxProvider['confine']>) => {
      // Linux bind mount 需要 workspaceRoot 已存在；不能绑定即将创建的目录。
      await access(args[1].workspaceRoot!);
      return originalConfine(...args);
    };
    const draft = { name: 'sandbox-install', description: '隔离安装', body: 'original',
      scope: 'global', projectIds: [] };
    const document = skillMarkdown(draft);
    const assetName = 'assets/$literal`name`.bin', asset = Buffer.from([0, 255, 128, 13, 10]);
    const options = { ctx, home, agentsHome: join(home, 'agents'),
      projects: () => [{ projectId: 'p', path: project, title: 'P', available: true, archived: false }],
      config: () => ({ defaultSourceId: 'agents', defaultEnabled: true }),
      fetchMarket: async (url: string) => url.includes('/file') ? document
        : JSON.stringify({ code: 0, data: { total: 1, skills: [{ slug: draft.name, name: draft.name, version: '1.0.0' }] } }),
      fetchMarketResource: async () => skillZip(new Map([['SKILL.md', Buffer.from(document)], [assetName, asset]])),
    };
    manager = new SkillsManager(options);
    const catalog = await manager.handle('market.load') as SkillsSnapshot;
    const detail = await manager.handle('market.detail', { id: catalog.market[0]!.id }) as SkillMarketItem;
    const created = await manager.handle('market.install', { ...draft, marketId: detail.id }) as SkillReceipt;
    assert.equal(created.saved, true);
    const installed = join(home, 'agents', 'skills', draft.name, 'SKILL.md');
    assert.match(await readFile(installed, 'utf8'), /original/);
    assert.deepEqual(await readFile(join(installed, '..', assetName)), asset);
    const beforeState = await readFile(join(manager.directory, 'state.json'), 'utf8');
    const beforeFile = await readFile(installed);
    const write = fs.writeText.bind(fs);
    fs.writeText = async () => { throw new Error('official state write denied'); };
    await assert.rejects(manager.handle('save', { ...draft, id: created.skill.id, version: created.skill.version,
      body: 'failed edit' }), /official state write denied/);
    fs.writeText = write;
    assert.deepEqual(await readFile(installed), beforeFile);
    assert.deepEqual(await readFile(join(installed, '..', assetName)), asset);
    assert.equal(await readFile(join(manager.directory, 'state.json'), 'utf8'), beforeState);
    assert.ok(!(await readdir(join(home, 'agents', 'skills'))).some(name => name.startsWith('.wb-')));
    await assert.rejects(access(join(manager.directory, 'transaction.json')));
    const moved = await manager.handle('save', { ...draft, id: created.skill.id, version: created.skill.version,
      body: 'project body', scope: 'project', projectIds: ['p'] }) as SkillReceipt;
    assert.equal(moved.skill.id, created.skill.id);
    await assert.rejects(access(installed));
    const projectFile = join(project, '.dsh', 'skills', draft.name, 'SKILL.md');
    assert.match(await readFile(projectFile, 'utf8'), /project body/);
    assert.deepEqual(await readFile(join(projectFile, '..', assetName)), asset);
    const confine = sandbox.confine.bind(sandbox);
    sandbox.confine = async () => { throw new Error('official sandbox denied'); };
    await assert.rejects(manager.handle('save', { ...draft, name: 'denied' }), /official sandbox denied/);
    await assert.rejects(access(join(home, 'agents', 'skills', 'denied')));
    sandbox.confine = confine;
    sandbox.confine = async (...args: Parameters<typeof confine>) => ({ ...await confine(...args), enforcement: 'partial' });
    await assert.rejects(manager.handle('save', { ...draft, name: 'partial' }), /不能完整约束/);
    await assert.rejects(access(join(home, 'agents', 'skills', 'partial')));
    sandbox.confine = confine;
    Object.defineProperty(fs, 'sandboxMode', { configurable: true, value: 'read-only' });
    await assert.rejects(manager.handle('save', { ...draft, name: 'readonly' }), /read-only/);
    delete fs.sandboxMode;
    const map = fs.processPathFromHostPath.bind(fs);
    fs.processPathFromHostPath = () => undefined;
    await assert.rejects(manager.handle('save', { ...draft, name: 'unmapped' }), /映射/);
    fs.processPathFromHostPath = map;
    // 状态提交失败，随后宿主拒绝回滚：保留日志，下次初始化走同一沙箱完成恢复。
    const projectBefore = await readFile(projectFile);
    fs.writeText = async () => {
      sandbox.confine = async () => { throw new Error('rollback temporarily denied'); };
      throw new Error('state commit denied');
    };
    await assert.rejects(manager.handle('save', { ...draft, id: moved.skill.id, version: moved.skill.version,
      body: 'interrupted', scope: 'project', projectIds: ['p'] }), /回滚未完成/);
    await access(join(manager.directory, 'transaction.json'));
    fs.writeText = write; sandbox.confine = confine;
    await manager.dispose();
    manager = new SkillsManager(options);
    assert.equal((await manager.snapshot()).skills.find(row => row.id === moved.skill.id)?.body, 'project body');
    assert.deepEqual(await readFile(projectFile), projectBefore);
    assert.deepEqual(await readFile(join(projectFile, '..', assetName)), asset);
    await assert.rejects(access(join(manager.directory, 'transaction.json')));
    // 官方单文件发布完成后仍可能在后置检查抛错，不能撤销已提交的安装。
    fs.writeText = async (...args: Parameters<typeof write>) => {
      await write(...args);
      throw new Error('official post-write probe failed');
    };
    const committed = await manager.handle('save', { ...draft, id: moved.skill.id, version: moved.skill.version,
      body: 'committed after probe failure', scope: 'project', projectIds: ['p'] }) as SkillReceipt;
    assert.equal(committed.saved, true);
    assert.match(await readFile(projectFile, 'utf8'), /committed after probe failure/);
    assert.equal((await manager.snapshot()).skills.find(row => row.id === moved.skill.id)?.body,
      'committed after probe failure');
    await assert.rejects(access(join(manager.directory, 'transaction.json')));
    // 无法读回状态时保留新文件与恢复日志，重新初始化按实际提交标记恢复。
    const read = fs.readText.bind(fs);
    fs.writeText = async (...args: Parameters<typeof write>) => {
      await write(...args);
      fs.readText = async () => { throw new Error('state readback unavailable'); };
      throw new Error('official post-write probe failed');
    };
    await assert.rejects(manager.handle('save', { ...draft, id: committed.skill.id, version: committed.skill.version,
      body: 'unknown commit outcome', scope: 'project', projectIds: ['p'] }), /提交结果无法确认/);
    assert.match(await readFile(projectFile, 'utf8'), /unknown commit outcome/);
    await access(join(manager.directory, 'transaction.json'));
    fs.writeText = write; fs.readText = read;
    await manager.dispose();
    manager = new SkillsManager(options);
    assert.equal((await manager.snapshot()).skills.find(row => row.id === moved.skill.id)?.body, 'unknown commit outcome');
    await assert.rejects(access(join(manager.directory, 'transaction.json')));
    const recovered = (await manager.snapshot()).skills.find(row => row.id === moved.skill.id)!;
    fs.writeText = async () => {
      fs.readText = async () => { throw new Error('state readback unavailable'); };
      throw new Error('state commit denied');
    };
    await assert.rejects(manager.handle('save', { ...draft, id: recovered.id, version: recovered.version,
      body: 'uncommitted unknown outcome', scope: 'project', projectIds: ['p'] }), /提交结果无法确认/);
    await access(join(manager.directory, 'transaction.json'));
    fs.writeText = write; fs.readText = read;
    await manager.dispose();
    manager = new SkillsManager(options);
    assert.equal((await manager.snapshot()).skills.find(row => row.id === recovered.id)?.body, 'unknown commit outcome');
    assert.match(await readFile(projectFile, 'utf8'), /unknown commit outcome/);
    await assert.rejects(access(join(manager.directory, 'transaction.json')));
  } finally { await manager?.dispose(); await rm(home, { recursive: true, force: true }); }
});

/** 未压缩 ZIP，覆盖真实市场安装的校验与原始二进制字节。 */
function skillZip(files: Map<string, Buffer>) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [path, data] of files) {
    const name = Buffer.from(path);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0x80000000, 38); entry.writeUInt32LE(offset, 42);
    local.push(header, name, data); central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(central.reduce((size, entry) => size + entry.length, 0), 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

test('实际桌面官方技能服务在隔离全局和 Agent 作用域执行启停策略', {
  skip: process.env.DSH_SKILLS_HOST_TEST !== '1', timeout: 90_000,
}, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-official-')));
  let manager: SkillsManager | undefined;
  let stop: (() => void) | undefined;
  let scope: { dispose(): Promise<void> } | undefined;
  try {
    await copyOfficialPackages(home, ['@deepseek-ai/cordis', '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-scope',
      '@deepseek-ai/dsh-fs-sandbox']);
    const load = (name: string) => import(pathToFileURL(join(home, 'node_modules', name, 'lib/index.js')).href);
    const { Context } = await load('@deepseek-ai/cordis');
    const { SkillRegistry, isModelInvocable, isUserInvocable } = await load('@deepseek-ai/dsh-skill');
    const { createScope } = await load('@deepseek-ai/dsh-scope');
    const { SandboxedFileSystem } = await load('@deepseek-ai/dsh-fs-sandbox');
    const ctx = new Context(), registry = new SkillRegistry(ctx);
    // 默认工作区刻意不包含配置目录：插件必须为自己的单文件写入传递有界策略。
    const workspace = join(home, 'workspace'); await mkdir(workspace);
    ctx.provide('sandboxPolicy', { defaultMode: 'workspace-write',
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) });
    const fs = new SandboxedFileSystem(ctx, { cwd: home, diffBasisMaxBytes: 1024 * 1024 });
    const path = join(home, 'skills', 'official-policy', 'SKILL.md');
    const document = skillMarkdown({ name: 'official-policy', description: '隔离测试', body: 'official body' });
    await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, document);
    const candidate = { name: 'official-policy', description: '隔离测试', provider: 'native', source: 'user-dsh',
      rank: 400, path, locator: '', invocation: { modelInvocable: true, userInvocable: true } };
    stop = registry.registerProvider(() => ({ name: 'native', list: async () => [candidate],
      get: async () => ({ ...candidate, content: 'official body' }) }));
    const agent = { id: 'isolated', ctx, session: { header: { cwd: home } } };
    scope = createScope(ctx, agent); agent.ctx = (scope as unknown as { ctx: typeof ctx }).ctx;
    agent.ctx.skills.registerProvider(() => ({ name: 'preset', list: async () => [{ ...candidate, rank: 100, provider: 'preset' }],
      get: async () => ({ ...candidate, content: 'preset body', provider: 'preset' }) }));
    ctx.provide('agents', { list: () => [agent] });
    manager = new SkillsManager({ ctx, home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }) });
    const row = (await manager.handle('scan') as SkillsSnapshot).skills[0]!;
    await manager.handle('source.toggle', { id: 'dsh', enabled: false });
    assert.equal(isModelInvocable(await registry.get(candidate.name, { scope: agent, cwd: home })), false);
    await manager.handle('source.toggle', { id: 'dsh', enabled: true });
    await manager.handle('toggle', { id: row.id, enabled: false });
    const snapshot = await registry.snapshot({ scope: agent, cwd: home });
    assert.equal(snapshot.complete, true);
    assert.equal(isModelInvocable(snapshot.skills[0]), false);
    assert.equal(isUserInvocable(await registry.get(candidate.name, { scope: agent, cwd: home })), false);
    await manager.dispose();
    manager = new SkillsManager({ ctx, home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }) });
    assert.equal(isModelInvocable(await registry.get(candidate.name, { scope: agent, cwd: home })), false);
    await manager.handle('scan');
    await manager.handle('toggle', { id: row.id, enabled: true });
    assert.equal(isUserInvocable(await registry.get(candidate.name, { scope: agent, cwd: home })), true);
    const statePath = join(home, 'workbase', 'skills', 'state.json');
    const state = await readFile(statePath, 'utf8');
    const write = fs.writeText.bind(fs), map = fs.processPathFromHostPath.bind(fs);
    try {
      fs.writeText = async () => { throw new Error('official write denied'); };
      await assert.rejects(manager.handle('source.toggle', { id: 'dsh', enabled: false }), /official write denied/);
      fs.writeText = write;
      fs.processPathFromHostPath = () => undefined;
      await assert.rejects(manager.handle('source.toggle', { id: 'dsh', enabled: false }), /无法映射/);
      fs.processPathFromHostPath = map;
      Object.defineProperty(fs, 'sandboxMode', { configurable: true, value: 'read-only' });
      await assert.rejects(manager.handle('toggle', { id: row.id, enabled: false }), /read-only/);
      delete fs.sandboxMode;
      await assert.rejects(manager.handle('save', { name: 'new-skill', description: '隔离测试', body: 'body',
        scope: 'global', projectIds: [] }), /目录事务/);
      assert.equal(await readFile(statePath, 'utf8'), state);
      assert.equal(isUserInvocable(await registry.get(candidate.name, { scope: agent, cwd: home })), true);
    } finally { fs.writeText = write; fs.processPathFromHostPath = map; delete fs.sandboxMode; }
    assert.equal(await readFile(path, 'utf8'), document);
    await manager.dispose();
    assert.equal((await registry.get(candidate.name, { scope: agent }))?.provider, 'preset');
  } finally { await manager?.dispose(); await scope?.dispose(); stop?.(); await rm(home, { recursive: true, force: true }); }
});
