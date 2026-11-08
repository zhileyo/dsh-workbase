import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractConversation } from '../src/shared/session.js';

test('正文提取只保留用户与助手的文本消息，注入、工具输出与空消息不算正文', () => {
  const records = [
    { type: 'event', event: { type: 'user/message', seq: 1, time: 10, data: { message: { content: '第一问', source: { kind: 'user' } } } } },
    { type: 'event', event: { type: 'user/message', seq: 2, time: 11, data: { message: { content: '插件注入', source: { kind: 'plugin' } } } } },
    { type: 'event', event: { type: 'assistant/message', seq: 3, time: 12, data: { message: { content: [{ type: 'text', text: '第一答' }, { type: 'tool_use', text: 'x' }] } } } },
    { type: 'event', event: { type: 'tool/result', seq: 4, time: 13, data: { content: '工具输出' } } },
    { type: 'event', event: { type: 'assistant/message', seq: 5, time: 14, data: { content: '   ' } } },
    { type: 'event', event: { type: 'user/message', seq: 6, time: 15, data: { content: '无包装结构' } } },
  ];
  const { messages } = extractConversation(records);
  assert.deepEqual(messages.map(m => [m.seq, m.role]), [[1, 'user'], [3, 'assistant'], [6, 'user']]);
  assert.equal(messages[1]!.text, '第一答');
  assert.equal(messages[2]!.text, '无包装结构');
  assert.equal(messages[0]!.time, 10);
});
