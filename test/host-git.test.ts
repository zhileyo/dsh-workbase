import assert from 'node:assert/strict';
import test from 'node:test';
import { gitHeadVerdict } from '../src/server/host.js';

test('只有 git 明确说不是仓库才降级为无分支，其它失败显式报错', () => {
  assert.deepEqual(gitHeadVerdict({ code: 0, out: 'main\n', err: '' }), { kind: 'ready', current: 'main' });

  const absent = gitHeadVerdict({
    code: 128, out: '',
    err: 'fatal: not a git repository (or any of the parent directories): .git',
  });
  assert.deepEqual(absent, { kind: 'absent' }, '明确的「不是仓库」降级为无分支');

  const missing = gitHeadVerdict({ code: -1, out: '', err: 'git 命令不可用' });
  assert.equal(missing.kind, 'failed', 'git 未安装不能冒充「不是仓库」');
  assert.match((missing as { message: string }).message, /git 命令不可用/);

  const denied = gitHeadVerdict({
    code: 128, out: '',
    err: "fatal: detected dubious ownership in repository at '/repo'",
  });
  assert.equal(denied.kind, 'failed', '权限或仓库损坏不能冒充「不是仓库」');
  assert.match((denied as { message: string }).message, /dubious ownership/);

  const silent = gitHeadVerdict({ code: 1, out: '', err: '' });
  assert.equal(silent.kind, 'failed', '没有任何 stderr 时按退出码报错');
  assert.match((silent as { message: string }).message, /退出码 1/);
});
