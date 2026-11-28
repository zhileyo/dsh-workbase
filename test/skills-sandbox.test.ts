import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import { sandboxSkillFileOperations, skillSandboxProgram } from '../src/server/skills-sandbox.js';
import { localSkillFileOperations } from '../src/server/skills-files.js';

const fileSystem = { processPathFromHostPath: (path: string) => path, sandboxMode: 'workspace-write' } as unknown as FileSystem;
const sandbox = (argv: string[]) => ({ confine: async () => ({ enforcement: 'full', argv }) }) as unknown as SandboxProvider;

test('宿主技能目录事务子进程不退出时按超时失败，不会永久挂住技能队列', { timeout: 10_000 }, async () => {
  const operations = sandboxSkillFileOperations(fileSystem, sandbox([process.execPath, '-e', 'setInterval(() => {}, 1_000)']), 80);
  const started = Date.now();
  await assert.rejects(operations.remove('/workbase/skills/skill-1', { force: true }), /超时/);
  assert.ok(Date.now() - started < 5_000, '超时必须在子进程挂住时自己结束');
});

test('宿主技能目录事务子进程正常结束时按结果返回，不额外等待超时', async () => {
  const operations = sandboxSkillFileOperations(fileSystem,
    sandbox([process.execPath, '-e', 'process.stdin.resume(); process.stdin.on("end", () => {});']), 5_000);
  await assert.doesNotReject(operations.remove('/workbase/skills/skill-2', { force: true }));
});

test('同一组畸形关联路径在本地写入与沙箱写入给出相同结论', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbase-sandbox-parity-'));
  const operations = sandboxSkillFileOperations(fileSystem,
    sandbox([process.execPath, '-e', skillSandboxProgram]), 10_000);
  const outcome = async (run: () => Promise<void>) => {
    try { await run(); return '接受'; }
    catch (error) { return `拒绝：${error instanceof Error ? error.message : String(error)}`; }
  };
  try {
    const names = ['SKILL.md', 'nested/note.txt', '', '../escape.txt', 'a\\b.txt', '/abs.txt'];
    for (const [index, name] of names.entries()) {
      const bundle = new Map([[name, Buffer.from('x')]]);
      const local = await outcome(() => localSkillFileOperations.writeBundle(join(root, 'local', String(index), 'skill'), bundle));
      const remote = await outcome(() => operations.writeBundle(join(root, 'sandbox', String(index), 'skill'), bundle));
      assert.equal(remote, local, `关联路径 ${JSON.stringify(name)} 的结论必须与本地写入一致`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
