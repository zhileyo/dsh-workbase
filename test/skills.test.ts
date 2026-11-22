import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillsManager, type SkillsContext } from '../src/server/skills.js';
import { parseSkillUpload, skillMarkdown } from '../src/shared/skills.js';
import { readSkillDocument, skillInvocationName } from '../src/server/skills-document.js';

const draft = { name: 'test-skill', description: '测试技能', body: '# 真实正文', scope: 'global', projectIds: [] };
test('技能显示名称支持中文、大小写和空格，调用标识稳定且路径安全', () => {
  for (const name of ['代码审查', 'GitHub', '团队 Code Review']) {
    assert.equal(parseSkillUpload(skillMarkdown({ ...draft, name }))[0]?.name, name);
    const document = readSkillDocument(skillMarkdown({ ...draft, name }));
    assert.equal(document.name, name);
    assert.match(document.invocationName, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(document.invocationName, skillInvocationName(name));
  }
  assert.equal(skillInvocationName('GitHub'), 'git-hub');
  for (const name of ['../escape', 'a/b', 'a\\b', '.', '..', 'a\u0000b', 'con', 'a.'])
    assert.throws(() => parseSkillUpload(skillMarkdown({ ...draft, name })));
});
test('中文技能保存后重新扫描保持显示名称及正文', async () => {
  const f = await fixture();
  try {
    await f.manager.handle('save', { ...draft, name: '代码审查' });
    assert.match(await readFile(join(f.home, 'skills/代码审查/SKILL.md'), 'utf8'), /代码审查/);
    const snapshot = await f.manager.handle('scan') as Awaited<ReturnType<SkillsManager['snapshot']>>;
    assert.equal(snapshot.skills.find(row => row.name === '代码审查')?.body, draft.body);
  } finally { await f.close(); }
});
async function fixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'workbase-skills-')));
  const path = join(home, 'project'); await mkdir(path);
  const options = { home, projects: () => [{ projectId: 'p1', path, title: '项目', available: true, archived: false }],
    config: () => ({ defaultSourceId: '', defaultEnabled: true }) };
  return { home, path, options, manager: new SkillsManager(options), async close() { await this.manager.dispose(); await rm(home, { recursive: true, force: true }); } };
}
for (const published of [true, false]) test(`A16 提交未知（发布=${published}）阻断全部后续状态写，重启按真实 journal 恢复`, async () => {
  const f = await fixture();
  await f.manager.dispose();
  let uncertain = false, writes = 0;
  const fs = {
    processPathFromHostPath: (value: string) => value,
    resolve: async (value: string) => value,
    readText: async (value: string) => {
      if (uncertain && value.endsWith('state.json')) throw new Error('synthetic readback failure');
      return readFile(value, 'utf8');
    },
    writeText: async (value: string, text: string) => {
      writes++;
      if (uncertain) {
        if (published) await writeFile(value, text);
        throw new Error('synthetic post-write failure');
      }
      await mkdir(join(value, '..'), { recursive: true }); await writeFile(value, text);
    },
  };
  const options = { ...f.options, ctx: { get: (name: string) => name === 'fs' ? fs : undefined } as unknown as SkillsContext };
  f.manager = new SkillsManager(options);
  try {
    const saved = await f.manager.handle('save', draft) as { skill: { id: string; version: number } };
    // 先成功读取旧状态，再在实际发布时使回读失败。
    const write = fs.writeText;
    fs.writeText = async (value, text) => { uncertain = true; return write(value, text); };
    await assert.rejects(f.manager.handle('save', { ...draft, id: saved.skill.id,
      version: saved.skill.version, body: 'synthetic-new' }), /提交结果无法确认/);
    const before = await readFile(join(f.manager.directory, 'state.json'), 'utf8'), count = writes;
    uncertain = false; fs.writeText = write;
    for (const [method, input] of [
      ['source.rename', { id: 'dsh', name: 'Renamed' }],
      ['market.source.toggle', { id: 'builtin-skillhub', enabled: false }],
      ['source.toggle', { id: 'dsh', enabled: false }],
      ['toggle', { id: saved.skill.id, enabled: false }],
      ['save', { ...draft, name: 'must-not-install' }],
    ] as const) await assert.rejects(f.manager.handle(method, input), /提交结果无法确认/);
    assert.equal(writes, count);
    assert.equal(await readFile(join(f.manager.directory, 'state.json'), 'utf8'), before);
    await access(join(f.manager.directory, 'transaction.json'));
    await f.manager.dispose(); f.manager = new SkillsManager(options);
    const recovered = (await f.manager.snapshot()).skills.find(row => row.id === saved.skill.id)!;
    assert.equal(recovered.body, published ? 'synthetic-new' : draft.body);
    assert.match(await readFile(join(f.home, 'skills/test-skill/SKILL.md'), 'utf8'),
      published ? /synthetic-new/ : /真实正文/);
    await assert.rejects(access(join(f.manager.directory, 'transaction.json')));
    await f.manager.handle('source.rename', { id: 'dsh', name: 'Recovered' });
  } finally { await f.close(); }
});
test('技能 Markdown 与 JSON 上传使用相同校验且保持显式关闭', () => {
  assert.equal(parseSkillUpload(skillMarkdown(draft))[0]?.name, draft.name);
  assert.equal(parseSkillUpload(JSON.stringify({ version: 1, skills: [{ ...draft, enabled: false }] }))[0]?.enabled, false);
  assert.throws(() => parseSkillUpload('---\nname: ../escape\ndescription: test\n---\nbody'));
});
test('真实保存、范围切换、停用恢复保持身份与安装时间', async () => {
  const f = await fixture();
  try {
    const created = await f.manager.handle('save', draft) as { skill: { id: string; installedAt: number; version: number }; saved: boolean; effective: string };
    assert.equal(created.saved, true); assert.equal(created.effective, 'unavailable');
    assert.match(await readFile(join(f.home, 'skills/test-skill/SKILL.md'), 'utf8'), /真实正文/);
    const edited = await f.manager.handle('save', { ...draft, id: created.skill.id, version: created.skill.version, scope: 'project', projectIds: ['p1'] }) as typeof created;
    assert.equal(edited.skill.id, created.skill.id); assert.equal(edited.skill.installedAt, created.skill.installedAt);
    await assert.rejects(access(join(f.home, 'skills/test-skill')));
    assert.match(await readFile(join(f.path, '.dsh/skills/test-skill/SKILL.md'), 'utf8'), /真实正文/);
    await f.manager.handle('toggle', { id: created.skill.id, enabled: false });
    await access(join(f.path, '.dsh/skills/test-skill/SKILL.md'));
    await f.manager.handle('toggle', { id: created.skill.id, enabled: true });
    await access(join(f.path, '.dsh/skills/test-skill/SKILL.md'));
    await f.manager.dispose();
    f.manager = new SkillsManager(f.options);
    assert.equal((await f.manager.snapshot()).skills[0]?.installedAt, created.skill.installedAt);
  } finally { await f.close(); }
});
test('并发同名创建仅一次成功；外部条目可保存启停策略但不能改正文', async () => {
  const f = await fixture();
  try {
    const outcomes = await Promise.allSettled([f.manager.handle('save', draft), f.manager.handle('save', draft)]);
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
    await assert.rejects(f.manager.handle('save', { ...draft, name: 'other', scope: 'project', projectIds: ['outside'] }));
    await writeFile(join(f.home, 'skills/external.md'), skillMarkdown({ ...draft, name: 'external' }));
    const external = (await f.manager.handle('scan')) as Awaited<ReturnType<SkillsManager['snapshot']>>;
    const row = external.skills.find(x => x.name === 'external')!;
    assert.equal(row.owner, 'external');
    const receipt = await f.manager.handle('toggle', { id: row.id, enabled: false }) as { effective: string };
    assert.equal(receipt.effective, 'unavailable');
    await assert.rejects(f.manager.handle('save', { ...draft, name: 'external', id: row.id, version: row.version }), /仅可读取/);
  } finally { await f.close(); }
});
test('目标冲突失败不撤下原文件；外部更改不会被覆盖', async () => {
  const f = await fixture();
  try {
    const created = await f.manager.handle('save', draft) as { skill: { id: string; version: number } };
    await mkdir(join(f.path, '.dsh/skills/test-skill'), { recursive: true });
    await writeFile(join(f.path, '.dsh/skills/test-skill/SKILL.md'), 'foreign');
    await assert.rejects(f.manager.handle('save', { ...draft, ...created.skill, scope: 'project', projectIds: ['p1'] }));
    await access(join(f.home, 'skills/test-skill/SKILL.md'));
    await writeFile(join(f.home, 'skills/test-skill/SKILL.md'), 'changed outside');
    await assert.rejects(f.manager.handle('toggle', { id: created.skill.id, enabled: false }));
    assert.equal(await readFile(join(f.home, 'skills/test-skill/SKILL.md'), 'utf8'), 'changed outside');
  } finally { await f.close(); }
});
test('拒绝来源与中转存储嵌套；已登记目录导入保留关联文件', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.home, 'workbase/skills/foreign'), { recursive: true });
    await assert.rejects(f.manager.handle('source.add', { path: join(f.home, 'workbase/skills') }), /重叠/);
    const incoming = join(f.home, 'incoming'); await mkdir(join(incoming, 'folder'), { recursive: true });
    await writeFile(join(incoming, 'folder/SKILL.md'), skillMarkdown({ ...draft, name: 'imported' }));
    await writeFile(join(incoming, 'folder/helper.txt'), '关联文件');
    const added = await f.manager.handle('source.add', { path: incoming }) as { source: { id: string } };
    const preview = await f.manager.handle('import.preview', { sourceId: added.source.id }) as { name: string; duplicate: boolean }[];
    assert.equal(preview[0]?.name, 'imported');
    const result = await f.manager.handle('import.confirm', { fromSourceId: added.source.id, names: ['imported'], scope: 'global' }) as { receipts: unknown[] };
    assert.equal(result.receipts.length, 1);
    assert.equal(await readFile(join(f.home, 'skills/imported/helper.txt'), 'utf8'), '关联文件');
    assert.equal(await readFile(join(incoming, 'folder/helper.txt'), 'utf8'), '关联文件');
  } finally { await f.close(); }
});
test('队列取消不执行文件操作，已开始事务不因请求取消而半完成', async () => {
  const f = await fixture();
  let ready!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await f.manager.dispose();
  f.manager = new SkillsManager({ ...f.options, authorize: async (_paths, operation) => {
    if (operation === 'write') { ready(); await gate; }
  } });
  try {
    const activeController = new AbortController(), queuedController = new AbortController();
    const active = f.manager.handle('save', draft, activeController.signal);
    await started;
    const queued = f.manager.handle('save', { ...draft, name: 'cancelled' }, queuedController.signal);
    const rejected = assert.rejects(queued, /queued cancelled/);
    queuedController.abort(new Error('queued cancelled')); activeController.abort(new Error('active cancelled')); release();
    await active; await rejected;
    await access(join(f.home, 'skills/test-skill/SKILL.md'));
    await assert.rejects(access(join(f.home, 'skills/cancelled')));
  } finally { release(); await f.close(); }
});
