import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UiMemory } from '../src/client/api.js';

test('界面记忆内容未变时不重复落盘，变更即时写入且合并重复保存', () => {
  const writes: string[] = [];
  const storage = { getItem: () => null, setItem: (_key: string, value: string) => { writes.push(value); }, removeItem() {} };
  const memory = new UiMemory(storage);
  memory.search = '原搜索';
  // 记忆是「刷新后要接着用」的状态：写入必须同步完成，不能等某个定时器再落盘。
  assert.equal(writes.length, 1, '变更立即落盘');
  memory.save();
  memory.flush();
  assert.equal(writes.length, 1, '内容没有变化时不重复写');
  memory.search = '原搜索';
  assert.equal(writes.length, 1, '写回同值同样不落盘');
  memory.search = '新词';
  assert.equal(writes.length, 2, '内容真的变了才写');
  assert.equal(JSON.parse(writes[1]!).search, '新词');
  const restart = new UiMemory({ getItem: () => writes[1]!, setItem() {}, removeItem() {} });
  assert.equal(restart.search, '新词', '重新初始化后沿用已写入的记忆');
});
