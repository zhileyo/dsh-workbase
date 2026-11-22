import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RulesSave } from '../src/client/rules-save.js';
import { defaultProjectRules } from '../src/shared/project-rules.js';

test('串行保存采用最新确认版本，保存期间继续输入不被响应覆盖', async () => {
  const calls: any[] = [];
  let release!: () => void;
  const saver = new RulesSave(defaultProjectRules(), async command => {
    calls.push(command);
    if (calls.length === 1) await new Promise<void>(resolve => { release = resolve; });
  }, () => {}, 60000);
  const first = defaultProjectRules(); first.global.content = '第一版';
  saver.update(first);
  const pending = saver.flush();
  const second = structuredClone(first); second.global.content = '输入第二版';
  saver.update(second); release();
  assert.equal(await pending, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].expectedRules, calls[0].rules);
  assert.equal(saver.draft.global.content, '输入第二版');
  assert.equal(saver.dirty, false); saver.dispose();
});

test('无效草稿不阻塞合法规则，失败保留输入且显式重试，组合输入不写入', async () => {
  const calls: any[] = []; let fail = true;
  const saver = new RulesSave(defaultProjectRules(), async command => { calls.push(command); if (fail) throw Error('文件冲突'); }, () => {}, 60000);
  const value = defaultProjectRules();
  value.global = { enabled: true, content: '' };
  value.projects = [{ id: 'r', name: '规则', content: '正文', projectIds: [], enabled: false }];
  saver.composition(true); saver.update(value);
  assert.equal(await saver.flush(), false); assert.equal(calls.length, 0);
  saver.composition(false);
  assert.equal(await saver.flush(), false); assert.equal(saver.error, '文件冲突');
  assert.deepEqual(saver.draft, value);
  assert.equal(await saver.flush(), false); assert.equal(calls.length, 1);
  fail = false;
  assert.equal(await saver.retry(), false);
  assert.equal(saver.saved.projects.length, 1); assert.equal(saver.saved.global.enabled, false);
  const valid = structuredClone(value); valid.global.content = '全局'; saver.update(valid);
  assert.equal(await saver.flush(), true); assert.equal(saver.error, '');
  saver.dispose();
});

test('请求期间删除规则继续排队，不用旧响应复活已删除草稿', async () => {
  const calls: any[] = []; let release!: () => void;
  const initial = defaultProjectRules();
  initial.projects = [{ id: 'r', name: '规则', enabled: false, content: '原文', projectIds: [] }];
  const saver = new RulesSave(initial, async command => {
    calls.push(command);
    if (calls.length === 1) await new Promise<void>(resolve => { release = resolve; });
  }, () => {}, 60000);
  const draft = structuredClone(initial); draft.projects[0]!.content = '新正文';
  saver.update(draft); const pending = saver.flush();
  saver.update(defaultProjectRules()); release();
  assert.equal(await pending, true);
  assert.equal(calls.length, 2); assert.equal(calls[1].rules.projects.length, 0);
  assert.deepEqual(calls[1].expectedRules, calls[0].rules);
  assert.equal(saver.draft.projects.length, 0); saver.dispose();
});
