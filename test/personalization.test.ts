import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Personalization } from '../src/server/personalization.js';

test('档案保存真实文件、保留空白和模板变量、并检测外部编辑', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'wb-personal-'));
  try {
    const manager = new Personalization(home);
    const before = await manager.list();
    assert.equal(before.documents.length, 4);
    assert.equal(before.documents[0]!.content, '');
    const saved = await manager.save('IDENTITY.md', before.documents[0]!.version, '  名字：芽芽\n{{literal}}\n');
    assert.equal(await readFile(path.join(home, 'IDENTITY.md'), 'utf8'), saved.content);
    assert.match(manager.prompt(), /\{\{literal\}\}/);
    await writeFile(path.join(home, 'IDENTITY.md'), '外部修改');
    await assert.rejects(manager.save('IDENTITY.md', saved.version, '覆盖'), /已.*修改|版本/);
    assert.equal(await readFile(path.join(home, 'IDENTITY.md'), 'utf8'), '外部修改');
    await assert.rejects(manager.save('../AGENTS.md' as never, null, '越界'));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('符号链接档案拒绝读取和写入', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'wb-personal-'));
  try {
    await writeFile(path.join(home, 'outside'), '保留');
    await symlink(path.join(home, 'outside'), path.join(home, 'USER.md'));
    const manager = new Personalization(home);
    await assert.rejects(manager.list(), /普通文件|链接/);
    await assert.rejects(manager.save('USER.md', null, '覆盖'));
    assert.equal(await readFile(path.join(home, 'outside'), 'utf8'), '保留');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('官方文件服务拒绝写入时不降级', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'wb-personal-'));
  try {
    const fs = {
      processPathFromHostPath: (value: string) => value,
      lstat: async (file: string) => file === home ? { type: 'directory' } : undefined,
      resolve: async () => ({}), stat: async () => undefined,
      writeText: async () => { throw new Error('权限拒绝'); },
    };
    const manager = new Personalization(home, fs as never);
    await assert.rejects(manager.save('USER.md', null, 'test'), /权限拒绝/);
    await assert.rejects(readFile(path.join(home, 'USER.md')), { code: 'ENOENT' });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('官方文件服务优先写入，使用版本意图并限定档案目录', async () => {
  let content = '', version: string | undefined;
  let intent: unknown, permission: unknown;
  const fs = {
    processPathFromHostPath: () => '/home',
    lstat: async (file: string) => file === '/home' ? { type: 'directory' } : version ? { type: 'file', size: content.length } : undefined,
    resolve: async (filename: string) => ({ filename }),
    stat: async () => version ? { type: 'file', version, size: content.length } : undefined,
    readText: async () => content,
    writeText: async (_target: unknown, value: string, expected: unknown, _signal: unknown, access: unknown) => {
      intent = expected; permission = access; content = value; version = `v${content.length}`;
    },
    sandboxMode: 'workspace-write',
  };
  const manager = new Personalization('/host/home', fs as never);
  const saved = await manager.save('USER.md', null, '用户');
  assert.deepEqual(intent, { kind: 'createIfAbsent' });
  assert.deepEqual(permission, { mode: 'workspace-write', workspaceRoot: '/home' });
  await manager.save('USER.md', saved.version, '新用户');
  assert.deepEqual(intent, { kind: 'replaceIfVersion', version: saved.version });
  assert.match(manager.prompt(), /新用户/);
});
