import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UiMemory, type ClientPort } from '../src/client/api.js';
import { launchMessage } from '../src/client/launch.js';
import type { Command } from '../src/shared/commands.js';
import { commandSchema } from '../src/shared/commands.js';

test('首消息失败后重启仍复用原会话、消息标识及选中配置，成功才清草稿', async () => {
  let stored = '';
  const storage = { getItem: () => stored || null, setItem: (_key: string, value: string) => { stored = value; }, removeItem: (_key: string) => {} };
  let memory = new UiMemory(storage);
  memory.composer.draft = '必须保留';
  const calls: Command[] = [];
  let fail = true;
  const api = { call: async (command: Command) => {
    calls.push(command);
    if (command.op === 'begin-session') return { sessionId: 's-original' };
    if (fail) throw new Error('网络断开');
    return { accepted: true };
  } } as ClientPort;
  const input = { projectId: 'p', preset: 'coding', provider: 'real-provider', model: 'real-model', text: '必须保留' };
  await assert.rejects(launchMessage(api, memory, input, () => '11111111-1111-4111-8111-111111111111'), /断开/);
  assert.equal(memory.composer.draft, '必须保留');
  memory = new UiMemory(storage);
  fail = false;
  assert.equal(await launchMessage(api, memory, { ...input, text: '不应替换原消息' }), 's-original');
  assert.equal(calls.filter(c => c.op === 'begin-session').length, 1);
  assert.deepEqual(calls[1], calls[2]);
  assert.equal(memory.composer.pending, null);
  assert.equal(memory.composer.draft, '');
});

test('首消息保留用户原始换行与空格，纯空白被合同拒绝', () => {
  const command = { op: 'submit-message', projectId: 'p', sessionId: 's', provider: 'provider', model: 'model', text: '  第一行\n第二行  ', requestId: '11111111-1111-4111-8111-111111111111' };
  const parsed = commandSchema.parse(command);
  assert.equal(parsed.op === 'submit-message' && parsed.text, command.text);
  assert.equal(commandSchema.safeParse({ ...command, text: '  \n ' }).success, false);
});

test('本机搜索词、草稿、分组滚动及首页位置跨重新初始化恢复', () => {
  let value = '';
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, removeItem: (_key: string) => {} };
  const memory = new UiMemory(storage);
  memory.search = '原搜索';
  memory.homeScroll = 210;
  memory.detail('p').draft = '待办草稿';
  memory.detail('p').done = 320;
  const restored = new UiMemory(storage);
  assert.equal(restored.search, '原搜索');
  assert.equal(restored.homeScroll, 210);
  assert.equal(restored.detail('p').draft, '待办草稿');
  assert.equal(restored.detail('p').done, 320);
});
