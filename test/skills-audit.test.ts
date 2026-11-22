import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { SkillsManager } from '../src/server/skills.js';
import { fileTransaction, digest, readBundle, recoverTransaction } from '../src/server/skills-files.js';
import type { SkillReceipt } from '../src/shared/skills.js';

const restrictions = [
  { field: 'disable-model-invocation: true', modelInvocable: false, userInvocable: true },
  { field: 'model-invocable: false', modelInvocable: false, userInvocable: true },
  { field: 'user-invocable: false', modelInvocable: true, userInvocable: false },
];
for (const mode of ['upload', 'directory', 'repository'] as const) for (const restriction of restrictions) {
  test(`C01 ${mode} 保留 ${restriction.field}、未知元数据，编辑及重启 list/get 一致`, async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-audit-')));
    const ctx = new Context(), registry = new SkillRegistry(ctx);
    const document = `---\nname: audit-skill\ndescription: original\n${restriction.field}\nx-owner: team\n---\noriginal body\n`;
    const sha = 'a'.repeat(40);
    const options = { ctx, home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
      fetchMarketResource: async (url: string) => {
        if (url.includes('/commits/')) return Buffer.from(JSON.stringify({ sha }));
        if (url.includes('/git/trees/')) return Buffer.from(JSON.stringify({ truncated: false, tree: [
          { path: 'SKILL.md', type: 'blob', mode: '100644', size: Buffer.byteLength(document) },
        ] }));
        if (url.endsWith('SKILL.md')) return Buffer.from(document);
        throw new Error('unexpected repository request');
      } };
    let manager = new SkillsManager(options);
    try {
      let input: object;
      if (mode === 'upload') {
        await manager.handle('import.preview', { text: document });
        input = { text: document };
      } else if (mode === 'directory') {
        const incoming = join(home, 'incoming');
        await mkdir(join(incoming, 'skill'), { recursive: true });
        await writeFile(join(incoming, 'skill', 'SKILL.md'), document);
        const added = await manager.handle('source.add', { path: incoming }) as { source: { id: string } };
        await manager.handle('import.preview', { sourceId: added.source.id });
        input = { fromSourceId: added.source.id };
      } else {
        const preview = await manager.handle('import.preview', { repositoryUrl: 'https://github.com/example/repo/tree/main' }) as { token: string }[];
        input = { token: preview[0]!.token };
      }
      const result = await manager.handle('import.confirm', { ...input, names: ['audit-skill'], scope: 'global' }) as { receipts: SkillReceipt[]; error?: string };
      assert.equal(result.error, undefined);
      let row = result.receipts[0]!.skill;
      const invocation = { modelInvocable: restriction.modelInvocable, userInvocable: restriction.userInvocable };
      const check = async () => {
        const listed = (await registry.list()).find(skill => skill.name === 'audit-skill')!;
        assert.deepEqual(listed.invocation, invocation);
        assert.deepEqual((await registry.get('audit-skill'))?.invocation, invocation);
        const text = await readFile(join(home, 'skills', 'audit-skill', 'SKILL.md'), 'utf8');
        assert.ok(text.includes(restriction.field));
        assert.ok(text.includes('x-owner: team'));
      };
      await check();
      row = (await manager.handle('save', { id: row.id, version: row.version, name: row.name,
        description: 'edited', body: 'edited body', scope: 'global' }) as SkillReceipt).skill;
      await check();
      await manager.dispose(); manager = new SkillsManager(options);
      await check();
      assert.deepEqual((await manager.snapshot()).skills.find(skill => skill.id === row.id)?.invocation, invocation);
      await manager.dispose();
      const statePath = join(home, 'workbase', 'skills', 'state.json');
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      delete state.skills[0].invocation; delete state.skills[0].invocationName; delete state.skills[0].frontmatter;
      await writeFile(statePath, JSON.stringify(state));
      manager = new SkillsManager(options);
      await check();
      assert.deepEqual((await manager.snapshot()).skills.find(skill => skill.id === row.id)?.invocation, invocation);
    } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
  });
}

test('C04 回滚冲突后新事务不得覆盖 journal，解决冲突后可恢复并继续', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-journal-')));
  const target = join(home, 'skill'), other = join(home, 'other'), journal = join(home, 'transaction.json');
  await mkdir(target); await writeFile(join(target, 'SKILL.md'), 'old');
  try {
    await assert.rejects(fileTransaction(home, [{ path: target, expected: digest(await readBundle(target)),
      next: new Map([['SKILL.md', Buffer.from('next')]]) }], async () => {
      await writeFile(join(target, 'SKILL.md'), 'external');
      throw new Error('commit denied');
    }), /恢复副本已保留/);
    const original = await readFile(journal, 'utf8');
    const backup = JSON.parse(original).rows[0].backup as string;
    let committed = false;
    await assert.rejects(fileTransaction(home, [{ path: other, next: new Map([['SKILL.md', Buffer.from('other')]]) }],
      async () => { committed = true; }), /事务.*恢复/);
    assert.equal(committed, false);
    assert.equal(await readFile(journal, 'utf8'), original);
    assert.equal(await readFile(join(backup, 'SKILL.md'), 'utf8'), 'old');
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'external');
    await assert.rejects(access(other));
    await rm(target, { recursive: true });
    await recoverTransaction(home);
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'old');
    await fileTransaction(home, [{ path: other, next: new Map([['SKILL.md', Buffer.from('other')]]) }], async () => {});
    await assert.rejects(access(journal));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('C04 同一管理器状态写入失败且外部修改时，后续保存被阻断且旧恢复证据完整', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-manager-journal-')));
  let deny = false;
  const target = join(home, 'skills', 'audit-skill', 'SKILL.md');
  const manager = new SkillsManager({ home, projects: () => [], config: () => ({ defaultSourceId: 'dsh', defaultEnabled: true }),
    authorize: async (paths, operation) => {
      if (deny && operation === 'write' && paths.some(path => path.endsWith('state.json'))) {
        await writeFile(target, 'external edit');
        throw new Error('state denied');
      }
    } });
  const draft = { name: 'audit-skill', description: 'original', body: 'old body', scope: 'global' };
  try {
    const added = await manager.handle('save', draft) as SkillReceipt;
    deny = true;
    await assert.rejects(manager.handle('save', { ...draft, id: added.skill.id, version: added.skill.version, body: 'next body' }),
      /恢复副本已保留/);
    deny = false;
    const journal = join(manager.directory, 'transaction.json'), original = await readFile(journal, 'utf8');
    await assert.rejects(manager.handle('save', { ...draft, name: 'other' }), /事务.*恢复/);
    assert.equal(await readFile(journal, 'utf8'), original);
    const backup = JSON.parse(original).rows.find((row: { path: string }) => row.path === join(home, 'skills', 'audit-skill')).backup;
    assert.match(await readFile(join(backup, 'SKILL.md'), 'utf8'), /old body/);
    assert.equal(await readFile(target, 'utf8'), 'external edit');
    await assert.rejects(access(join(home, 'skills', 'other')));
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});

test('C04 并发目录事务独占journal，失败者不删除正在提交事务的日志', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'skills-exclusive-journal-')));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const jobs = ['one', 'two'].map(name => fileTransaction(home,
    [{ path: join(home, name), next: new Map([['SKILL.md', Buffer.from(name)]]) }], async () => { await gate; }));
  try {
    const first = await Promise.race(jobs.map(job => job.then(() => 'unexpected success', error => String(error))));
    assert.match(first, /EEXIST|事务.*恢复/);
    const journal = await readFile(join(home, 'transaction.json'), 'utf8');
    assert.equal(JSON.parse(journal).rows.length, 1);
    release();
    const results = await Promise.allSettled(jobs);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    await assert.rejects(access(join(home, 'transaction.json')));
  } finally { release(); await Promise.allSettled(jobs); await rm(home, { recursive: true, force: true }); }
});
