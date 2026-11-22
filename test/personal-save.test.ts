import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalSave } from '../src/client/personal-save.js';
import { personalFiles } from '../src/shared/personalization.js';

test('档案部分提交失败后重试仅保存未提交文件，保留各文件草稿', async () => {
  const writes: string[] = [];
  let fail = true;
  const save = new PersonalSave(async command => {
    if (command.op === 'personal-list') return { directory: '/profiles', active: true,
      documents: personalFiles.map(file => ({ file, content: '', version: null })) };
    if (command.op !== 'personal-save') throw new Error('unexpected');
    writes.push(command.file);
    if (command.file === 'USER.md' && fail) throw new Error('拒绝写入');
    return { file: command.file, content: command.content, version: 'saved' };
  }, () => {});
  await save.load();
  save.update('IDENTITY.md', 'identity');
  save.update('USER.md', 'user');
  assert.equal(await save.flush(), false);
  assert.equal(save.dirty, true);
  fail = false;
  assert.equal(await save.flush(), true);
  assert.deepEqual(writes, ['IDENTITY.md', 'USER.md', 'USER.md']);
});
